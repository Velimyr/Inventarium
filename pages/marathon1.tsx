import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import { Trophy, Medal, ChevronDown, ChevronUp } from 'lucide-react';

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
      const fromDate = '2025-08-01T00:00:00';
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
          if (!rec.created_by) {
            console.warn('[approvedRecords] Record with null created_by. ID:', rec.id, 'Full record:', rec);
            continue;
          }
          if (rec.created_by === '3dd4529a-268b-417a-8b61-4136fee07666') continue;
          if (!userMap[rec.created_by]) {
            userMap[rec.created_by] = { user_id: rec.created_by, name: '', approved: 0, unverified: 0, total: 0 };
          }
          userMap[rec.created_by].approved++;
        }

        for (const rec of (unverifiedRecords || []).filter(r => !!r.created_by && r.created_by !== '3dd4529a-268b-417a-8b61-4136fee07666')) {
          if (!userMap[rec.created_by]) {
            userMap[rec.created_by] = { user_id: rec.created_by, name: '', approved: 0, unverified: 0, total: 0 };
          }
          userMap[rec.created_by].unverified++;
        }

        const list = Object.values(userMap).map((u) => ({
          ...u,
          total: u.approved + u.unverified
        }));

        // Сортування: спочатку за total, потім за датою найпершого запису користувача
        list.sort((a, b) => {
          if (b.total !== a.total) {
            return b.total - a.total;
          }
          const aFirstDate = Math.min(
            ...(approvedRecords?.filter(r => r.created_by === a.user_id).map(r => new Date(r.created_at).getTime()) || []),
            ...(unverifiedRecords?.filter(r => r.created_by === a.user_id).map(r => new Date(r.created_at).getTime()) || [])
          );
          const bFirstDate = Math.min(
            ...(approvedRecords?.filter(r => r.created_by === b.user_id).map(r => new Date(r.created_at).getTime()) || []),
            ...(unverifiedRecords?.filter(r => r.created_by === b.user_id).map(r => new Date(r.created_at).getTime()) || [])
          );
          return aFirstDate - bFirstDate;
        });

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
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
            Перший Інвентарний Марафон
          </h1>
          <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[20px] lg:mb-[30px]">
            Дата проведення: серпень 2025 року
          </p>

          {/* Rules Section */}
          <section className="mb-[20px]">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full flex items-center justify-between p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
            >
              <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold">
                Правила Інвентарного марафону
              </span>
              {showRules ? (
                <ChevronUp className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
              )}
            </button>
            {showRules && (
              <div className="mt-[10px] p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] space-y-[15px] text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                <p><strong>Перший Інвентарний Марафон</strong> <br /> Проходить з 1 серпня по 31 серпня 2025 року.</p>
                <p>Завдання учасників — знайти в архівах та бібліотеках якомога більше інвентарів і додати їх до реєстру <strong>Інвентаріум</strong>.</p>

                <div className="space-y-[15px]">
                  <h3 className="text-[16px] lg:text-[18px] font-semibold">Умови зарахування інвентарів:</h3>
                  <div className="space-y-[10px]">
                    <div>
                      <p><strong>Авторизація на сайті:</strong></p>
                      <p>Щоб інвентар був зарахований, його потрібно додати, будучи авторизованим користувачем сайту Інвентаріум. Якщо інвентар додано без входу в акаунт — він не враховується у статистиці марафону.</p>
                    </div>

                    <div>
                      <p><strong>Підтвердження адміністратором:</strong></p>
                      <p>Інвентар має пройти перевірку адміністратора. Якщо запис не відповідає вимогам (наприклад, неповні дані, дублікати або помилки), його можуть відхилити. Тільки підтверджені записи враховуються в підсумку.</p>
                    </div>

                    <div>
                      <p><strong>Оцінювання записів:</strong></p>
                      <p>Кількість балів нараховується за окремі населені пункти з інвентаря. Наприклад:</p>
                      <ul className="list-disc list-inside ml-4">
                        <li>В одному інвентарі є згадки про 10 сіл чи містечок.</li>
                        <li>Якщо ви додасте до реєстру 10 окремих записів для кожного з них — отримаєте 10 балів у марафоні.</li>
                      </ul>
                      <p>Однаково зараховуються як записи з типом "місце", так і з типом "регіон".</p>
                    </div>

                    <div>
                      <p><strong>Часові рамки:</strong></p>
                      <p>Інвентар повинен бути і доданий, і підтверджений в період проведення марафону — з 1 по 31 серпня 2025 року. Записи, додані до початку марафону або підтверджені після його завершення, не враховуються.</p>
                    </div>
                  </div>
                </div>

                <h3 className="text-[16px] lg:text-[18px] font-semibold">Бонуси та винагороди:</h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6">
                  <div className="sm:w-2/3">
                    <p>
                      Усі, хто додасть хоча б один запис, отримають запрошення на закриту онлайн-зустріч —
                      <strong> "Генеалогічну балачку"</strong> з Сергієм Фазульяновим та Віктором Долецьким.
                    </p>
                    <p className="mt-2">
                      Під час зустрічі ви дізнаєтесь про генеалогічні джерела, архівний пошук і зможете поставити свої запитання.
                    </p>
                  </div>
                  <div className="sm:w-1/3 mt-4 sm:mt-0">
                    <img
                      src="/images/marathon/balachka.png"
                      alt="Генеалогічна балачка"
                      className="w-full max-w-[250px] mx-auto sm:mx-0 rounded shadow-md"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <div className="sm:w-2/3">
                    <p>
                      Також серед учасників, які додадуть <strong>щонайменше 10 записів</strong>, ми розіграємо призи:
                    </p>
                    <p className="mt-4">
                      Кожні 10 записів = 1 шанс на виграш.
                      <br />
                      10 записів — 1 шанс, 20 — 2 шанси, 30 — 3 шанси і т.д.
                    </p>
                  </div>

                  <div className="sm:w-1/3 flex gap-4 justify-center">
                    <div className="flex flex-col items-center">
                      <img
                        src="/images/marathon/tshirt.png"
                        alt="Футболка Інвентаріум"
                        className="w-full max-w-[150px] h-[220px] object-contain rounded shadow-md"
                      />
                      <span className="mt-2 font-medium text-center">Футболка "Інвентаріум"</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <img
                        src="/images/marathon/book.png"
                        alt="Книга Люди без облич"
                        className="w-full max-w-[150px] h-[220px] object-contain rounded shadow-md"
                      />
                      <span className="mt-2 font-medium text-center">Книга "Люди без облич"</span>
                    </div>
                  </div>
                </div>
                <p className="font-semibold">
                  Долучайтесь до Першого Інвентарного Марафону, шукайте й додавайте інвентарі — та вигравайте призи!
                </p>
              </div>
            )}
          </section>

          {/* My Participation */}
          <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
            <div className="flex items-center gap-[10px] mb-[15px]">
              <Medal className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
              <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                Моя участь
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
              <div>
                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[5px]">
                  Мої інвентарі в марафоні
                </p>
                <p className="text-gray-900 dark:text-white text-[28px] lg:text-[32px] font-bold">
                  {myStats ? myStats.total : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[5px]">
                  Моя позиція в марафоні
                </p>
                <p className="text-gray-900 dark:text-white text-[28px] lg:text-[32px] font-bold">
                  {myStats ? myStats.position : '—'}
                </p>
              </div>
            </div>
          </section>

          {/* Leaderboard */}
          <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
            <div className="flex items-center gap-[10px] mb-[15px]">
              <Trophy className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
              <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                Таблиця лідерів
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-[#374151]">
                    <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">#</th>
                    <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Імʼя</th>
                    <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Підтверджено</th>
                    <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Очікує</th>
                    <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Всього</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((u, i) => (
                    <tr
                      key={u.user_id}
                      className={`border-b border-gray-200 dark:border-[#374151] ${
                        u.user_id === user?.id
                          ? 'bg-blue-100 dark:bg-blue-900 font-semibold'
                          : i < 3
                            ? 'bg-yellow-100 dark:bg-yellow-900'
                            : ''
                      }`}
                    >
                      <td className="py-[10px] px-[10px] text-gray-900 dark:text-white text-[13px] lg:text-[14px]">{i + 1}</td>
                      <td className="py-[10px] px-[10px] text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
                        <div className="flex items-center gap-2">
                          {i === 0 && '🥇'}
                          {i === 1 && '🥈'}
                          {i === 2 && '🥉'}
                          <span>{u.name}</span>
                        </div>
                      </td>
                      <td className="py-[10px] px-[10px] text-gray-900 dark:text-white text-[13px] lg:text-[14px]">{u.approved}</td>
                      <td className="py-[10px] px-[10px] text-gray-900 dark:text-white text-[13px] lg:text-[14px]">{u.unverified}</td>
                      <td className="py-[10px] px-[10px] text-gray-900 dark:text-white text-[13px] lg:text-[14px]">{u.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}