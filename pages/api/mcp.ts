import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createInventariumServer } from '../../lib/mcp/server';
import { authChallenge, authenticate, countToolCall, DAILY_TOOL_CALLS } from '../../lib/mcp/auth';

// MCP-сервер Інвентаріуму (Streamable HTTP, stateless): /api/mcp.
//
// Доступ лише для користувачів сайту: без OAuth-токена — 401, і клієнт сам
// проводить вхід через Supabase Auth (lib/mcp/auth.ts). Кожен виклик
// інструмента зараховується в добову квоту акаунта.
//
// Дані при цьому читаються anon-ключем, а не токеном користувача: інструменти
// віддають лише публічне, і права конкретного акаунта їм не потрібні.
// Service role тут не використовується і не повинен.
//
// Від масового вивантаження захищають квота, обмеження інструментів
// (lib/mcp/filters.ts) і rate limit у Vercel Firewall (див. README, «MCP-сервер»).

export const config = {
  maxDuration: 60,
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonRpcError = (res: NextApiResponse, status: number, code: number, message: string) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * Відмова у виклику інструмента як його результат, а не збій протоколу:
 * так агент перекаже причину людині («ліміт вичерпано»), а не «сервер недоступний».
 */
const toolRefusal = (res: NextApiResponse, id: unknown, text: string) =>
  res.status(200).json({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }] } });

// Аргументи обрізаємо: лог потрібен, щоб бачити характер запитів, а не зберігати їх
const shortArgs = (args: unknown) => {
  const text = JSON.stringify(args ?? {});
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

/** Рядок лога на виклик: хто, що і з якими аргументами, скільки тривало. */
function logCall(req: NextApiRequest, userId: string, calls: number | null, status: number, ms: number) {
  const message = req.body;
  if (!message?.method) return;
  const isToolCall = message.method === 'tools/call';
  console.log(
    `[mcp] user=${userId} method=${message.method}` +
      (isToolCall ? ` tool=${message.params?.name} args=${shortArgs(message.params?.arguments)} calls=${calls}` : '') +
      ` status=${status} ms=${ms}`
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Без сесій серверу нема чого стрімити в GET і нема чого закривати в DELETE
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonRpcError(res, 405, -32000, 'Method not allowed.');
  }

  // Пакет JSON-RPC вклав би сотні викликів в один HTTP-запит і обійшов би
  // квоту та rate limit. Актуальна специфікація MCP (2025-06-18) пакети й так
  // прибрала, тож клієнтам вони не потрібні.
  if (Array.isArray(req.body)) {
    return jsonRpcError(res, 400, -32600, 'Batch requests are not supported.');
  }

  const auth = await authenticate(req);
  if ('error' in auth) {
    res.setHeader('WWW-Authenticate', authChallenge(req, auth.error));
    return jsonRpcError(res, 401, -32001, 'Authentication required.');
  }

  const startedAt = Date.now();
  const message = req.body;
  let calls: number | null = null;

  if (message?.method === 'tools/call') {
    try {
      calls = await countToolCall(auth.token);
    } catch (err) {
      // Без лічильника квоту не перевірити — відмовляємо, а не пускаємо без обмежень
      console.error('[mcp] Не вдалося зарахувати виклик у квоту:', err);
      return toolRefusal(res, message.id, 'Сервіс Інвентаріуму тимчасово недоступний. Спробуйте пізніше.');
    }
    if (calls > DAILY_TOOL_CALLS) {
      logCall(req, auth.userId, calls, 200, Date.now() - startedAt);
      return toolRefusal(
        res,
        message.id,
        `Добовий ліміт — ${DAILY_TOOL_CALLS} запитів до реєстру Інвентаріум — вичерпано. Він оновиться опівночі за UTC.`
      );
    }
  }

  const server = createInventariumServer(supabase);
  // JSON замість SSE: відповіді короткі, а функція на Vercel не тримає стрім
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

  res.on('close', () => {
    logCall(req, auth.userId, calls, res.statusCode, Date.now() - startedAt);
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] Помилка обробки запиту:', err);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
  }
}
