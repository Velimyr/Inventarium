import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

type Theme = 'light' | 'dark';

export default function Header() {
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved) {
            setTheme(saved);
            document.documentElement.classList.toggle('dark', saved === 'dark');
        }
    }, []);

    const toggleTheme = () => {
        const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        localStorage.setItem('theme', newTheme);
    };

    return (
        <header className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
            {/* Лівий блок: логотип великий */}
            <div className="flex-shrink-0">
                <Image
                    src="/inventarium_logo.webp"
                    alt="Логотип"
                    width={120}
                    height={120}
                    priority
                />
            </div>

            {/* Центральний блок: назва сайту, пояснення та меню */}
            <div className="flex flex-col flex-grow mx-4 sm:mx-6 min-w-0 max-w-full">
                <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mb-1 truncate">
                    Інвентаріум
                </h1>

                <p className="text-lg text-gray-700 dark:text-gray-300 mb-4 truncate">
                    Реєстр інвентарних описів маєтків на українських землях
                </p>

                <nav>
                    <ul className="flex flex-wrap overflow-x-auto space-x-4 sm:space-x-8 text-lg text-gray-700 dark:text-gray-300">
                        <li>
                            <Link href="/" className="hover:underline">
                                Головна
                            </Link>
                        </li>
                        <li>
                            <Link href="/map" className="hover:underline">
                                Карта
                            </Link>
                        </li>
                        <li>
                            <Link href="/about" className="hover:underline">
                                Про проєкт
                            </Link>
                        </li>
                        <li>
                            <Link href="/volunteer" className="hover:underline">
                                Долучитися до проєкту
                            </Link>
                        </li>
                        <li>
                            <Link href="/feedback" className="hover:underline">
                                Відгуки і пропозиції
                            </Link>
                        </li>
                    </ul>
                </nav>
            </div>

            {/* Правий блок: кнопка перемикання теми, по центру по вертикалі */}
            <div className="flex-shrink-0 flex items-center">
                <button
                    onClick={toggleTheme}
                    aria-label="Перемкнути тему"
                    className="focus:outline-none"
                >
                    {theme === 'light' ? (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-10 w-10 text-yellow-500"
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
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-10 w-10 text-gray-300"
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
            </div>
        </header>
    );
}
