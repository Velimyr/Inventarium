import type { NextApiRequest, NextApiResponse } from 'next';
import { AUTHORIZATION_SERVER, resourceUrl } from '../../lib/mcp/auth';

// Метадані захищеного ресурсу (RFC 9728) для MCP-сервера /api/mcp.
//
// Отримавши 401, MCP-клієнт іде сюди (адреса — у WWW-Authenticate), дізнається
// сервер авторизації — Supabase Auth — і далі сам реєструється та проводить вхід.
// Чому не /.well-known/oauth-protected-resource — див. next.config.js.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  // Метадані публічні; браузерні клієнти (MCP Inspector) читають їх з іншого походження
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  return res.status(200).json({
    resource: resourceUrl(req),
    authorization_servers: [AUTHORIZATION_SERVER],
    bearer_methods_supported: ['header'],
    resource_name: 'Інвентаріум',
  });
}
