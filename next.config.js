/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MCP-сервер читає довідники з public/data з диска (lib/server/publicData.ts).
  // Файли з public/ Vercel роздає з CDN, але у функцію не кладе — додаємо явно.
  outputFileTracingIncludes: {
    '/api/mcp': ['./public/data/*.json', './public/data/historical/areas-*.geojson'],
  },
  // rewrites тут навмисне немає: будь-яке правило змушує кожну статичну сторінку
  // чекати клієнтського replace, перш ніж router.isReady стане true (див.
  // next/dist/client/index.js), — а на isReady тримається, наприклад, /search.
  // Тому метадані OAuth для MCP віддаються з /api/oauth-protected-resource, а
  // адресу клієнт бере із заголовка WWW-Authenticate (lib/mcp/auth.ts).
};

module.exports = nextConfig;
