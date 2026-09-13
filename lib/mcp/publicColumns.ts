// Колонки, які MCP-сервер віддає назовні.
//
// Anon-ключ читає з records, records_notidentify і map_keys усі колонки, серед
// них email і created_by автора. Сайт цих полів не показує, але для агента
// «не показати» не працює: усе, що повернув запит, опиниться в розмові. Тому
// MCP ніколи не робить select('*') — лише перелічені тут колонки.

export const PUBLIC_RECORD_COLUMNS = [
  'id',
  'approved',
  'case_signature',
  'additional_case_signature',
  'is_ukrainian_archive',
  'archive',
  'fonds',
  'series',
  'record',
  'case_title',
  'case_date',
  'inventory_year',
  'inventory_type',
  'pages_count',
  'inventory_start_page',
  'scans_url',
  'notes',
  'old_province',
  'old_district',
  'old_community',
  'old_settlement_type',
  'old_settlement_name',
  'current_country',
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
  'latitude',
  'longitude',
  'mark_type',
  'cobook_link',
  'cobook_transcript',
].join(', ');

/** Для списків: без приміток, координат і посилань — лише те, за чим обирають запис. */
export const RECORD_SUMMARY_COLUMNS = [
  'id',
  'case_signature',
  'case_title',
  'inventory_year',
  'inventory_type',
  'scans_url',
  'mark_type',
  'old_settlement_type',
  'old_settlement_name',
  'current_country',
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
].join(', ');

export const PUBLIC_UNIDENTIFIED_COLUMNS = [
  'id',
  'status',
  'case_signature',
  'additional_case_signature',
  'archive',
  'fonds',
  'series',
  'record',
  'case_title',
  'case_date',
  'inventory_year',
  'inventory_type',
  'pages_count',
  'scans_url',
  'notes',
].join(', ');

// Без polygon: контур — сотні точок, агентові з нього користі немає.
export const PUBLIC_KEY_COLUMNS = ['id', 'name', 'source', 'description', 'center', 'points'].join(', ');

/** Поля, яких не має бути ні в одній відповіді MCP (для перевірок). */
export const PRIVATE_FIELDS = ['email', 'created_by', 'comment', 'json_full_data', 'reviewed_by', 'reject_reason'];
