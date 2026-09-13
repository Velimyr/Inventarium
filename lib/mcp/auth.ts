// Авторизація MCP-сервера: вхід обов'язковий для всіх (OAuth 2.1).
//
// Сервер авторизації — Supabase Auth (Authentication → OAuth Server): він
// реєструє клієнтів (Claude, ChatGPT…), проводить вхід і видає токени — звичайні
// Supabase JWT користувача. Сторінка згоди — pages/oauth/consent.tsx. Тут лише
// ресурсна частина: перевірити токен, підказати клієнту, де авторизуватися,
// і порахувати добову квоту (sql/2026-09-13_mcp_usage.sql).
//
// Чому квота за акаунтом, а не за IP: хмарні клієнти звертаються з IP свого
// постачальника, спільних для всіх користувачів.

import type { NextApiRequest } from 'next';
import { createClient } from '@supabase/supabase-js';

export { DAILY_TOOL_CALLS } from './quota';

export const MCP_PATH = '/api/mcp';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Issuer Supabase Auth; його метадані — /.well-known/oauth-authorization-server/auth/v1. */
export const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`;

const serverClient = (accessToken?: string) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });

const verifier = serverClient();

const header = (req: NextApiRequest, name: string) => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.split(',')[0].trim();
};

/**
 * Адреса, до якої підключився клієнт: прод, preview чи localhost. Ресурс у
 * метаданих має збігатися саме з нею, інакше клієнт відкине токен як виданий
 * для іншого сервера.
 */
export function requestOrigin(req: NextApiRequest): string {
  const host = header(req, 'x-forwarded-host') || req.headers.host || 'localhost:3000';
  const proto = header(req, 'x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const resourceUrl = (req: NextApiRequest) => `${requestOrigin(req)}${MCP_PATH}`;

/**
 * Метадані ресурсу (RFC 9728). Не під /.well-known: для цього потрібні rewrites,
 * які зачіпають увесь сайт (див. next.config.js). Специфікація MCP дозволяє
 * будь-яку адресу, якщо вона передана в WWW-Authenticate.
 */
export const resourceMetadataUrl = (req: NextApiRequest) => `${requestOrigin(req)}/api/oauth-protected-resource`;

export type AuthResult = { userId: string; token: string } | { error: 'missing_token' | 'invalid_token' };

/**
 * Користувач за Bearer-токеном. Приймаємо лише токен залогіненого користувача:
 * сам anon-ключ — теж валідний JWT (role anon), але без користувача за ним.
 */
export async function authenticate(req: NextApiRequest): Promise<AuthResult> {
  const authorization = header(req, 'authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  if (!token) return { error: 'missing_token' };

  // getClaims перевіряє підпис за JWKS, а для проєктів зі спільним секретом
  // звертається до Auth-сервера — так само, як getUser. Зіпсований за форматом
  // JWT він не повертає помилкою, а кидає виняток — для клієнта це той самий
  // недійсний токен, а не збій сервера.
  try {
    const { data, error } = await verifier.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub || claims.role !== 'authenticated') return { error: 'invalid_token' };
    return { userId: claims.sub, token };
  } catch {
    return { error: 'invalid_token' };
  }
}

/**
 * Заголовок WWW-Authenticate для 401: з нього клієнт дізнається, де метадані
 * ресурсу, а звідти — адресу Supabase Auth. Лише ASCII: інші символи в
 * заголовку Node не пропустить.
 */
export function authChallenge(req: NextApiRequest, error: 'missing_token' | 'invalid_token'): string {
  const params = [`resource_metadata="${resourceMetadataUrl(req)}"`];
  // Без токена RFC 6750 радить не вказувати помилку — клієнт просто починає вхід
  if (error === 'invalid_token') {
    params.push('error="invalid_token"', 'error_description="The access token is invalid or expired"');
  }
  return `Bearer ${params.join(', ')}`;
}

/** Зараховує виклик інструмента користувачеві й повертає, скільки їх уже за добу. */
export async function countToolCall(accessToken: string): Promise<number> {
  const { data, error } = await serverClient(accessToken).rpc('mcp_count_call');
  if (error) throw error;
  return Number(data);
}
