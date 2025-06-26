import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';

export default function AdminDashboard() {
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [unverifiedCount, setUnverifiedCount] = useState<number | null>(null);

  const [user, setUser] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserAndCheckAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('⛔ Ви не авторизовані');
        setLoading(false);
        return;
      }
      setUser(user);

      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (adminError || !adminData) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      // Якщо адмін — завантажуємо лічильники
      const { count: approved } = await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .eq('approved', true);

      const { count: unverified } = await supabase
        .from('records_unverified')
        .select('*', { count: 'exact', head: true });

      setApprovedCount(approved || 0);
      setUnverifiedCount(unverified || 0);
      setLoading(false);
    };

    fetchUserAndCheckAdmin();
  }, []);

  if (loading) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 flex items-center justify-center">
          <p>{error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-8">Адмін-панель</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2">К-ть інвентарів в реєстрі</h2>
              <p className="text-4xl font-bold">{approvedCount ?? '—'}</p>
            </section>

            <section className="bg-card rounded-2xl shadow p-6 flex flex-col justify-between bg-white dark:bg-gray-800">
              <div>
                <h2 className="text-xl font-semibold mb-2">К-ть необроблених інвентарів</h2>
                <p className="text-4xl font-bold mb-4">{unverifiedCount ?? '—'}</p>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/admin_approve';
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors"
                type="button"
              >
                Почати обробку інвентарів
              </button>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
