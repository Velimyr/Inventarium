import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import FooterDonate from '../components/FooterDonate';
import { useUser } from '../contexts/UserContext';
import { Search, Map, FileText, Plus } from "lucide-react";

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
      
      {/* Hero Section */}
      <div className="bg-white dark:bg-[#111827]">
        <div className="w-full px-4 md:px-8 lg:px-[52px] py-12 md:py-24">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-normal text-gray-900 dark:text-white mb-4 md:mb-6">
              Всього <span className="font-bold">{loading ? '...' : totalRecords.toLocaleString('uk-UA')}</span> інвентарів в реєстрі
            </h1>
            <p className="text-base md:text-xl text-gray-700 dark:text-gray-300 mb-6 md:mb-8 opacity-80">
              Реєстр інвентарних описів маєтків на українських землях — ваш
              доступ до історичних документів та архівних даних
            </p>

            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8 md:mb-12">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Введіть населений пункт, назву або сигнатуру справи"
                  className="w-full h-12 md:h-14 px-4 md:px-6 pr-10 md:pr-12 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-sm md:text-base"
                />
                <Search className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-gray-400" />
              </div>
              <button 
                onClick={handleSearch}
                className="px-6 md:px-8 h-12 md:h-14 bg-[#2563EB] text-white font-medium rounded-lg hover:bg-[#1D4ED8] transition-colors text-sm md:text-base"
              >
                Шукати
              </button>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-8 md:mt-16">
            <button
              onClick={() => window.location.href = '/add_inventory'}
              className="group p-6 md:p-8 bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-3 md:mb-4 group-hover:bg-[#2563EB]/20 transition-colors">
                <Plus className="w-5 h-5 md:w-6 md:h-6 text-[#2563EB]" />
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Додати інвентар
              </h3>
              <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 opacity-70">
                Поповніть базу новими історичними інвентарями
              </p>
            </button>

            <button
              onClick={() => window.location.href = '/map'}
              className="group p-6 md:p-8 bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-3 md:mb-4 group-hover:bg-[#2563EB]/20 transition-colors">
                <Map className="w-5 h-5 md:w-6 md:h-6 text-[#2563EB]" />
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Інтерактивна карта
              </h3>
              <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 opacity-70">
                Знайдіть маєтки на карті українських земель
              </p>
            </button>

            <button
              onClick={() => window.location.href = '/help'}
              className="group p-6 md:p-8 bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all md:col-span-2 lg:col-span-1 text-left"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 bg-[#2563EB]/10 rounded-lg flex items-center justify-center mb-3 md:mb-4 group-hover:bg-[#2563EB]/20 transition-colors">
                <FileText className="w-5 h-5 md:w-6 md:h-6 text-[#2563EB]" />
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Документація
              </h3>
              <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 opacity-70">
                Дізнайтеся більше про проєкт та методологію
              </p>
            </button>
          </div>

          {/* My Contribution */}
          <div className="mt-12 md:mt-16">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 md:mb-8">
              Мій внесок в Інвентаріум
            </h2>
            
            <button
              onClick={() => window.location.href = '/stats'}
              className="w-full p-6 md:p-8 bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg hover:border-[#2563EB] transition-all text-left relative"
            >
              {/* Top Row */}
              <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                {/* Left: Rank */}
                <div>
                  <div className="text-base md:text-lg text-gray-600 dark:text-gray-400 mb-2">Моє звання</div>
                  <div className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {getRank()}
                  </div>
                </div>

                {/* Right: Approved Count */}
                <div className="md:text-right">
                  <div className="text-base md:text-lg text-gray-600 dark:text-gray-400 mb-2">Додані мною інвентарі</div>
                  <div className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {user ? userApprovedCount : '—'}
                  </div>
                </div>
              </div>

              {/* Bottom Right: Link with Arrow */}
              <div className="flex items-center justify-end gap-2 text-[#2563EB] group-hover:text-[#1D4ED8]">
                <span className="text-sm md:text-base font-medium">Детальна статистика</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>
      
      <FooterDonate />
    </>
  );
}