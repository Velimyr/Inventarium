import { useEffect, useState } from 'react';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';
import { isAdminUser } from '../lib/adminUsers';
import { getAppSetting, setAppSetting, REPORT_ADD_PROBLEMS } from '../lib/appSettings';
import { Settings } from 'lucide-react';

// Опис перемикачів. Щоб додати нове глобальне налаштування — додаємо сюди
// один запис (ключ, заголовок, опис), решта (завантаження, збереження, UI)
// працює автоматично.
const TOGGLES: { key: string; title: string; description: string }[] = [
  {
    key: REPORT_ADD_PROBLEMS,
    title: 'Звітувати про проблеми з додаванням',
    description:
      'Коли увімкнено й користувачу не вдалося додати інвентар — адмінам надійде звіт: у Telegram (JSON-файл усіх надісланих даних) і в /messages (короткий підсумок).',
  },
];

export default function AdminSettingsPage() {
  const { user, loading: userLoading } = useUser();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    (async () => {
      const admin = await isAdminUser(supabase, user.id);
      setIsAdmin(admin);
      if (admin) {
        const loaded: Record<string, boolean> = {};
        for (const t of TOGGLES) {
          loaded[t.key] = (await getAppSetting(supabase, t.key, false)) === true;
        }
        setValues(loaded);
      }
      setLoading(false);
    })();
  }, [user, userLoading]);

  const toggle = async (key: string) => {
    const next = !values[key];
    setValues((v) => ({ ...v, [key]: next })); // оптимістично
    setSaving((s) => ({ ...s, [key]: true }));
    const { error } = await setAppSetting(supabase, key, next, user?.id);
    setSaving((s) => ({ ...s, [key]: false }));
    if (error) {
      console.error('Не вдалося зберегти налаштування:', error);
      setValues((v) => ({ ...v, [key]: !next })); // відкат
    }
  };

  if (userLoading || loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">⛔ У вас немає доступу до цієї сторінки</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[900px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          <div className="flex items-center gap-[10px] mb-[20px] lg:mb-[30px]">
            <Settings className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Глобальні налаштування
            </h1>
          </div>

          <div className="flex flex-col gap-[14px]">
            {TOGGLES.map((t) => (
              <section
                key={t.key}
                className="flex flex-col sm:flex-row sm:items-center gap-[14px] p-[18px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]"
              >
                <div className="flex-1">
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold mb-[4px]">
                    {t.title}
                  </h2>
                  <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                    {t.description}
                  </p>
                </div>

                <button
                  onClick={() => toggle(t.key)}
                  disabled={saving[t.key]}
                  role="switch"
                  aria-checked={!!values[t.key]}
                  aria-label={t.title}
                  type="button"
                  className="flex items-center gap-[10px] h-[40px] px-[12px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] disabled:opacity-60 transition-colors self-start sm:self-auto whitespace-nowrap"
                >
                  <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium">
                    {values[t.key] ? 'Увімкнено' : 'Вимкнено'}
                  </span>
                  <span
                    className={`relative inline-flex h-[24px] w-[44px] flex-shrink-0 rounded-full transition-colors ${
                      values[t.key] ? 'bg-[#2563EB]' : 'bg-gray-300 dark:bg-[#374151]'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] left-[2px] h-[20px] w-[20px] rounded-full bg-white transition-transform ${
                        values[t.key] ? 'translate-x-[20px]' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
