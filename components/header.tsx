import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { Menu, X } from 'lucide-react';

type Theme = 'light' | 'dark';

export default function Header() {
    const [theme, setTheme] = useState<Theme>('light');
    const [user, setUser] = useState<any>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved) {
            setTheme(saved);
            document.documentElement.classList.toggle('dark', saved === 'dark');
        }

        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            listener?.subscription.unsubscribe();
        };
    }, []);

    const toggleTheme = () => {
        const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        localStorage.setItem('theme', newTheme);
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        location.reload();
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
                    {/* Десктоп: усі посилання */}
                    <ul className="hidden sm:flex flex-wrap space-x-4 sm:space-x-6 text-lg text-gray-700 dark:text-gray-300">
                        <li><Link href="/" className="hover:underline">Головна</Link></li>
                        <li><Link href="/map" className="hover:underline">Карта</Link></li>
                        <li><Link href="/add_inventory" className="hover:underline">Додати інвентар</Link></li>
                        <li><Link href="/help" className="hover:underline">Документація</Link></li>
                        <li><Link href="/about" className="hover:underline">Про проєкт</Link></li>
                        <li><Link href="/volunteer" className="hover:underline">Долучитися до проєкту</Link></li>
                        <li><Link href="/feedback" className="hover:underline">Відгуки та пропозиції</Link></li>
                    </ul>

                    {/* Мобільне меню: перші 2 + бургер */}
                    <div className="flex items-center justify-between sm:hidden text-lg text-gray-700 dark:text-gray-300">
                        <div className="flex space-x-4">
                            <Link href="/" className="hover:underline">Головна</Link>
                            <Link href="/map" className="hover:underline">Карта</Link>
                        </div>
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Меню"
                            className="p-2"
                        >
                            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>

                    {/* Мобільне випадаюче меню */}
                    {mobileMenuOpen && (
                        <ul className="flex flex-col mt-2 space-y-2 text-lg text-gray-700 dark:text-gray-300 sm:hidden">
                            <li><Link href="/add_inventory" className="hover:underline">Додати інвентар</Link></li>
                            <li><Link href="/help" className="hover:underline">Документація</Link></li>
                            <li><Link href="/about" className="hover:underline">Про проєкт</Link></li>
                            <li><Link href="/volunteer" className="hover:underline">Долучитися до проєкту</Link></li>
                            <li><Link href="/feedback" className="hover:underline">Відгуки та пропозиції</Link></li>
                        </ul>
                    )}
                </nav>
            </div>

            {/* Тема + юзер */}

            <div className="flex-shrink-0 flex-col items-end sm:flex sm:flex-col sm:items-end space-y-2 sm:space-y-2 hidden sm:flex">
                <button
                    onClick={toggleTheme}
                    aria-label="Перемкнути тему"
                    className="focus:outline-none"
                >
                    {theme === 'light' ? (
                        <svg className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 3v1m0 16v1m8.66-9h1M3 12H2m15.36 6.36l.7.7M6.34 6.34l.7.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" />
                        </svg>
                    ) : (
                        <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                    )}
                </button>

                {user && (
                    <div className="text-sm text-gray-800 dark:text-gray-100 text-right hidden sm:block">
                        <div className="mb-1 truncate max-w-[160px]">👤 {user.email}</div>
                        <button
                            onClick={signOut}
                            className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition text-sm"
                        >
                            Вийти
                        </button>
                    </div>
                )}
            </div>

            {user && (
                <div className="flex sm:hidden justify-between items-center w-full text-sm text-gray-800 dark:text-gray-100">
                    <span className="truncate max-w-[60%]">👤 {user.email}</span>
                    <button
                        onClick={signOut}
                        className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition text-sm"
                    >
                        Вийти
                    </button>
                </div>
            )}
        </header>
    );
}
