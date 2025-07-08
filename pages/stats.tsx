import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';

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
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
          <p className="text-lg text-center">🔐 Щоб переглянути статистику, увійдіть у систему.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-8">Мій внесок в "Інвентаріум"</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Загальна кількість інвентарів */}
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2">Кількість інвентарів у реєстрі</h2>
              <p className="text-4xl font-bold">{approvedCount ?? '—'}</p>
            </section>

            {/* Звання користувача */}
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800 flex items-center">
              <div className="mr-4 text-4xl">
                <div className="mr-4 w-8 h-8">
                  {isAdmin ? (
                    <img src="/images/crown-admin.svg" alt="Admin Crown" className="w-full h-full" />
                  ) : hasContributed ? (
                    <img src="/images/crown-researcher.svg" alt="Researcher Crown" className="w-full h-full" />
                  ) : (
                    <img src="/images/crown-user.svg" alt="User Crown" className="w-full h-full" />
                  )}
                </div>

              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Моє звання</h2>
                <p className="text-lg font-medium">
                  {isAdmin
                    ? 'Володар інвентарів'
                    : hasContributed
                      ? 'Інвентарний детектив'
                      : 'Архівний турист'}
                </p>
              </div>
            </section>

            {/* Кількість внесених записів */}
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2">Додані мною інвентарі</h2>
              <p className="text-4xl font-bold">{userApprovedCount ?? '—'}</p>
            </section>

            {/* Кількість записів в очікуванні */}
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2">Очікують підтвердження адміністратором</h2>
              <p className="text-4xl font-bold">{userUnverifiedCount ?? '—'}</p>
            </section>

            {/* Кількість підписок */}
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2">Мої підписки</h2>
              <p className="text-4xl font-bold mb-4">{userSubscriptionsCount ?? '—'}</p>
              <a
                href="/subscriptions"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Дивитися підписки
              </a>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}