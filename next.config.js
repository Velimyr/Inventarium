/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MCP-сервер читає довідники з public/data з диска (lib/server/publicData.ts).
  // Файли з public/ Vercel роздає з CDN, але у функцію не кладе — додаємо явно.
  outputFileTracingIncludes: {
    '/api/mcp': ['./public/data/*.json', './public/data/historical/areas-*.geojson'],
  },
};

module.exports = nextConfig;
