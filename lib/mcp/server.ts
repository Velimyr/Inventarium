// MCP-сервер Інвентаріуму: збирає інструменти, ресурси й prompt в один McpServer.
//
// Сервер створюється на кожен HTTP-запит (див. pages/api/mcp.ts): у stateless-
// режимі SDK не можна ділити один екземпляр між запитами — id JSON-RPC різних
// клієнтів перетиналися б.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SERVER_INSTRUCTIONS } from './guide';
import { registerSearchTools } from './tools/search';
import { registerRecordTools } from './tools/records';
import { registerSettlementTools } from './tools/settlements';
import { registerHistoricalTools } from './tools/historical';
import { registerKeyTools } from './tools/keys';
import { registerUnidentifiedTools } from './tools/unidentified';
import { registerReferenceTools } from './tools/reference';

export function createInventariumServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer(
    { name: 'inventarium', title: 'Інвентаріум', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerSearchTools(server, supabase);
  registerRecordTools(server, supabase);
  registerSettlementTools(server, supabase);
  registerHistoricalTools(server, supabase);
  registerKeyTools(server, supabase);
  registerUnidentifiedTools(server, supabase);
  registerReferenceTools(server);

  return server;
}
