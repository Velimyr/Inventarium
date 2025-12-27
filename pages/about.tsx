import Link from 'next/link';
import Header from '../components/header';
import { Info, Target, Users, Mail, Send } from 'lucide-react';

export default function About() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[29px]">
            Про проєкт
          </h1>

          {/* Main Content Card */}
          <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[30px] lg:gap-[40px]">
            
            {/* Introduction */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Info className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Про Інвентаріум
                </h2>
              </div>
              <div className="flex flex-col gap-[15px]">
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  <strong>«Інвентаріум»</strong> — це волонтерська ініціатива, спрямована на створення публічного реєстру інвентарних описів маєтків, що стосуються українських земель
                </p>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Інвентарні описи — це документи, які фіксували склад і стан маєтків, землю, будівлі, інвентар, населення, обов'язки селян та інші важливі дані. Вони є унікальним джерелом для дослідників історії, істориків локальних громад, краєзнавців та генеалогів.
                  Детальніше про значення цих джерел ви можете дізнатися зі статті:{" "}
                  <a
                    href="https://telegra.ph/%D0%86nvertarn%D1%96-opisi-mayetk%D1%96v-yak-dzherelo-genealog%D1%96chnoi-%D1%96nformac%D1%96i-04-24"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                  >
                    «Інвентарні описи маєтків як джерело генеалогічної інформації»
                  </a>.
                </p>
              </div>
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Target className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Мета проєкту
                </h2>
              </div>
              <div className="flex flex-col gap-[15px]">
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Ми прагнемо зібрати й систематизувати відомості про інвентарні описи, які зберігаються:
                </p>
                <ul className="list-disc list-inside text-gray-900 dark:text-white text-[15px] lg:text-[16px] space-y-2 ml-[10px]">
                  <li>в українських державних, регіональних і приватних архівах;</li>
                  <li>в архівах, бібліотеках і музейних зібраннях Польщі, Литви, Австрії та інших країн, де ці матеріали могли опинитися внаслідок історичних подій.</li>
                </ul>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Проєкт не передбачає оцифрування самих документів (за винятком відкритих джерел), але надає дослідникам систематизовану інформацію про наявність, дату, географію, зміст і місце зберігання кожного опису.
                </p>
                <a
                  href="/feedback"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] hover:text-[#1D4ED8] text-[15px] lg:text-[16px] underline inline-block"
                >
                  Залишити пропозиції щодо покращення Інвентаріума
                </a>
              </div>
            </div>

            {/* How to Join */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Users className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Як долучитися
                </h2>
              </div>
              <div className="flex flex-col gap-[15px]">
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Проєкт є відкритим для співпраці. Ви можете:
                </p>
                <ul className="list-disc list-inside text-gray-900 dark:text-white text-[15px] lg:text-[16px] space-y-2 ml-[10px]">
                  <li>надіслати інформацію про знайдені інвентарі;</li>
                  <li>допомогти в обробці архівних каталогів і описів;</li>
                  <li>запропонувати виправлення або доповнення до вже внесених записів.</li>
                </ul>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Ми віримо, що спільними зусиллями зможемо зробити джерела з історії українських земель доступнішими для всіх.
                </p>
                <button
                  onClick={() => {
                    window.location.href = '/volunteer';
                  }}
                  className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] self-start"
                  type="button"
                >
                  <Send className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                  <span className="text-white text-[14px] lg:text-[16px] font-medium whitespace-nowrap">Долучитися до проєкту</span>
                </button>
              </div>
            </div>

            {/* Contacts */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Mail className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Контакти
                </h2>
              </div>
              <div className="flex flex-col gap-[10px]">
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Куратор проєкту: В'ячеслав Тимощук
                </p>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Telegram — <a href="https://t.me/velimyr" className="text-[#2563EB] hover:text-[#1D4ED8] underline">@velimyr</a>
                </p>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Email — <a href="mailto:admin@inventarium.org.ua" className="text-[#2563EB] hover:text-[#1D4ED8] underline">admin@inventarium.org.ua</a>
                </p>
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}