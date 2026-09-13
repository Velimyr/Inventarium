import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchKey } from '../../textSearch';
import { loadArchives, type Archive } from '../../server/publicData';
import { FIELDS_GUIDE } from '../guide';
import { compact, jsonResult, run } from '../format';

const archiveItem = (a: Archive) =>
  compact({
    short_name: a.short_name,
    full_name: a.full_name_ukr,
    // Оригінальна назва здебільшого повторює українську — тоді не дублюємо
    native_name: a.full_name_native !== a.full_name_ukr ? a.full_name_native : null,
    country: a.country,
    site: a.site,
  });

export function registerReferenceTools(server: McpServer) {
  server.registerTool(
    'list_archives',
    {
      title: 'Довідник архівів',
      description:
        'Архіви, у яких зберігаються справи реєстру: скорочена назва (як у шифрі справи), повна назва, країна, сайт. ' +
        'Допомагає розшифрувати архів у шифрі («ЦДІАК», «AGAD») і підказати, куди звертатися по справу.',
      inputSchema: {
        query: z.string().trim().optional().describe('Частина скороченої чи повної назви.'),
        country: z.string().trim().optional().describe('Країна: «Україна», «Польща»…'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const query = args.query ? searchKey(args.query) : null;
        const country = args.country ? searchKey(args.country) : null;
        const archives = (await loadArchives()).filter(
          (a) =>
            (!country || searchKey(a.country).includes(country)) &&
            (!query ||
              [a.short_name, a.full_name_ukr, a.full_name_native].some((v) => v && searchKey(v).includes(query)))
        );
        return jsonResult({ total: archives.length, archives: archives.map(archiveItem) });
      })
  );

  server.registerResource(
    'fields-guide',
    'inventarium://guide/fields',
    {
      title: 'Поля запису Інвентаріуму',
      description: 'Що означає кожне поле запису: типи документів, шифр справи, кількість сторінок, тип позначки, ключі.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: FIELDS_GUIDE }] })
  );

  server.registerResource(
    'archives',
    'inventarium://archives',
    {
      title: 'Довідник архівів',
      description: 'Усі архіви реєстру: скорочена й повна назва, країна, сайт.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify((await loadArchives()).map(archiveItem)) },
      ],
    })
  );

  server.registerPrompt(
    'research_settlement',
    {
      title: 'Інвентарі для населеного пункту',
      description: 'Покроковий пошук усього, що є в реєстрі про населений пункт (наприклад, село предків).',
      argsSchema: {
        settlement: z.string().describe('Назва населеного пункту.'),
        region: z.string().optional().describe('Область чи інше уточнення, якщо відомо.'),
      },
    },
    ({ settlement, region }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Знайди в реєстрі Інвентаріум усі інвентарні описи, що стосуються населеного пункту «${settlement}»${region ? ` (${region})` : ''}.`,
              '',
              '1. find_settlement — знайди населений пункт. Якщо кандидатів кілька, покажи їх і спитай, який саме.',
              '2. get_settlement_inventories за code — інвентарі, прив’язані до цього пункту.',
              '3. historical_divisions за code — у якому повіті, воєводстві й державі він був у 1640 і 1760 роках.',
              '4. search_inventories за назвою — давня назва могла відрізнятися, а запис бути прив’язаний до сусіднього пункту.',
              '5. search_keys за settlement_code — ключі (маєткові комплекси), до яких входив пункт.',
              '',
              'Підсумуй: справи з шифрами, роками, типами документів і наявністю сканів, із посиланнями на сайт; ' +
                'історичну належність пункту; в яких архівах шукати оригінали (list_archives). ' +
                'Записи з mark_type «регіон» познач окремо.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
