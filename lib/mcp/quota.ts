// Добова квота MCP-сервера. Окремим модулем, бо її показує й сторінка згоди
// (pages/oauth/consent.tsx), а lib/mcp/auth.ts тягне серверний клієнт Supabase.
// Лічильник — sql/2026-09-13_mcp_usage.sql.

/** Однакова для всіх стеля викликів інструментів на добу (UTC). */
export const DAILY_TOOL_CALLS = 100;
