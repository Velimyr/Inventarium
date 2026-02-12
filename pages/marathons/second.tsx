import { useEffect, useState } from 'react';
import Header from '../../components/header';
import { useUser } from '../../contexts/UserContext';
import { Trophy, Medal, ChevronDown, ChevronUp, Loader2, BookOpen } from 'lucide-react';
import cobookConfig from '../cobook/cobook.json';

interface UserTotals {
  transcriptions_orig: number;
  transcriptions_ua: number;
  indexes_orig: number;
  indexes_ua: number;
  completed_projects_count: number;
  exported_projects_count: number;
  projects_count: number;
  bookpoints: number;
}

interface MarathonUser {
  nickname: string;
  totals: UserTotals;
}

interface Marathon {
  title: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
}

interface ApiResponse {
  message: string;
  marathon: Marathon;
  users: MarathonUser[];
  totals: UserTotals;
}

export default function Marathon2Page() {
  const { user } = useUser();
  const [marathonData, setMarathonData] = useState<Marathon | null>(null);
  const [users, setUsers] = useState<MarathonUser[]>([]);
  const [myStats, setMyStats] = useState<UserTotals | null>(null);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const config = cobookConfig as { base_url: string; token: string };
  const baseUrl = config.base_url.replace(/\/+$/, '');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `${baseUrl}/api/marathon/stats`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${config.token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ApiResponse = await response.json();
        
        setMarathonData(data.marathon);
        
        // Сортуємо користувачів за bookpoints
        const sortedUsers = [...(data.users || [])].sort((a, b) => 
          b.totals.bookpoints - a.totals.bookpoints
        );
        setUsers(sortedUsers);

        // Знаходимо статистику поточного користувача
        if (user) {
          const currentUserNickname = user.user_metadata?.name || user.email;
          const myData = sortedUsers.find(u => u.nickname === currentUserNickname);
          
          if (myData) {
            setMyStats(myData.totals);
            const position = sortedUsers.findIndex(u => u.nickname === currentUserNickname) + 1;
            setMyPosition(position);
          } else {
            setMyStats(null);
            setMyPosition(null);
          }
        }
      } catch (err) {
        console.error('Error fetching marathon stats:', err);
        setError('Не вдалося завантажити дані марафону');
        setUsers([]);
        setMyStats(null);
        setMyPosition(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, baseUrl, config.token]);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
            Другий Інвентарний Марафон - "Скарб архівіста"
          </h1>
          <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[20px] lg:mb-[30px]">
            Дата проведення: 15 лютого — 15 квітня 2026 року
          </p>

          {/* Rules Section */}
          <section className="mb-[20px]">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full flex items-center justify-between p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
            >
              <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold">
                Правила Другого Інвентарного марафону
              </span>
              {showRules ? (
                <ChevronUp className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
              )}
            </button>
            {showRules && (
              <div className="mt-[10px] p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] space-y-[15px] text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                <p><strong>Другий Інвентарний Марафон</strong> <br /> Проходить з 15 лютого по 15 квітня 2026 року.</p>
                <p>Завдання учасників — створювати проєкти транскрибування інвентарів у системі <strong>CoBook</strong> та заробляти <strong>BookPoints</strong> за транскрипції та індексацію.</p>

                <div className="space-y-[15px]">
                  <h3 className="text-[16px] lg:text-[18px] font-semibold">Як набрати BookPoints:</h3>
                  <div className="space-y-[10px]">
                    <div>
                      <p><strong>Створення проєктів:</strong></p>
                      <p>Створюйте проєкти транскрибування інвентарів у CoBook через сторінку запису в Інвентаріумі (це важливо!). Кожен створений проєкт враховується у вашій статистиці.</p>
                    </div>

                    <div>
                      <p><strong>Транскрибування:</strong></p>
                      <p>За кожну транскрибовану сторінку нараховуються BookPoints. Коефіцієнти будуть відрізнятися залежно від мови документа. Якщо інвентар написаний російською - додаткових балів не нараховується, якщо інвентар складений старопольською - за транскрибування ви отримуєте в 3 рази більше BookPoints! А якщо інвентар даписаний староукраїнською (руською) мовою - то ви отримаєте в 5 разів більше BookPoints! Зверність увагу, CoBook підтимує командну роботу, але бали будуть нараховуватися тому, хто перший розпочав завдання (опрацювання певної сторінки)</p>
                    </div>

                    <div>
                      <p><strong>Індексація:</strong></p>
                      <p>Створюйте індекси для транскрибованих документів (оригінальною мовою або українською). Індексація також приносить BookPoints.</p>
                    </div>

                    <div>
                      <p><strong>Завершення проєктів:</strong></p>
                      <p>Завершені та експортовані проєкти отримують додаткові бонусні BookPoints. <strong>Важливо не тільки розпочати проєкт, але й його закінчити!</strong></p>
                    </div>

                    <div>
                      <p><strong>Часові рамки:</strong></p>
                      <p>Усі дії повинні бути виконані в період проведення марафону — з 15 лютого по 15 квітня 2026 року.</p>
                    </div>
                  </div>
                </div>

                <h3 className="text-[16px] lg:text-[18px] font-semibold">Бонуси та винагороди:</h3>
                <div className="space-y-[12px]">
                  <p>Переможці марафону отримають цінні призи. Чим більше BookPoints ви наберете, тим вищі ваші шанси на перемогу!</p>
                  
                  <div className="bg-white dark:bg-[#111827] p-[16px] rounded-lg space-y-[12px]">
                    <div className="flex items-start gap-[12px]">
                      <span className="text-[24px] flex-shrink-0">🥇</span>
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] mb-[6px]">За перше місце:</p>
                        <ul className="list-disc list-inside ml-[4px] space-y-[4px] text-[14px]">
                          <li>Фірмова футболка проєкту "Інвентаріум"</li>
                          <li>ДНК-тест MyHeritage від пана Тараса</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-start gap-[12px]">
                      <span className="text-[24px] flex-shrink-0">🥈</span>
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] mb-[6px]">За друге місце:</p>
                        <ul className="list-disc list-inside ml-[4px] space-y-[4px] text-[14px]">
                          <li>Копіювання однієї архівної справи в архіві (на вибір: ДАЖО від пані Каріни, ЦДІАК від пана Віктора)</li>
                          <li>Книга "Люди без облич" і комплект листівок</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-start gap-[12px]">
                      <span className="text-[24px] flex-shrink-0">🥉</span>
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] mb-[6px]">За третє місце:</p>
                        <ul className="list-disc list-inside ml-[4px] space-y-[4px] text-[14px]">
                          <li>Книга від пана Сергія</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="font-semibold text-center pt-[10px]">
                  Долучайтесь до Другого Інвентарного Марафону, транскрибуйте інвентарі в CoBook — та набирайте BookPoints для перемоги!
                </p>
              </div>
            )}
          </section>

          {/* Error message */}
          {error && (
            <div className="mb-[20px] p-[15px] rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20">
              <p className="text-red-700 dark:text-red-400 text-[14px] lg:text-[16px]">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-[40px]">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" strokeWidth={2} />
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Leaderboard */}
              <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Trophy className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                    Таблиця лідерів
                  </h2>
                </div>
                
                {users.length === 0 ? (
                  <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-60 py-[20px] text-center">
                    Поки що немає учасників
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-300 dark:border-[#374151]">
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">#</th>
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Учасник</th>
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Проєкти</th>
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Транскрипції</th>
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Індекси</th>
                          <th className="py-[10px] px-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Букпоінти (всього)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u, i) => {
                          const currentUserNickname = user?.user_metadata?.name || user?.email;
                          const isCurrentUser = u.nickname === currentUserNickname;
                          
                          // Кольори для топ-3
                          let bgClass = '';
                          let textClass = 'text-gray-900 dark:text-white';
                          
                          if (i === 0) {
                            // Золото
                            bgClass = 'bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/40 dark:to-yellow-800/20';
                          } else if (i === 1) {
                            // Срібло
                            bgClass = 'bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700/40 dark:to-gray-600/20';
                          } else if (i === 2) {
                            // Бронза
                            bgClass = 'bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-800/20';
                          }
                          
                          return (
                            <tr
                              key={u.nickname}
                              className={`border-b border-gray-200 dark:border-[#374151] ${bgClass}`}
                            >
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px]`}>{i + 1}</td>
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px]`}>
                                <div className="flex items-center gap-2">
                                  {i === 0 && <span className="text-[18px]">🥇</span>}
                                  {i === 1 && <span className="text-[18px]">🥈</span>}
                                  {i === 2 && <span className="text-[18px]">🥉</span>}
                                  <span className={i < 3 ? 'font-semibold' : ''}>{u.nickname}</span>
                                </div>
                              </td>
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px]`}>
                                {u.totals.projects_count}
                              </td>
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px]`}>
                                {u.totals.transcriptions_orig + u.totals.transcriptions_ua}
                              </td>
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px]`}>
                                {u.totals.indexes_orig + u.totals.indexes_ua}
                              </td>
                              <td className={`py-[10px] px-[10px] ${textClass} text-[13px] lg:text-[14px] ${i < 3 ? 'font-bold' : 'font-semibold'}`}>
                                {u.totals.bookpoints}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}