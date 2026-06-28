import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import FooterDonate from '../components/FooterDonate';
import Balloons from '../components/Balloons';
import { useUser } from '../contexts/UserContext';
import { Search, Map, FileText, Plus } from "lucide-react";
import { isAdminUser } from '../lib/adminUsers';

export default function Home() {
  const { user, loading: userLoading } = useUser();
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userApprovedCount, setUserApprovedCount] = useState(0);
  const [userUnverifiedCount, setUserUnverifiedCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasContributed, setHasContributed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
      setIsAdmin(await isAdminUser(supabase, user.id));

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

  const handleSearch = () => {
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    } else {
      window.location.href = '/search';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <>
      <Header />
      <Balloons />

      {/* Hero Section */}
      <div className="bg-white dark:bg-[#111827] pb-[120px] md:pb-[50px] lg:pb-[70px]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[30px] lg:py-[50px]">
          <div className="max-w-3xl">
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[28px] md:text-[36px] lg:text-[42px] font-normal mb-[15px] lg:mb-[20px]">
              Всього <span className="font-bold">{loading ? '...' : totalRecords.toLocaleString('uk-UA')}</span> інвентарів в реєстрі
            </h1>
            <p className="text-gray-700 dark:text-white text-[15px] md:text-[16px] lg:text-[18px] opacity-80 mb-[25px] lg:mb-[35px]">
              Реєстр інвентарних описів маєтків на українських землях — ваш
              доступ до історичних документів та архівних даних
            </p>

            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-[15px] mb-[35px] lg:mb-[50px]">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Введіть населений пункт, назву або сигнатуру справи"
                  className="w-full h-[48px] lg:h-[52px] px-[15px] lg:px-[20px] pr-[45px] lg:pr-[50px] bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-[14px] lg:text-[15px]"
                />
                <Search className="absolute right-[15px] lg:right-[18px] top-1/2 -translate-y-1/2 w-5 h-5 lg:w-6 lg:h-6 text-gray-400" strokeWidth={2} />
              </div>
              <button 
                onClick={handleSearch}
                className="px-[25px] lg:px-[30px] h-[48px] lg:h-[52px] bg-[#2563EB] text-white text-[14px] lg:text-[15px] font-medium rounded-lg hover:bg-[#1D4ED8] transition-colors"
              >
                Шукати
              </button>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px] lg:gap-[25px] mt-[35px] lg:mt-[50px]">
            <button
              onClick={() => window.location.href = '/add_inventory'}
              className="group p-[25px] lg:p-[30px] bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
            >
              <div className="w-[48px] h-[48px] lg:w-[52px] lg:h-[52px] bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-[15px] lg:mb-[18px] group-hover:bg-[#2563EB]/20 transition-colors">
                <Plus className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[8px] lg:mb-[10px]">
                Додати інвентар
              </h3>
              <p className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70">
                Поповніть базу новими історичними інвентарями
              </p>
            </button>

            <button
              onClick={() => window.location.href = '/map'}
              className="group p-[25px] lg:p-[30px] bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
            >
              <div className="w-[48px] h-[48px] lg:w-[52px] lg:h-[52px] bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-[15px] lg:mb-[18px] group-hover:bg-[#2563EB]/20 transition-colors">
                <Map className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[8px] lg:mb-[10px]">
                Інтерактивна карта
              </h3>
              <p className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70">
                Знайдіть маєтки на карті українських земель
              </p>
            </button>

            <button
              onClick={() => window.location.href = '/help'}
              className="group p-[25px] lg:p-[30px] bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all md:col-span-2 lg:col-span-1 text-left"
            >
              <div className="w-[48px] h-[48px] lg:w-[52px] lg:h-[52px] bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-[15px] lg:mb-[18px] group-hover:bg-[#2563EB]/20 transition-colors">
                <FileText className="w-6 h-6 text-[#2563EB]" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[8px] lg:mb-[10px]">
                Документація
              </h3>
              <p className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70">
                Дізнайтеся більше про проєкт та методологію
              </p>
            </button>
          </div>

          {/* My Contribution Section */}
          <div className="mt-[50px] lg:mt-[70px]">
            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] lg:text-[28px] font-bold mb-[25px] lg:mb-[30px]">
              Мій внесок в Інвентаріум
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px] lg:gap-[25px]">
              {/* Stats Card */}
              <button
                onClick={() => window.location.href = '/stats'}
                className="group p-[25px] lg:p-[30px] bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
              >
                {/* Top Content */}
                <div className="flex flex-col gap-[25px] mb-[25px]">
                  {/* Rank */}
                  <div>
                    <div className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70 mb-[8px]">
                      Моє звання
                    </div>
                    <div className="text-gray-900 dark:text-[#F3F4F6] text-[24px] lg:text-[28px] font-bold">
                      {getRank()}
                    </div>
                  </div>

                  {/* Approved Count */}
                  <div>
                    <div className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70 mb-[8px]">
                      Додані мною інвентарі
                    </div>
                    <div className="text-gray-900 dark:text-[#F3F4F6] text-[24px] lg:text-[28px] font-bold">
                      {user ? userApprovedCount : '—'}
                    </div>
                  </div>
                </div>

                {/* Bottom Link */}
                <div className="flex items-center justify-end gap-[8px] text-[#2563EB] group-hover:text-[#1D4ED8]">
                  <span className="text-[14px] lg:text-[15px] font-medium">Детальна статистика</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Volunteer Card */}
              <button
                onClick={() => window.location.href = '/volunteer'}
                className="group p-[25px] lg:p-[30px] bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
              >
                {/* Top Content */}
                <div className="mb-[25px]">
                  <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] lg:text-[28px] font-bold mb-[10px]">
                    Стати волонтером<br />Інвентаріуму
                  </h3>
                  <p className="text-gray-700 dark:text-white text-[14px] lg:text-[15px] opacity-70">
                    Приєднуйтесь до команди та допомагайте зберігати історичну спадщину України
                  </p>
                </div>

                {/* Bottom Link */}
                <div className="flex items-center justify-end gap-[8px] text-[#2563EB] group-hover:text-[#1D4ED8]">
                  <span className="text-[14px] lg:text-[15px] font-medium">Дізнатися більше</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <FooterDonate />
    </>
  );
}
