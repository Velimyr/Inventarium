import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("📥 API /api/chat отримав запит");

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    console.log("🔹 Запит користувача:", query);

    // 1. Створюємо embedding
    const embeddingResp = await client.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
    });
    const userEmbedding = embeddingResp.data[0].embedding;
    console.log("🧩 Embedding згенеровано, розмір:", userEmbedding.length);

    // 2. Пошук у Qdrant
    const qdrant_collection = process.env.QDRANT_COLLECTION!
    
    const searchResp = await qdrant.search(qdrant_collection, {
      vector: userEmbedding,
      limit: 5,
      with_payload: true,
    });

    console.log(`🔹 Qdrant повернув ${searchResp.length} результатів`);
    console.log("📦 Повна відповідь Qdrant (перші 2 записи):", JSON.stringify(searchResp.slice(0, 2), null, 2));

    // 3. Нормалізація
    const allRecords = (searchResp || []).map((item: any) => {
      const p = item.payload ?? {};
      return {
        id: p.record_id ?? item.id,
        case_signature: p.case_signature ?? p.additional_case_signature ?? null,
        old_province: p.old_province ?? null,
        old_district: p.old_district ?? null,
        old_community: p.old_community ?? null,
        old_settlement_type: p.old_settlement_type ?? null,
        old_settlement_name: p.old_settlement_name ?? null,
        current_region: p.current_region ?? null,
        current_district: p.current_district ?? null,
        current_community: p.current_community ?? null,
        current_settlement_type: p.current_settlement_type ?? null,
        current_settlement_name: p.current_settlement_name ?? null,
        case_date: p.case_date ?? null,
        inventory_year: p.inventory_year ?? null,
        case_title: p.case_title ?? null,
        notes: p.notes ?? null,
        similarity: typeof item.score === 'number' ? item.score : null,
      };
    });

    console.log("📋 Нормалізовані записи:", JSON.stringify(allRecords, null, 2));

    const MIN_SIMILARITY = 0.2;
    const filtered = allRecords.filter(r => r.similarity === null || r.similarity >= MIN_SIMILARITY);
    console.log(`🔎 Відібрано ${filtered.length} записів (після фільтрування за схожістю)`);

    // 4. Формування контексту
    const context = filtered
      .map((r: any) => {
        const fields = [
          `id: ${r.id}`,
          `case_signature: ${r.case_signature ?? ''}`,
          r.old_province, r.old_district, r.old_community, r.old_settlement_type, r.old_settlement_name,
          r.current_region, r.current_district, r.current_community, r.current_settlement_type, r.current_settlement_name,
          r.case_date, r.inventory_year, r.case_title, r.notes,
          typeof r.similarity === 'number' ? `similarity: ${r.similarity.toFixed(3)}` : null
        ].filter(f => f && String(f).trim() !== '');
        return fields.join(', ');
      })
      .join('\n');

    const shortContext = filtered
      .map((r: any, idx: number) => `${idx + 1}. ${r.case_signature ?? '—'}: /record/${r.id}`)
      .join('\n');

    console.log("🧾 Короткий контекст для GPT:\n", shortContext);
    console.log("📚 Повний контекст (для аналізу GPT):\n", context);

    // 5. Формуємо prompt
    const prompt = `
Ти архівний асистент. Відповідай українською на питання користувача.

Використовуй записи для оцінки релевантності на основі запиту користувача "${query}". 
Повертай тільки: 
- якщо записи знайдено, повідом "За вашим запитом знайдено N записів" і короткий список: ${shortContext}

Повний контекст (для аналізу, не для показу користувачу): 
${context}

Питання: ${query}
`;

    // 6. Викликаємо ChatGPT
    console.log("🤖 Надсилаємо запит до ChatGPT...");
    const chatResp = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    let answer = chatResp.choices[0].message.content;
    console.log("💬 Відповідь ChatGPT:", answer);

    // Постпроцесинг: Markdown-посилання
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host ? `${protocol}://${req.headers.host}` : 'https://inventarium.org.ua';
    answer = answer.replace(/\/record\/([a-f0-9-]{36})/g, (_, id) => `[Переглянути інвентар](${host}/record/${id})`);


    //const host = req.headers.host ? `${req.headers.host}` : 'https://inventarium.org.ua';
    //answer = answer.replace(
    //  /\/record\/([a-f0-9-]{36})/g,
    //  (_, id) => `[Переглянути інвентар](${host}/record/${id})`
    //);

    console.log("✅ Остаточна відповідь після обробки Markdown:", answer);

    res.status(200).json({ answer });

  } catch (err) {
    console.error("❌ API помилка:", err);
    res.status(500).json({ error: 'Internal server error', details: (err as any).message });
  }
}
