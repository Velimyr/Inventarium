import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { Menu, X, Bell } from 'lucide-react';
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
    <header className="flex items-start sm:items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 flex-wrap gap-4 sm:gap-0">
      {/* (логотип)*/}
      <div className="flex-shrink-0 flex sm:block justify-center sm:justify-start w-full sm:w-auto mt-1 mb-2 sm:my-0">
        <Image
          src="/inventarium_logo.webp"
          alt="Логотип"
          width={96}
          height={96}
          priority
          className="sm:w-[120px] sm:h-[120px] w-[96px] h-[96px]"
        />
      </div>

      {/* Центральна частина */}
      <div className="flex flex-col flex-grow mx-4 sm:mx-6 min-w-0 max-w-full text-center sm:text-left items-center sm:items-start">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mb-1 truncate">
          Інвентаріум
        </h1>
        <p className="hidden sm:block text-lg text-gray-700 dark:text-gray-300 mb-4 truncate">
          Реєстр інвентарних описів маєтків на українських землях
        </p>

        {/* Меню */}
        <nav>
          <ul className="hidden sm:flex flex-wrap space-x-4 sm:space-x-6 text-lg text-gray-700 dark:text-gray-300">
            <li><Link href="/" className="hover:underline">Головна</Link></li>
            <li><Link href="/map" className="hover:underline">Карта</Link></li>
            <li><Link href="/add_inventory" className="hover:underline">Додати інвентар</Link></li>
            <li><Link href="/stats" className="hover:underline">Мій внесок</Link></li>
            <li><Link href="/help" className="hover:underline">Посібники</Link></li>
            <li><Link href="/about" className="hover:underline">Про проєкт</Link></li>
          </ul>

          {/* Мобільне меню */}
          <div className="flex items-center justify-between sm:hidden text-lg text-gray-700 dark:text-gray-300">
            <div className="flex space-x-4">
              <Link href="/" className="hover:underline">Головна</Link>
              <Link href="/map" className="hover:underline">Карта</Link>
              <Link href="/add_inventory" className="hover:underline">Додати інвентар</Link>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Меню"
              className="p-2"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {mobileMenuOpen && (
            <ul className="flex flex-col mt-2 space-y-2 text-lg text-gray-700 dark:text-gray-300 sm:hidden">
              <li><Link href="/stats" className="hover:underline">Мій внесок</Link></li>
              <li><Link href="/help" className="hover:underline">Посібники</Link></li>
              <li><Link href="/about" className="hover:underline">Про проєкт</Link></li>
            </ul>
          )}
        </nav>
      </div>

      {/* Тема + юзер */}
      <div className="flex items-center justify-between space-x-4 sm:flex-col sm:items-end sm:space-x-0 sm:space-y-2 w-full sm:w-auto">
        {/* Перемикач тем */}
        <button
          onClick={toggleTheme}
          aria-label="Перемкнути тему"
          className="focus:outline-none"
        >
          {theme === 'light' ? (
            <svg
              className="h-8 w-8 text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v1m0 16v1m8.66-9h1M3 12H2m15.36 6.36l.7.7M6.34 6.34l.7.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z"
              />
            </svg>
          ) : (
            <svg
              className="h-8 w-8 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
              />
            </svg>
          )}
        </button>

        {/* Юзер / кнопки увійти-вийти */}
        <div className="text-sm text-gray-800 dark:text-gray-100 text-right flex-grow">
          {loading ? (
            <div className="italic text-gray-500 dark:text-gray-400">Завантаження…</div>
          ) : user ? (
            <div className="flex items-center justify-between sm:flex-col sm:items-end sm:space-y-1">
              <div className="flex items-center space-x-3">
                {/* Іконка повідомлень */}
                <Link href="/messages" className="relative">
                  <Bell 
                    size={24} 
                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer" 
                  />
                  {getUnreadBadge() && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                      {getUnreadBadge()}
                    </span>
                  )}
                </Link>
                
                <span className="truncate max-w-[60%] sm:max-w-full">👤 {user.email}</span>
              </div>
              <button
                onClick={signOut}
                className="ml-4 sm:ml-0 px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded text-sm hover:bg-gray-400 dark:hover:bg-gray-500 transition"
              >
                Вийти
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="w-full sm:w-auto px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded text-sm hover:bg-gray-400 dark:hover:bg-gray-500 transition"
            >
              Увійти через Google
            </button>
          )}
        </div>
      </div>
    </header>
  );
}