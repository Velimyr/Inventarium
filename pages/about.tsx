import Link from 'next/link';
import Header from '../components/header';

export default function About() {
  return (
    <>
    <Header /> 
    <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-screen-lg mx-auto">
        <h1 className="text-3xl font-bold mb-6">Про проєкт</h1>

        <p className="mb-4">
          <strong>«Інвентаріум»</strong> — це волонтерська ініціатива, спрямована на створення публічного реєстру інвентарних описів маєтків, що стосуються українських земель.
        </p>

        <p className="mb-4">
          Інвентарні описи — це документи, які фіксували склад і стан маєтків, землю, будівлі, інвентар, населення, обов’язки селян та інші важливі дані. Вони є унікальним джерелом для дослідників історії, істориків локальних громад, краєзнавців та генеалогів.
          Детальніше про значення цих джерел ви можете дізнатися зі статті:{" "}
          <a
            href="https://telegra.ph/%D0%86nvertarn%D1%96-opisi-mayetk%D1%96v-yak-dzherelo-genealog%D1%96chnoi-%D1%96nformac%D1%96i-04-24"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            «Інвентарні описи маєтків як джерело генеалогічної інформації»
          </a>.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">Мета проєкту</h2>
        <p className="mb-4">
          Ми прагнемо зібрати й систематизувати відомості про інвентарні описи, які зберігаються:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>в українських державних, регіональних і приватних архівах;</li>
          <li>в архівах, бібліотеках і музейних зібраннях Польщі, Литви, Австрії та інших країн, де ці матеріали могли опинитися внаслідок історичних подій.</li>
        </ul>
        <p className="mb-4">
          Проєкт не передбачає оцифрування самих документів (за винятком відкритих джерел), але надає дослідникам систематизовану інформацію про наявність, дату, географію, зміст і місце зберігання кожного опису.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">Як долучитися</h2>
        <p className="mb-2">Проєкт є відкритим для співпраці. Ви можете:</p>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>надіслати інформацію про знайдені інвентарі;</li>
          <li>допомогти в обробці архівних каталогів і описів;</li>
          <li>запропонувати виправлення або доповнення до вже внесених записів.</li>
        </ul>

        <p className="mb-4">
          Ми віримо, що спільними зусиллями зможемо зробити джерела з історії українських земель доступнішими для всіх.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">Контакти</h2>
        <p className="mb-1">Куратор проєкту: В’ячеслав Тимощук</p>
        <p className="mb-1">
          Telegram — <a href="https://t.me/velimyr" className="text-blue-600 dark:text-blue-400 underline">@velimyr</a>
        </p>
        <p>Email — <a href="mailto:admin@inventarium.org.ua" className="text-blue-600 dark:text-blue-400 underline">admin@inventarium.org.ua</a></p>
      </div>
    </main>
    </>
  );
}
