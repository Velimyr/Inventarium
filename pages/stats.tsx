import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import { Edit, Archive, Bell, Plus, HelpCircle, Award } from 'lucide-react';
import { isAdminUser } from '../lib/adminUsers';

function getOneMonthAgoISO() {
  const now = new Date();
  const previousMonthLastDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    0
  ).getDate();
  const safeDay = Math.min(now.getDate(), previousMonthLastDay);

  const oneMonthAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    safeDay,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );

  return oneMonthAgo.toISOString();
}

export default function StatsPage() {
  const { user, loading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [userApprovedCount, setUserApprovedCount] = useState<number | null>(null);
  const [userUnverifiedCount, setUserUnverifiedCount] = useState<number | null>(null);
  const [userSubscriptionsCount, setUserSubscriptionsCount] = useState<number | null>(null);
  const [userMonthlyCount, setUserMonthlyCount] = useState<number | null>(null);
  const [totalMonthlyCount, setTotalMonthlyCount] = useState<number | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number | null>(null);
  const [unidentifiedCount, setUnidentifiedCount] = useState<number | null>(null);
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
        setIsAdmin(await isAdminUser(supabase, user.id));

        // Clamp the day to the last valid day of the previous month,
        // so 30/31st do not overflow back into the current month.
        const oneMonthAgoISO = getOneMonthAgoISO();

        // Total approved records
        const { count: totalApproved } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true });

        // User's approved records
        const { count: userApproved } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id);

        // User's unverified records
        const { count: userUnverified } = await supabase
          .from('records_unverified')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id);

        // User's subscriptions
        const { count: userSubscriptions } = await supabase
          .from('settlement_subscription')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        // User's records added in the last month
        const { count: userMonthly } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .gte('created_at', oneMonthAgoISO);

        // Total records added in the last month
        const { count: totalMonthly } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', oneMonthAgoISO);

        // Unread messages for user
        const { count: unreadMessages } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('to_user_id', user.id)
          .eq('is_read', false);

        // Unidentified records with status = 'new'
        const { count: unidentified } = await supabase
          .from('records_notidentify')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'new');

        setApprovedCount(totalApproved ?? 0);
        setUserApprovedCount(userApproved ?? 0);
        setUserUnverifiedCount(userUnverified ?? 0);
        setUserSubscriptionsCount(userSubscriptions ?? 0);
        setUserMonthlyCount(userMonthly ?? 0);
        setTotalMonthlyCount(totalMonthly ?? 0);
        setUnreadMessagesCount(unreadMessages ?? 0);
        setUnidentifiedCount(unidentified ?? 0);

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

  const getRank = () => {
    if (isAdmin) return 'Володар інвентарів';
    if (hasContributed) return 'Інвентарний детектив';
    return 'Архівний турист';
  };

  const getMessagesText = (count: number) => {
    if (count === 0) {
      return 'У вас немає непрочитаних повідомлень';
    }

    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return `У вас ${count} непрочитане повідомлення`;
    }

    if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return `У вас ${count} непрочитаних повідомлення`;
    }

    return `У вас ${count} непрочитаних повідомлень`;
  };

  const getUnverifiedText = (count: number) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return `У вас ${count} непідтверджений інвентар`;
    }

    if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return `У вас ${count} непідтверджених інвентарі`;
    }

    return `У вас ${count} непідтверджених інвентарів`;
  };

  const getSubscriptionsText = (count: number) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return `У вас ${count} активна підписка`;
    }

    if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return `У вас ${count} активні підписки`;
    }

    return `У вас ${count} активних підписок`;
  };

  const getUnidentifiedText = (count: number) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return `${count} інвентар очікує на ідентифікацію`;
    }

    if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return `${count} інвентарі очікують на ідентифікацію`;
    }

    return `${count} інвентарів очікують на ідентифікацію`;
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
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
            Вітаємо, {user.email?.split('@')[0] || 'користувач'}
          </h1>

          {/* User Email */}
          <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
            Ви увійшли як {user.email}
          </p>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[20px] mb-[40px]">
            {/* User Rank Card */}
            <div className="flex flex-col items-center justify-center gap-[15px] p-[25px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] min-h-[180px]">
              <svg width="56" height="56" viewBox="0 0 66 66" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M33.0011 52.7034C45.9303 52.7034 56.4115 46.5286 56.4115 38.9117C56.4115 31.2947 45.9303 25.1199 33.0011 25.1199C20.072 25.1199 9.59082 31.2947 9.59082 38.9117C9.59082 46.5286 20.072 52.7034 33.0011 52.7034Z" fill="#E56353"/>
                <path d="M57.3915 54.0424H33.0015V12.6838C33.0015 12.6838 34.8821 24.4482 41.7752 33.0886C45.7626 38.0868 53.7594 38.1065 57.8159 33.1569C60.2728 30.1587 61.7652 26.2408 62.6414 21.6703" fill="#F6C358"/>
                <path d="M8.61125 54.0424H33.0013V12.6838C33.0013 12.6838 31.1207 24.4482 24.2275 33.0886C20.2401 38.0868 12.2433 38.1065 8.18678 33.1569C5.72981 30.1587 4.23752 26.2408 3.36133 21.6703" fill="#FCD462"/>
                <path d="M58.9804 54.0442H7.02393V57.1751H58.9804V54.0442Z" fill="#FCD462"/>
                <path d="M33.0015 16.6159C35.153 16.6159 36.897 14.8718 36.897 12.7204C36.897 10.5689 35.153 8.82483 33.0015 8.82483C30.8501 8.82483 29.106 10.5689 29.106 12.7204C29.106 14.8718 30.8501 16.6159 33.0015 16.6159Z" fill="#E56353"/>
                <path d="M62.1045 27.6307C64.256 27.6307 66.0001 25.8866 66.0001 23.7351C66.0001 21.5837 64.256 19.8396 62.1045 19.8396C59.9531 19.8396 58.209 21.5837 58.209 23.7351C58.209 25.8866 59.9531 27.6307 62.1045 27.6307Z" fill="#E56353"/>
                <path d="M3.89554 27.6307C6.04699 27.6307 7.79109 25.8866 7.79109 23.7351C7.79109 21.5837 6.04699 19.8396 3.89554 19.8396C1.74409 19.8396 0 21.5837 0 23.7351C0 25.8866 1.74409 27.6307 3.89554 27.6307Z" fill="#E56353"/>
                <path d="M33.0012 49.2163C35.944 49.2163 38.3295 45.6678 38.3295 41.2905C38.3295 36.9132 35.944 33.3647 33.0012 33.3647C30.0584 33.3647 27.6729 36.9132 27.6729 41.2905C27.6729 45.6678 30.0584 49.2163 33.0012 49.2163Z" fill="#44C4A1"/>
              </svg>
              <div className="flex flex-col gap-[5px] items-center">
                <span className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 text-center">
                  Моє звання
                </span>
                <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold text-center">
                  {getRank()}
                </h3>
              </div>
            </div>

            {/* Inventories Added Card */}
            <StatCard
              label="Додано мною інвентарів"
              value={userApprovedCount?.toString() || '0'}
              subtext={`+${userMonthlyCount || 0} за останній місяць`}
            />

            {/* Pending Confirmation Card */}
            <StatCard
              label="Очікують підтвердження"
              value={userUnverifiedCount?.toString() || '0'}
              subtext="Їх можна редагувати у чернетках"
            />

            {/* Total Inventories Card */}
            <StatCard
              label="Всього інвентарів у реєстрі"
              value={approvedCount?.toString() || '0'}
              subtext={`+${totalMonthlyCount || 0} за останній місяць`}
            />
          </div>

          {/* Quick Actions Section */}
          <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[20px] md:text-[24px] lg:text-[28px] font-bold mb-[20px]">
            Швидкі дії
          </h2>

          {/* Quick Actions Grid - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px] mb-[20px]">
            <ActionCard
              href="/edit_drafts"
              icon={<Edit className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Редагувати чернетки"
              description={getUnverifiedText(userUnverifiedCount || 0)}
            />
            <ActionCard
              href="/subscriptions"
              icon={<Archive className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Переглянути підписки"
              description={getSubscriptionsText(userSubscriptionsCount || 0)}
            />
            <ActionCard
              href="/messages"
              icon={<Bell className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Переглянути повідомлення"
              description={getMessagesText(unreadMessagesCount || 0)}
            />
          </div>

          {/* Quick Actions Grid - Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            <ActionCard
              href="/add_inventory"
              icon={<Plus className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Додати інвентар"
              description="Поповнити реєстр новою знахідкою"
            />
            <ActionCard
              href="/unidentified"
              icon={<HelpCircle className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Неідентифіковані інвентарі"
              description={getUnidentifiedText(unidentifiedCount || 0)}
            />
            <ActionCard
              href="/marathons/second"
              icon={<Award className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />}
              title="Другий Інвентарний Марафон"
              description="15.02.2026 - 15.04.2026"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// Stat Card Component - centered text
function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-[15px] p-[25px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] min-h-[180px]">
      <span className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 text-center">
        {label}
      </span>
      <div className="text-gray-900 dark:text-[#F3F4F6] text-[28px] lg:text-[32px] font-bold text-center">
        {value}
      </div>
      {subtext && (
        <span className="text-gray-700 dark:text-white text-[12px] lg:text-[13px] opacity-70 text-center">
          {subtext}
        </span>
      )}
    </div>
  );
}

// Action Card Component
function ActionCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <a
      href={href}
      className="flex flex-col gap-[20px] p-[25px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] hover:border-[#2563EB] dark:hover:border-[#2563EB] transition-all cursor-pointer"
    >
      <div className="flex items-center justify-center w-[48px] h-[48px] lg:w-[52px] lg:h-[52px] rounded-lg bg-[#2563EB]/10">
        {icon}
      </div>
      <div className="flex flex-col gap-[8px]">
        <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold">
          {title}
        </h3>
        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
          {description}
        </p>
      </div>
    </a>
  );
}
