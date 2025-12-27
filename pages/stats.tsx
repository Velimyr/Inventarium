import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import { BarChart3, Crown, FileText, Clock, Bell, Trophy } from 'lucide-react';

export default function StatsPage() {
  const { user, loading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [userApprovedCount, setUserApprovedCount] = useState<number | null>(null);
  const [userUnverifiedCount, setUserUnverifiedCount] = useState<number | null>(null);
  const [userSubscriptionsCount, setUserSubscriptionsCount] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasContributed, setHasContributed] = useState(false);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {

        const { data: adminData } = await supabase
          .from('admin_users')
          .select('id')
          .eq('id', user.id)
          .single();

        setIsAdmin(!!adminData);

        const { count: totalApproved } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true });

        const { count: userApproved } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id);

        const { count: userUnverified } = await supabase
          .from('records_unverified')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id);

        const { count: userSubscriptions } = await supabase
          .from('settlement_subscription')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        setApprovedCount(totalApproved ?? 0);
        setUserApprovedCount(userApproved ?? 0);
        setUserUnverifiedCount(userUnverified ?? 0);
        setUserSubscriptionsCount(userSubscriptions ?? 0);

        const has = (userApproved ?? 0) + (userUnverified ?? 0) > 0;
        setHasContributed(has);
      } catch (e: any) {
        setError('Помилка завантаження статистики');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
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

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px] lg:text-[18px] text-center px-4">
            🔐 Щоб переглянути статистику, увійдіть у систему.
          </p>
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
            Мій внесок в "Інвентаріум"
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
            {/* Загальна кількість інвентарів */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="flex items-center justify-center gap-[10px] mb-[15px]">
                <BarChart3 className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold text-center">
                  Кількість інвентарів у реєстрі
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold text-center">
                {approvedCount ?? '—'}
              </p>
            </section>

            {/* Звання користувача */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-12 h-12 mb-[15px] flex items-center justify-center">
                {isAdmin ? (
                  <img src="/images/crown-admin.svg" alt="Admin Crown" className="w-full h-full" />
                ) : hasContributed ? (
                  <img src="/images/crown-researcher.svg" alt="Researcher Crown" className="w-full h-full" />
                ) : (
                  <img src="/images/crown-user.svg" alt="User Crown" className="w-full h-full" />
                )}
              </div>
              <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[10px] text-center">
                Моє звання
              </h2>
              <p className="text-gray-900 dark:text-white text-[16px] lg:text-[18px] font-medium text-center">
                {isAdmin
                  ? 'Володар інвентарів'
                  : hasContributed
                    ? 'Інвентарний детектив'
                    : 'Архівний турист'}
              </p>
            </section>

            {/* Кількість внесених записів */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="flex items-center justify-center gap-[10px] mb-[15px]">
                <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold text-center">
                  Додані мною інвентарі
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold text-center">
                {userApprovedCount ?? '—'}
              </p>
            </section>

            {/* Кількість записів в очікуванні */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="flex items-center justify-center gap-[10px] mb-[15px]">
                <Clock className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold text-center">
                  Очікують підтвердження адміністратором
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold mb-[15px] text-center">
                {userUnverifiedCount ?? '—'}
              </p>
              <a
                href="/edit_drafts"
                className="inline-flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
              >
                <span className="text-white text-[14px] lg:text-[16px] font-medium">Редагувати</span>
              </a>
            </section>

            {/* Кількість підписок */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="flex items-center justify-center gap-[10px] mb-[15px]">
                <Bell className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold text-center">
                  Мої підписки
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[32px] lg:text-[40px] font-bold mb-[15px] text-center">
                {userSubscriptionsCount ?? '—'}
              </p>
              <a
                href="/subscriptions"
                className="inline-flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
              >
                <span className="text-white text-[14px] lg:text-[16px] font-medium">Дивитися підписки</span>
              </a>
            </section>

            {/* Інвентарний марафон */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col items-center justify-center min-h-[200px]">
              <div className="flex items-center justify-center gap-[10px] mb-[15px]">
                <Trophy className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold text-center">
                  Інвентарний марафон
                </h2>
              </div>
              <a
                href="/marathon1"
                className="inline-flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
              >
                <span className="text-white text-[14px] lg:text-[16px] font-medium">Детальніше</span>
              </a>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}