import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import FooterDonate from '../components/FooterDonate';
import { useUser } from '../contexts/UserContext';

export default function Home() {
  const { user, loading: userLoading } = useUser();
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userApprovedCount, setUserApprovedCount] = useState(0);
  const [userUnverifiedCount, setUserUnverifiedCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasContributed, setHasContributed] = useState(false);

  useEffect(() => {
    loadTotalRecords();
  }, []);

  useEffect(() => {
    if (userLoading) return;
    if (user) {
      loadUserStats();
    }
  }, [user, userLoading]);

  const loadTotalRecords = async () => {
    setLoading(true);
    const { count, error } = await supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('approved', true);

    if (error) {
      console.error('Помилка при завантаженні:', error);
      setTotalRecords(0);
    } else {
      setTotalRecords(count || 0);
    }
    setLoading(false);
  };

  const loadUserStats = async () => {
    if (!user) return;

    try {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

      setIsAdmin(!!adminData);

      const { count: userApproved } = await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id);

      const { count: userUnverified } = await supabase
        .from('records_unverified')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id);

      setUserApprovedCount(userApproved ?? 0);
      setUserUnverifiedCount(userUnverified ?? 0);

      const has = (userApproved ?? 0) + (userUnverified ?? 0) > 0;
      setHasContributed(has);
    } catch (e) {
      console.error('Помилка завантаження статистики користувача:', e);
    }
  };

  const getRank = () => {
    if (!user) return 'Невідомий дослідник';
    if (isAdmin) return 'Володар інвентарів';
    if (hasContributed) return 'Інвентарний детектив';
    return 'Архівний турист';
  };

  return (
    <>
      <Header />
      <div className="bg-white dark:bg-gray-900">
        <main className="pb-20 p-4 max-w-5xl mx-auto text-gray-900 dark:text-gray-100 min-h-screen">
        
          {/* Верхні блоки */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          
            {/* Блок 1: Знайдено інвентарів */}
            <div className="border border-gray-300 dark:border-gray-700 p-6 flex flex-col items-center justify-center bg-white dark:bg-gray-900">
              <div className="text-lg mb-3">Знайдено інвентарів</div>
              <div className="text-8xl font-bold">
                {loading ? '...' : totalRecords.toLocaleString('uk-UA')}
              </div>
            </div>

            {/* Блок 2: Швидкі дії */}
            <div className="border border-gray-300 dark:border-gray-700 p-4 flex flex-col justify-between bg-white dark:bg-gray-900">
              <button
                onClick={() => window.location.href = '/search'}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                Шукати інвентарі
              </button>
            
              <button
                onClick={() => window.location.href = '/map'}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                Карта інвентарів
              </button>
            
              <button
                onClick={() => window.location.href = '/unidentified'}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                Неідентифіковані інвентарі
              </button>
            </div>
          </div>

          {/* Блок 3: Мій внесок */}
          <div 
            onClick={() => window.location.href = '/stats'}
            className="border border-gray-300 dark:border-gray-700 p-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition bg-white dark:bg-gray-900"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ліва частина - заголовок */}
              <div className="flex items-center justify-center">
                <div className="text-2xl font-bold">Мій внесок в Інвентаріум</div>
              </div>

              {/* Права частина - звання і статистика */}
              <div className="flex flex-col gap-4 items-center justify-center">
                {/* Моє звання */}
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Моє звання</div>
                  <div className="text-xl font-semibold">{getRank()}</div>
                </div>

                {/* Додані мною інвентарі */}
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Додані мною інвентарі</div>
                  <div className="text-xl font-semibold">{user ? userApprovedCount : '—'}</div>
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>
      <FooterDonate />
    </>
  );
}