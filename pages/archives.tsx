import { useEffect, useState } from 'react';
import Header from '../components/header';
import Link from 'next/link';

interface Archive {
  id: string;
  "Скорочення": string;
  "Країна": string;
  "Повна назва українською": string;
  "Повна назва мовою країни архіву": string;
  site: string;
}

export default function Archives() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/data/archives.json')
      .then(res => res.json())
      .then(setArchives);
  }, []);

  const filteredArchives = archives.filter(archive => {
    const term = searchTerm.toLowerCase();
    return (
      archive["Скорочення"].toLowerCase().includes(term) ||
      archive["Країна"].toLowerCase().includes(term) ||
      archive["Повна назва українською"].toLowerCase().includes(term) ||
      archive["Повна назва мовою країни архіву"].toLowerCase().includes(term)
    );
  });

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-6">Архівні і бібліотечні установи</h1>

          <input
            type="text"
            placeholder="Пошук архіву..."
            className="w-full p-2 mb-6 border rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />

          <ul className="space-y-4">
            {filteredArchives.map(archive => (
              <li key={archive.id} className="p-4 border rounded shadow bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold">
                  {archive["Скорочення"]} — {archive["Повна назва українською"]}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">Країна: {archive["Країна"]}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Мова оригіналу: {archive["Повна назва мовою країни архіву"]}</p>
                {archive.site && (
                  <p className="mt-2">
                    <a
                      href={archive.site}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      Перейти на сайт
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}