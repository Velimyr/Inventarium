import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { supabase } from '../../lib/supabaseClient';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("📥 API /api/chat отримав запит");

  try {
    const { query } = req.body;
    if (!query) {
      console.warn("⚠️ Пустий query");
      return res.status(400).json({ error: 'Query required' });
    }
    console.log("🔹 Запит користувача:", query);

    // 1. Генеруємо embedding користувача
    const embeddingResp = await client.embeddings.create({
      //model: 'text-embedding-3-small',
      model: 'text-embedding-3-large',

      input: query,
    });
    const userEmbedding = embeddingResp.data[0].embedding;

    //console.log("🔹 Embedding успішно створено, розмір:", userEmbedding.length);
    //console.log("🔹 Embedding:", userEmbedding);

    // 2. Шукаємо топ-5 записів у Supabase по embedding
    const { data: allRecords, error: rpcError } = await supabase.rpc('match_records', {
      query_embedding: userEmbedding,
      top_count: 5
    });
    if (rpcError) {
      console.error("❌ Supabase RPC помилка:", rpcError);
      return res.status(500).json({ error: "Supabase RPC error", details: rpcError });
    }

    console.log(`🔹 Знайдено всього релевантних записів: ${allRecords?.length ?? 0}`);
    console.log("🔹 Дані, які повернула функція:", JSON.stringify(allRecords, null, 2));

    // 3. Формуємо контекст для GPT
    const context = allRecords
      .map((r: any) => {
        const fields = [
          `id: ${r.id}`, `case_signature: ${r.case_signature || r.additional_case_signature}`,
          r.old_province, r.old_district, r.old_community, r.old_settlement_type, r.old_settlement_name,
          r.current_region, r.current_district, r.current_community, r.current_settlement_type, r.current_settlement_name,
          r.case_date, r.inventory_year, r.case_title, r.notes, r.similarity
        ].filter(f => f !== null && f !== undefined && f.toString().trim() !== '' && f.toString().trim().toUpperCase() !== 'N/A');

        //const signature = r.case_signature || r.additional_case_signature || '';
        //const url = `/record/${r.id}`;
        //return `- ${signature}: ${url}${fields.length ? ` (${fields.join(", ")})` : ''}`;
        return fields.join(", ");
      })
      .filter(Boolean)
      .join("\n");

    const shortContext = allRecords
      .map((r, idx) => `${idx + 1}. ${r.case_signature}: /record/${r.id}`)
      .join('\n');

    console.log("🔹 Повний контекст:", context);
    console.log("🔹 Короткий контекст:", shortContext);

    const prompt = `
Ти архівний асистент. Відповідай українською на питання користувача.

Використовуй записи для оцінки релевантності на основі запиту користувача "${query}". 
Повертай тільки: 
- якщо записи знайдено, повідом "За вашим запитом знайдено N записів" і короткий список: ${shortContext}

Повний контекст (для аналізу, не для показу користувачу): 
${context}

Питання: ${query}
`;

    // 4. Викликаємо ChatGPT
    const chatResp = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    });


    console.log("🔹 ChatGPT завершився успішно");

    let answer = chatResp.choices[0].message.content;

    // Постпроцесинг: замінюємо відносні URL на повні та робимо Markdown-посилання
    const host = req.headers.host ? `${req.headers.host}` : 'https://inventarium.org.ua';
    answer = answer.replace(
      /\/record\/([a-f0-9-]{36})/g,
      (_, id) => `[Переглянути інвентар](${host}/record/${id})`
    );

    res.status(200).json({ answer });
  } catch (err) {
    console.error("❌ API помилка:", err);
    res.status(500).json({ error: 'Internal server error', details: (err as any).message });
  }
}
