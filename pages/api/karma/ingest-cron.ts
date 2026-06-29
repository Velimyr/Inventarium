import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  getAllUserTotals,
  karmaIngest,
  toKarmaLogin,
  type KarmaAccount,
} from '../../../lib/karma';

// Нічна відправка накопичених балів у «Карму».
// Запускається планувальником (GitHub Actions) раз на добу.
// Захищено секретом CRON_SECRET, щоб ендпоінт не міг смикнути будь-хто.

// Дозволяємо функції працювати довше за дефолт, щоб встигли і читання БД,
// і запит(и) до «Карми» (таймаут на сам запит — 45 с у lib/karma.ts).
export const config = {
  maxDuration: 60,
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron надсилає заголовок Authorization: Bearer <CRON_SECRET>.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  try {
    // 1. Усі профілі з email.
    const profiles: { user_id: string; email: string | null }[] = [];
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, email')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      profiles.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // 2. Поточні сумарні бали кожного користувача.
    const totals = await getAllUserTotals(supabase);

    // 3. accounts = [{ login, total }] — total є ПОТОЧНИМ підсумком.
    const accounts: KarmaAccount[] = [];
    for (const profile of profiles) {
      if (!profile.email) continue;
      accounts.push({
        login: toKarmaLogin(profile.email),
        total: totals[profile.user_id] ?? 0,
      });
    }

    if (accounts.length === 0) {
      console.log('[karma ingest] no accounts to sync');
      return res.status(200).json({ ok: true, synced: 0, awarded: 0, unknown: 0 });
    }

    // 4. Відправка пачками по ~500.
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
