import type { SupabaseClient } from '@supabase/supabase-js';

// Ключі глобальних налаштувань (таблиця public.app_settings).
export const REPORT_ADD_PROBLEMS = 'report_add_problems';

/** Значення налаштування або fallback, якщо рядка немає / помилка. */
export async function getAppSetting<T = any>(
  supabase: SupabaseClient,
  key: string,
  fallback: T
): Promise<T> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;
  return (data.value ?? fallback) as T;
}

/** Запис налаштування (доступно лише адмінам — за RLS). */
export async function setAppSetting(
  supabase: SupabaseClient,
  key: string,
  value: any,
  userId?: string | null
) {
  return supabase.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: userId ?? null },
    { onConflict: 'key' }
  );
}
