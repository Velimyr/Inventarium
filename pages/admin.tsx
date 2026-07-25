import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import { isAdminUser } from '../lib/adminUsers';
import { getAppSetting, setAppSetting, REPORT_ADD_PROBLEMS } from '../lib/appSettings';
import { BarChart3, FileText, Bell, Edit, Search, Send, ArrowRight, CheckCheck, KeyRound, Copy, Bug } from 'lucide-react';

export default function AdminDashboard() {
  const { user, loading: userLoading } = useUser();
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [unverifiedCount, setUnverifiedCount] = useState<number | null>(null);
  const [editCount, setEditCount] = useState<number | null>(null);
  const [identifiedCount, setIdentifiedCount] = useState<number | null>(null);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<number | null>(null);
  const [pendingKeys, setPendingKeys] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Глобальне налаштування «звітувати в бот про проблеми з додаванням»
  const [reportProblems, setReportProblems] = useState<boolean>(false);
  const [savingReport, setSavingReport] = useState(false);

  const toggleReportProblems = async () => {
    const next = !reportProblems;
    setReportProblems(next); // оптимістично
    setSavingReport(true);
    const { error: saveError } = await setAppSetting(supabase, REPORT_ADD_PROBLEMS, next, user?.id);
    setSavingReport(false);
    if (saveError) {
      console.error('Не вдалося зберегти налаштування:', saveError);
      setReportProblems(!next); // відкат
    }
  };

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const checkAdminAndLoadData = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      const { count: approved } = await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .eq('approved', true);

      const { count: unverified } = await supabase
        .from('records_unverified')
        .select('*', { count: 'exact', head: true });

      const { count: subscriptionCount } = await supabase
        .from('settlement_subscription')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');

      const { count: editCount } = await supabase
        .from('records_edit')
        .select('*', { count: 'exact', head: true });

      const { count: identifiedCount } = await supabase
        .from('records_notidentify')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'review');

      const { count: keysCount } = await supabase
        .from('map_keys')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');

      const { count: keysEditCount } = await supabase
        .from('map_keys_edit')
        .select('*', { count: 'exact', head: true });

      setApprovedCount(approved ?? 0);
      setUnverifiedCount(unverified ?? 0);
      setPendingSubscriptions(subscriptionCount ?? 0);
      setEditCount(editCount ?? 0);
      setIdentifiedCount(identifiedCount ?? 0);
      setPendingKeys((keysCount ?? 0) + (keysEditCount ?? 0));

      const reportFlag = await getAppSetting(supabase, REPORT_ADD_PROBLEMS, false);
      setReportProblems(reportFlag === true);

      setLoading(false);
    };

    checkAdminAndLoadData();
  }, [user, userLoading]);

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

  if (error) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 text-[16px]">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
            Адмін-панель
          </h1>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
            {/* Статистика інвентарів */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <BarChart3 className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    К-ть інвентарів в реєстрі
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {approvedCount ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_stats';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Статистика</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Необроблені інвентарі */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    К-ть необроблених інвентарів
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {unverifiedCount ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_approve';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати обробку інвентарів</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <CheckCheck className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Масове підтвердження
                  </h2>
                </div>
                <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                  Підтвердити необроблені інвентарі пакетно за автором
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_approve_mass';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#14AE5C] hover:bg-[#0F8A4A] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Відкрити масове підтвердження</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Непідтверджені підписки */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Bell className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Непідтверджені підписки
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {pendingSubscriptions ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_subscription';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати обробку підписок</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Редаговані інвентарі */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Edit className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    К-ть редагованих інвентарів
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {editCount ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_editapprove';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати обробку інвентарів</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Ідентифіковані інвентарі */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Search className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    К-ть ідентифікованих інвентарів
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {identifiedCount ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_unidentified';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати обробку інвентарів</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Ключі на перевірку */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <KeyRound className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Ключі на перевірку
                  </h2>
                </div>
                <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold">
                  {pendingKeys ?? '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_keys';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати обробку ключів</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Пошук помилок в реєстрі */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Copy className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Пошук помилок в реєстрі
                  </h2>
                </div>
                <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                  Дублі інвентарів та розбіжності в даних однієї архівної справи
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_duplicates';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Почати пошук помилок</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Розсилка повідомлень */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Send className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Розсилка повідомлень
                  </h2>
                </div>
                <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                  Відправити повідомлення користувачам системи
                </p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_send_messages';
                }}
                className="flex items-center justify-center gap-[8px] w-full h-[40px] bg-green-600 hover:bg-green-700 text-white rounded transition-colors mt-[15px]"
                type="button"
              >
                <span className="text-[14px] lg:text-[16px] font-medium">Відкрити розсилку</span>
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </button>
            </section>

            {/* Глобальні налаштування */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col justify-between min-h-[200px]">
              <div>
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Bug className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Глобальні налаштування
                  </h2>
                </div>
                <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                  Звітувати в бот про проблеми з додаванням. Коли увімкнено й користувачу не
                  вдалося додати інвентар — адмінам у Telegram надійде помилка з JSON-файлом усіх
                  надісланих даних.
                </p>
              </div>

              <button
                onClick={toggleReportProblems}
                disabled={savingReport}
                role="switch"
                aria-checked={reportProblems}
                type="button"
                className="flex items-center justify-between gap-[10px] w-full h-[40px] px-[12px] mt-[15px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] disabled:opacity-60 transition-colors"
              >
                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                  {reportProblems ? 'Увімкнено' : 'Вимкнено'}
                </span>
                <span
                  className={`relative inline-flex h-[24px] w-[44px] flex-shrink-0 rounded-full transition-colors ${
                    reportProblems ? 'bg-[#2563EB]' : 'bg-gray-300 dark:bg-[#374151]'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] left-[2px] h-[20px] w-[20px] rounded-full bg-white transition-transform ${
                      reportProblems ? 'translate-x-[20px]' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
