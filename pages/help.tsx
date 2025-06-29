import Link from 'next/link';
import Header from '../components/header';

export default function Help() {
  return (
    <>
      <Header />

      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-md mx-auto space-y-8">

          {/* Блок 1 */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Основи роботи з Inventarium</h2>
            <Link href="#">
              <a className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                Дивитися
              </a>
            </Link>
          </div>

          {/* Блок 2 */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Як додавати новий інвентар</h2>
            <Link href="#">
              <a className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                Дивитися
              </a>
            </Link>
          </div>

          {/* Блок 3 */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Відповіді на часті запитанян</h2>
            <Link href="/FAQ">
              <a className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                Дивитися
              </a>
            </Link>
          </div>

        </div>
      </main>
    </>
  );
}