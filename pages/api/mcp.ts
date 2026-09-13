import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createInventariumServer } from '../../lib/mcp/server';

// MCP-сервер Інвентаріуму (Streamable HTTP, stateless): /api/mcp.
// Лише читання публічних даних, тому anon-ключ — ті самі права, що в гостя сайту.
// Service role тут не використовується і не повинен.
//
// Від масового вивантаження захищають обмеження інструментів (lib/mcp/filters.ts)
// і rate limit за IP у Vercel Firewall (див. README, розділ «MCP-сервер»).

export const config = {
  maxDuration: 60,
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonRpcError = (res: NextApiResponse, status: number, code: number, message: string) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * Хеш IP замість самої адреси: для лога досить відрізнити одне джерело від
 * іншого (сотні викликів поспіль — ознака вивантаження), а сирі IP — персональні
 * дані, яким нема чого лежати в логах.
 */
function clientHash(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || req.socket.remoteAddress || '';
  return createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

// Аргументи обрізаємо: лог потрібен, щоб бачити характер запитів, а не зберігати їх
const shortArgs = (args: unknown) => {
  const text = JSON.stringify(args ?? {});
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

/** Рядок лога на виклик: хто (хеш), що і з якими аргументами, скільки тривало. */
function logCall(req: NextApiRequest, status: number, ms: number) {
  const message = req.body;
  if (!message?.method) return;
  const isToolCall = message.method === 'tools/call';
  console.log(
    `[mcp] client=${clientHash(req)} method=${message.method}` +
      (isToolCall ? ` tool=${message.params?.name} args=${shortArgs(message.params?.arguments)}` : '') +
      ` status=${status} ms=${ms}`
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Без сесій серверу нема чого стрімити в GET і нема чого закривати в DELETE
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonRpcError(res, 405, -32000, 'Method not allowed.');
  }

  // Пакет JSON-RPC вклав би сотні викликів в один HTTP-запит, а rate limit у
  // Vercel Firewall рахує саме запити. Актуальна специфікація MCP (2025-06-18)
  // пакети й так прибрала, тож клієнтам вони не потрібні.
  if (Array.isArray(req.body)) {
    return jsonRpcError(res, 400, -32600, 'Batch requests are not supported.');
  }

  const startedAt = Date.now();
  const server = createInventariumServer(supabase);
  // JSON замість SSE: відповіді короткі, а функція на Vercel не тримає стрім
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

  res.on('close', () => {
    logCall(req, res.statusCode, Date.now() - startedAt);
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
