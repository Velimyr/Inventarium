import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { Menu, X, Bell, Sun, Moon } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

type Theme = 'light' | 'dark';

export default function Header() {
  const [theme, setTheme] = useState<Theme>('light');
  const { user, loading } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    // Завантажуємо кількість непрочитаних повідомлень
    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('to_user_id', user.id)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    };

    fetchUnreadCount();

    // Підписка на зміни в таблиці messages
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `to_user_id=eq.${user.id}`
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem('theme', newTheme);
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    location.reload();
  };

  const getUnreadBadge = () => {
    if (unreadCount === 0) return null;
    if (unreadCount > 99) return '99+';
    return unreadCount.toString();
  };

  return (
    <header className="bg-white dark:bg-[#111827] border-b border-gray-300 dark:border-[#374151]">
      <div className="flex items-center justify-between gap-[15px] md:gap-[20px] lg:gap-[30px] px-4 md:px-8 lg:px-[50px] py-[15px] lg:py-[20px]">
        {/* Логотип + Назва */}
        <Link href="/" className="flex items-center gap-[12px] md:gap-[15px] lg:gap-[20px] flex-shrink-0">
          <Image
            src="/inventarium_logo.webp"
            alt="Логотип Інвентаріум"
            width={60}
            height={60}
            priority
            className="w-[45px] h-[45px] md:w-[50px] md:h-[50px] lg:w-[60px] lg:h-[60px]"
          />
          <div className="hidden sm:block">
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] md:text-[20px] lg:text-[24px] font-bold leading-tight">
              Інвентаріум
            </h1>
            <p className="text-gray-700 dark:text-white text-[11px] md:text-[12px] lg:text-[13px] opacity-80 leading-tight mt-[2px]">
              Реєстр інвентарних описів
            </p>
          </div>
        </Link>

        {/* Progressive Navigation - показує стільки пунктів, скільки влазить */}
        <nav className="flex xl:hidden items-center gap-[12px] md:gap-[15px]">
          {/* Завжди показуємо на мобільних */}
          <Link href="/" className="text-gray-900 dark:text-[#F3F4F6] text-[13px] md:text-[14px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap">
            Головна
          </Link>
          <Link href="/map" className="text-gray-900 dark:text-[#F3F4F6] text-[13px] md:text-[14px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap">
            Карта
          </Link>
          {/* Показуємо на середніх екранах (md і вище) */}
          <Link href="/add_inventory" className="hidden md:block text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap">
            Додати інвентар
          </Link>
        </nav>

        {/* Desktop Navigation - всі пункти */}
        <nav className="hidden xl:flex items-center gap-[25px] flex-grow justify-center">
          <Link href="/" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Головна
          </Link>
          <Link href="/map" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Карта
          </Link>
          <Link href="/add_inventory" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Додати інвентар
          </Link>
          <Link href="/stats" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Мій внесок
          </Link>
          <Link href="/help" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Посібники
          </Link>
          <Link href="/about" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
            Про проєкт
          </Link>
        </nav>

        {/* Right Side: Theme + User + Mobile Menu */}
        <div className="flex items-center gap-[10px] md:gap-[12px] lg:gap-[15px]">
          {/* Theme Toggle - Desktop Only */}
          <button
            onClick={toggleTheme}
            aria-label="Перемкнути тему"
            className="hidden xl:block p-[8px] rounded-lg hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
          >
            {theme === 'light' ? (
              <Sun className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            ) : (
              <Moon className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            )}
          </button>

          {/* Messages Icon - Mobile/Tablet Only (показується тільки якщо user залогінений) */}
          {user && (
            <Link href="/messages" className="xl:hidden relative p-[8px] rounded-lg hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors">
              <Bell className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
              {getUnreadBadge() && (
                <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-[4px]">
                  {getUnreadBadge()}
                </span>
              )}
            </Link>
          )}

          {/* User Section - Desktop Only */}
          {loading ? (
            <div className="hidden xl:block text-gray-500 dark:text-gray-400 text-[14px]">Завантаження…</div>
          ) : user ? (
            <div className="hidden xl:flex items-center gap-[12px]">
              {/* Messages Icon */}
              <Link href="/messages" className="relative p-[8px] rounded-lg hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors">
                <Bell className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                {getUnreadBadge() && (
                  <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-[4px]">
                    {getUnreadBadge()}
                  </span>
                )}
              </Link>

              {/* User Email */}
              <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium max-w-[150px] truncate">
                {user.email}
              </span>

              {/* Sign Out Button */}
              <button
                onClick={signOut}
                className="px-[12px] h-[36px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
              >
                Вийти
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="hidden xl:flex px-[15px] h-[36px] rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors items-center"
            >
              Увійти через Google
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Меню"
            className="xl:hidden p-[8px] rounded-lg hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            ) : (
              <Menu className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden px-4 md:px-8 pb-[15px] border-t border-gray-300 dark:border-[#374151]">
          <nav className="flex flex-col gap-[12px] mt-[15px] mb-[15px]">
            {/* Додати інвентар - ховаємо на md+ де він вже показаний */}
            <Link href="/add_inventory" className="md:hidden text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
              Додати інвентар
            </Link>
            <Link href="/stats" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
              Мій внесок
            </Link>
            <Link href="/help" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
              Посібники
            </Link>
            <Link href="/about" className="text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors">
              Про проєкт
            </Link>
          </nav>

          {/* Theme Toggle in Mobile Menu */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-[10px] text-gray-900 dark:text-[#F3F4F6] text-[15px] font-medium w-full py-[8px] hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors"
          >
            {theme === 'light' ? (
              <>
                <Sun className="w-5 h-5" strokeWidth={2} />
                <span>Світла тема</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5" strokeWidth={2} />
                <span>Темна тема</span>
              </>
            )}
          </button>

          {/* Mobile User Section */}
          {user ? (
            <div className="flex flex-col gap-[12px] pt-[15px] border-t border-gray-300 dark:border-[#374151]">
              <div className="text-gray-900 dark:text-[#F3F4F6] text-[14px] truncate">
                {user.email}
              </div>
              <button
                onClick={signOut}
                className="w-full px-[12px] h-[36px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
              >
                Вийти
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="w-full px-[15px] h-[36px] rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors mt-[15px]"
            >
              Увійти через Google
            </button>
          )}
        </div>
      )}
    </header>
  );
}