import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';

interface Leader {
  user_id: string;
  name: string;
  approved: number;
  unverified: number;
  total: number;
}

export default function MarathonPage() {
  const { user } = useUser();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [myStats, setMyStats] = useState<{ approved: number; unverified: number; total: number; position: number } | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        console.log('No user found, skipping fetchData');
        setLeaders([]);
        setMyStats(null);
        return;
      }
      // Діапазон дат для марафону: весь серпень 2025
      const fromDate = '2025-01-01T00:00:00';
      const toDate = '2025-08-31T23:59:59';

      try {
        // Отримати підтверджені записи
        const { data: approvedRecords, error: approvedError } = await supabase
          .from('records')
          .select('id, created_by, created_at')
          .gte('created_at', fromDate)
          .lte('created_at', toDate);
        if (approvedError) {
          console.error('Error fetching approved records:', approvedError);
          setLeaders([]);
          setMyStats(null);
          return;
        }

        // Отримати неперевірені записи
        const { data: unverifiedRecords, error: unverifiedError } = await supabase
          .from('records_unverified')
          .select('id, created_by, created_at')
          .gte('created_at', fromDate)
          .lte('created_at', toDate);
        if (unverifiedError) {
          console.error('Error fetching unverified records:', unverifiedError);
          setLeaders([]);
          setMyStats(null);
          return;
        }

        const userMap: Record<string, Leader> = {};

        for (const rec of approvedRecords || []) {
          if (!userMap[rec.created_by]) {
            userMap[rec.created_by] = { user_id: rec.created_by, name: '', approved: 0, unverified: 0, total: 0 };
          }
          userMap[rec.created_by].approved++;
        }

        for (const rec of unverifiedRecords || []) {
          if (!userMap[rec.created_by]) {
            userMap[rec.created_by] = { user_id: rec.created_by, name: '', approved: 0, unverified: 0, total: 0 };
          }
          userMap[rec.created_by].unverified++;
        }

        const list = Object.values(userMap).map((u) => ({
          ...u,
          total: u.approved + u.unverified
        }));

        list.sort((a, b) => b.total - a.total);

        // Отримати імена користувачів із таблиці profiles
        const userIds = list.map(u => u.user_id);
        let nameMap: Record<string, string> = {};
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('user_id, name')
            .in('user_id', userIds);

          if (profileError) {
            console.error('Error fetching names from profiles:', profileError);
          } else {
            for (const profile of profileData || []) {
              nameMap[profile.user_id] = profile.name;
            }
          }
        } catch (err) {
          console.error('Unexpected error fetching names:', err);
        }

        // get current user metadata name
        const currentUserId = user?.id;
        const currentUserName = user?.user_metadata?.name || user?.email || 'Я';

        for (const u of list) {
          if (u.user_id === currentUserId) {
            u.name = currentUserName;
          } else {
            u.name = nameMap[u.user_id] || `Учасник #${u.user_id.slice(0, 6)}`;
          }
        }

        setLeaders(list);

        const index = list.findIndex((u) => u.user_id === user.id);
        if (index >= 0) {
          setMyStats({
            approved: list[index].approved,
            unverified: list[index].unverified,
            total: list[index].total,
            position: index + 1,
          });
        } else {
          setMyStats(null);
        }
      } catch (err) {
        console.error('Unexpected error in fetchData:', err);
        setLeaders([]);
        setMyStats(null);
      }
    };
    fetchData();
  }, [user]);

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-2">Перший Інвентарний Марафон</h1>
          <p className="mb-6 text-gray-600 dark:text-gray-300">Дата проведення: серпень 2025 року</p>

          <section className="mb-6">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full text-left font-semibold text-lg bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-2 rounded"
            >
              Правила Інвентарного марафону {showRules ? '▲' : '▼'}
            </button>
            {showRules && (
              <div className="mt-2 bg-gray-100 dark:bg-gray-800 p-4 rounded">
                <p>Учасники додають інвентарі протягом серпня 2025 року. У залік йдуть як підтверджені, так і ті, що чекають на перевірку.</p>
              </div>
            )}
          </section>

          <section className="mb-6 bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
            <h2 className="text-xl font-semibold mb-4">Моя участь</h2>
            <div className="mb-2">
              <p className="text-gray-600 dark:text-gray-300">Мої інвентарі в марафоні</p>
              <p className="text-3xl font-bold">{myStats ? myStats.total : '—'}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-300">Моя позиція в марафоні</p>
              <p className="text-3xl font-bold">{myStats ? myStats.position : '—'}</p>
            </div>
          </section>

          <section className="bg-card rounded-2xl shadow p-6 bg-white dark:bg-gray-800">
            <h2 className="text-xl font-semibold mb-4">Таблиця лідерів</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="py-2 px-4">#</th>
                    <th className="py-2 px-4">Імʼя</th>
                    <th className="py-2 px-4">Підтверджено</th>
                    <th className="py-2 px-4">Очікує</th>
                    <th className="py-2 px-4">Всього</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((u, i) => (
                    <tr
                      key={u.user_id}
                      className={`${
                        u.user_id === user?.id
                          ? 'font-semibold bg-blue-50 dark:bg-blue-900'
                          : leaders.indexOf(u) < 3
                          ? 'bg-yellow-100 dark:bg-yellow-900'
                          : ''
                      }`}
                    >
                      <td className="py-2 px-4">{i + 1}</td>
                      <td className="py-2 px-4 flex items-center gap-2">
                        {i === 0 && '🥇'}
                        {i === 1 && '🥈'}
                        {i === 2 && '🥉'}
                        <span>{u.name}</span>
                      </td>
                      <td className="py-2 px-4">{u.approved}</td>
                      <td className="py-2 px-4">{u.unverified}</td>
                      <td className="py-2 px-4">{u.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}