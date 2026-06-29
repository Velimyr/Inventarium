import { SupabaseClient } from '@supabase/supabase-js';

// Інтеграція із системою «Карма» Генеалогічного навігатора.
// Усі виклики виконуються лише на сервері — токен ніколи не потрапляє в браузер.

export const KARMA_BASE_URL = 'https://www.uagenealogy.com';

// Таблиці, з яких складається сумарний внесок користувача (бали).
// Та сама логіка, що й у Першому марафоні: підтверджені + неперевірені записи.
const CONTRIBUTION_TABLES = ['records', 'records_unverified'] as const;

const REQUEST_TIMEOUT_MS = 45000;

/** Повертає токен «Карми» з оточення або кидає помилку, якщо він не заданий. */
export function getKarmaToken(): string {
  const token = process.env.KARMA_TOKEN;
  if (!token) {
    throw new Error('KARMA_TOKEN is not configured');
  }
  return token;
}

/** Нормалізує email у "login" для API «Карми»: завжди нижній регістр без пробілів. */
export function toKarmaLogin(email: string): string {
  return email.trim().toLowerCase();
}

/** fetch із таймаутом, щоб мережеві проблеми не «вішали» задачу. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Сумарний бал одного користувача = кількість його записів у всіх таблицях внеску. */
export async function getUserTotal(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const counts = await Promise.all(
    CONTRIBUTION_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId);
      if (error) throw error;
      return count ?? 0;
    })
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Сумарні бали ВСІХ користувачів (для нічної синхронізації).
 * Повертає мапу user_id -> total. Підрахунок у JS, як і на марафонних сторінках.
 */
export async function getAllUserTotals(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  const pageSize = 1000;

  for (const table of CONTRIBUTION_TABLES) {
    let from = 0;
    // Посторінкове читання, щоб обійти дефолтний ліміт Supabase у 1000 рядків.
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('created_by')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const row of data) {
        const uid = (row as { created_by: string | null }).created_by;
        if (uid) totals[uid] = (totals[uid] ?? 0) + 1;
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  return totals;
}

export interface KarmaLinkResult {
  status: number;
  ok: boolean;
  awarded: number;
  error?: string;
}

/** POST /api/karma/link-redeem — прив'язка акаунта за кодом. */
export async function karmaLinkRedeem(params: {
  code: string;
  login: string;
  total?: number;
}): Promise<KarmaLinkResult> {
  const body: Record<string, unknown> = {
    code: params.code,
    login: params.login,
  };
  if (typeof params.total === 'number') {
    body.total = params.total;
  }

  const res = await fetchWithTimeout(`${KARMA_BASE_URL}/api/karma/link-redeem`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getKarmaToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    ok: Boolean(json?.ok),
    awarded: typeof json?.awarded === 'number' ? json.awarded : 0,
    error: typeof json?.error === 'string' ? json.error : undefined,
  };
}

export interface KarmaAccount {
  login: string;
  total: number;
}

export interface KarmaIngestResult {
  synced: number;
  awarded: number;
  unknown: string[];
}

/**
 * POST /api/karma/ingest — масова відправка накопичених балів.
 * Розбиває акаунти на пачки і підсумовує відповіді. Менший батч = швидший
 * запит, що надійно вкладається в таймаут.
 */
export async function karmaIngest(
  accounts: KarmaAccount[],
  batchSize = 100
): Promise<KarmaIngestResult> {
  const result: KarmaIngestResult = { synced: 0, awarded: 0, unknown: [] };

  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const batchInfo = `batch ${i / batchSize + 1} (${batch.length} accounts, total ${accounts.length})`;

    let res: Response;
    try {
      res = await fetchWithTimeout(`${KARMA_BASE_URL}/api/karma/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getKarmaToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accounts: batch }),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Karma ingest ${batchInfo} failed: ${reason}`);
    }

    if (!res.ok) {
      throw new Error(`Karma ingest ${batchInfo} failed: HTTP ${res.status}`);
    }

    const json = await res.json().catch(() => ({}));
    result.synced += typeof json?.synced === 'number' ? json.synced : 0;
    result.awarded += typeof json?.awarded === 'number' ? json.awarded : 0;
    if (Array.isArray(json?.unknown)) {
      result.unknown.push(...json.unknown);
    }
  }

  return result;
}
