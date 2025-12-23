// pages/maintenance.tsx
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Head from 'next/head';

type Theme = 'light' | 'dark';

export default function Maintenance() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Підхоплюємо тему користувача з localStorage
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
    }
  }, []);

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <title>Inventarium - Технічні роботи</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center justify-center p-4 max-w-2xl mx-auto">
          {/* Зображення */}
          <div className="mb-8">
            <Image
              src="/images/under_reconstruction.png"
              alt="Реконструкція"
              width={800}
              height={800}
              priority
              className="w-full max-w-md h-auto"
            />
          </div>

          {/* Текст */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Інвентаріум тимчасово не працює
            </h1>
            <p className="text-xl text-gray-700 dark:text-gray-300">
              проводяться ремонтні роботи
            </p>
          </div>
        </div>
      </div>
    </>
  );
}