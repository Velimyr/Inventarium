import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getKarmaAccounts, karmaIngest } from '../../../lib/karma';

// Нічна відправка накопичених балів у «Карму».
// Запускається планувальником (GitHub Actions) раз на добу.
// Захищено секретом CRON_SECRET, щоб ендпоінт не міг смикнути будь-хто.

// Дозволяємо функції працювати довше за дефолт (стеля Hobby — 60 с).
export const config = {
  maxDuration: 60,
};

// Підрахунок балів робить SQL-функція karma_user_totals() у самій БД,
// тож звичайного anon-ключа (як усюди в проєкті) достатньо.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Планувальник надсилає заголовок Authorization: Bearer <CRON_SECRET>.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  try {
    // 1. Акаунти з поточними підсумками (рахує БД одним запитом).
    const accounts = await getKarmaAccounts(supabase);

    if (accounts.length === 0) {
      console.log('[karma ingest] no accounts to sync');
      return res.status(200).json({ ok: true, synced: 0, awarded: 0, unknown: 0 });
    }

    // 2. Відправка пачками (див. karmaIngest — total є ПОТОЧНИМ підсумком).
    const result = await karmaIngest(accounts);

    console.log(
      `[karma ingest] accounts=${accounts.length} synced=${result.synced} ` +
        `awarded=${result.awarded} unknown=${result.unknown.length}`
    );

    return res.status(200).json({
      ok: true,
      synced: result.synced,
      awarded: result.awarded,
      unknown: result.unknown.length,
    });
  } catch (err) {
    // Мережеві помилки/таймаути не повинні «вбивати» задачу — логуємо й виходимо.
    console.error('[karma ingest] failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'ingest_failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
