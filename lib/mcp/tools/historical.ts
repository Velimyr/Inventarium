import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findSettlementByCode } from '../../../components/keys/regionData';
import { findHistoricalArea, HISTORICAL_PERIODS } from '../../server/historicalAreas';
import { loadRegionStructure } from '../../server/publicData';
import { compact, currentPlaceLabel, errorResult, jsonResult, must, placeLabel, run, UUID_PATTERN } from '../format';

export function registerHistoricalTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'historical_divisions',
    {
      title: 'Історичний адмінподіл',
      description:
        `У якому повіті (полку тощо), воєводстві й державі лежав населений пункт у ${HISTORICAL_PERIODS.join(' і ')} роках — ` +
        'за полігонами історичного шару карти Інвентаріуму. Підказує, у фондах якої адміністрації шукати документи. ' +
        'Точку задає одне з: code населеного пункту (find_settlement), inventory_id запису або latitude + longitude. ' +
        'Межі наближені: для пунктів біля кордону одиниць результат варто подавати як імовірний.',
      inputSchema: {
        code: z.string().trim().optional().describe('Код населеного пункту з find_settlement.'),
        inventory_id: z
          .string()
          .trim()
          .regex(UUID_PATTERN, 'inventory_id має бути UUID')
          .optional()
          .describe('id запису реєстру — береться його точка на карті.'),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        let point: { latitude: number; longitude: number; label?: string };

        if (args.code) {
          const s = findSettlementByCode(await loadRegionStructure(), args.code);
          if (!s) return errorResult(`Населеного пункту з кодом ${args.code} у довіднику немає.`);
          if (typeof s.lat !== 'number' || typeof s.lon !== 'number') {
            return errorResult(`Для «${s.name}» у довіднику немає координат.`);
          }
          point = {
            latitude: s.lat,
            longitude: s.lon,
            label: placeLabel(s.type, s.name, s.community, s.district, s.region, s.country),
          };
        } else if (args.inventory_id) {
          const row = must(
            await supabase
              .from('records')
              .select('latitude, longitude, current_settlement_type, current_settlement_name, current_community, current_district, current_region, current_country')
              .eq('id', args.inventory_id)
              .maybeSingle()
          );
          if (!row || row.latitude === null || row.longitude === null) {
            return errorResult(`У запису ${args.inventory_id} немає координат або такого запису немає.`);
          }
          point = { latitude: row.latitude, longitude: row.longitude, label: currentPlaceLabel(row) };
        } else if (args.latitude !== undefined && args.longitude !== undefined) {
          point = { latitude: args.latitude, longitude: args.longitude };
        } else {
          return errorResult('Вкажіть code, inventory_id або latitude разом із longitude.');
        }

        const periods = await Promise.all(
          HISTORICAL_PERIODS.map(async (year) => {
            const area = await findHistoricalArea(year, point.latitude, point.longitude);
            if (!area) {
              return { year: Number(year), found: false, note: 'Точка поза покриттям історичного шару карти.' };
            }
            // Як у картці карти (HistoricalInfoCard): вищу одиницю не повторюємо,
            // якщо вона збігається з самою одиницею чи державою
            const higher =
              area.higherDivision !== area.name && area.higherDivision !== area.country ? area.higherDivision : null;
            return compact({
              year: Number(year),
              found: true,
              state: area.country,
              higher_division: higher,
              division: area.name,
              name_original: area.nameOriginal,
              name_latin: area.nameLatin,
              center: area.center,
              existed: area.years,
              description: area.description,
            });
          })
        );

        return jsonResult(compact({ point, periods }));
      })
  );
}
