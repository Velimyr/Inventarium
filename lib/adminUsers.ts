import type { SupabaseClient } from '@supabase/supabase-js';

export const ADMIN_ROLE = 'admin';

export async function isAdminUser(
  supabase: SupabaseClient,
  userId?: string | null
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userId)
    .eq('role', ADMIN_ROLE)
    .maybeSingle();

  if (error) {
    console.error('Помилка перевірки ролі адміністратора:', error);
    return false;
  }

  return !!data;
}

export async function getAdminUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id')
    .eq('role', ADMIN_ROLE);

  if (error) {
    console.error('Помилка завантаження списку адміністраторів:', error);
    return [];
  }

  return data?.map((admin: { id: string }) => admin.id) || [];
}
