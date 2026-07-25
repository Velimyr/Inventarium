import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppSetting, REPORT_ADD_PROBLEMS } from './appSettings';
import { getAdminUserIds } from './adminUsers';

interface ReportAddProblemParams {
  supabase: SupabaseClient;
  source: string;
  reason: string;
  email?: string | null;
  userId?: string | null;
  formData: any;
}

/**
 * Звіт адмінам про невдачу додавання інвентаря. Під одним прапорцем
 * report_add_problems надсилає два канали:
 *   1. Telegram — повні дані форми окремим JSON-файлом (через /api/report-add-problem;
 *      сервер повторно звіряє прапорець і має доступ до BOT_TOKEN).
 *   2. /messages — короткий текстовий підсумок кожному адміну (файл сюди не
 *      вкласти), щоб звіт бачили й ті, хто не підключив бот.
 *
 * Fire-and-forget: викликається без await, помилки лише логуються, UX не блокує.
 */
export async function reportAddProblem({
  supabase,
  source,
  reason,
  email,
  userId,
  formData,
}: ReportAddProblemParams): Promise<void> {
  try {
    const enabled = await getAppSetting(supabase, REPORT_ADD_PROBLEMS, false);
    if (enabled !== true) return;

    // 1. Telegram: JSON-файл усіх даних.
    fetch('/api/report-add-problem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, reason, email: email ?? null, userId: userId ?? null, formData }),
    }).catch((err) => console.error('Не вдалося надіслати звіт у бот:', err));

    // 2. /messages: короткий підсумок кожному адміну.
    const adminIds = await getAdminUserIds(supabase);
    if (adminIds.length === 0) return;

    const settlement =
      [formData?.current_settlement_type, formData?.current_settlement_name].filter(Boolean).join(' ') || '—';
    const messageText =
      `⚠️ Користувачу не вдалося додати інвентар.\n\n` +
      `Причина: ${reason}\n` +
      `Населений пункт: ${settlement}\n` +
      `Рік: ${formData?.inventory_year || '—'}\n` +
      `Шифр справи: ${formData?.case_signature || '—'}\n` +
      `Email: ${email || '—'}\n\n` +
      `Повні дані — у JSON-файлі в Telegram-боті (якщо бот підключено).`;

    const rows = adminIds.map((id) => ({
      from_user_id: userId ?? null,
      to_user_id: id,
      message_type: 'other',
      message_text: messageText,
      event_date: new Date().toISOString(),
      is_read: false,
    }));

    const { error } = await supabase.from('messages').insert(rows);
    if (error) console.error('Не вдалося створити повідомлення в /messages:', error);
  } catch (e) {
    console.error('reportAddProblem error:', e);
  }
}
