import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { REPORT_ADD_PROBLEMS } from '../../lib/appSettings';

// Anon-клієнт достатньо: app_settings/admin_users/profiles читаються за RLS
// так само, як з клієнта. BOT_TOKEN — лише на сервері, тож sendDocument тут.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { source, reason, email, userId, formData } = req.body || {};

    // 1. Гейт: сервер — джерело правди щодо того, чи звітувати взагалі.
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', REPORT_ADD_PROBLEMS)
      .maybeSingle();

    if (setting?.value !== true) {
      return res.status(200).json({ skipped: true });
    }

    // 2. Telegram chat id усіх адмінів.
    const { data: admins } = await supabase
      .from('admin_users')
      .select('id')
      .eq('role', 'admin');

    const adminIds = (admins || []).map((a: { id: string }) => a.id);
    if (adminIds.length === 0) return res.status(200).json({ sent: 0 });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .in('user_id', adminIds);

    const chatIds = (profiles || [])
      .map((p: { telegram_chat_id: string | number | null }) => p.telegram_chat_id)
      .filter(Boolean);

    if (chatIds.length === 0) return res.status(200).json({ sent: 0 });

    // 3. Уся форма — окремим JSON-файлом; коротка суть — у підписі.
    const payload = {
      source: source || 'unknown',
      reason: reason || '',
      email: email || null,
      userId: userId || null,
      submittedAt: new Date().toISOString(),
      formData: formData ?? null,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `inventory-error-${Date.now()}.json`;
    const caption =
      `⚠️ Не вдалося додати інвентар\n` +
      `Джерело: ${payload.source}\n` +
      `Причина: ${payload.reason || '—'}\n` +
      `Email: ${payload.email || '—'}`;

    let sent = 0;
    for (const chatId of chatIds) {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', caption.slice(0, 1024));
      form.append('document', new Blob([json], { type: 'application/json' }), filename);

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: form,
      });
      if (r.ok) sent++;
      else console.error('sendDocument error:', await r.text());
    }

    return res.status(200).json({ sent });
  } catch (e) {
    console.error('report-add-problem error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
