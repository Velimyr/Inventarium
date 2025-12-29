import Header from '../components/header';
import { Heart, CheckCircle, Users, ExternalLink } from 'lucide-react';

export default function VolunteerPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[29px]">
            Стати волонтером
          </h1>

          {/* Main Content Card */}
          <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[30px] lg:gap-[40px]">
            
            {/* Introduction */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Heart className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Приєднуйтесь до нас
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                Проєкт <strong>Інвентаріум</strong> зібрався навколо ідеї зробити важливі історичні джерела —
                інвентарні описи маєтків — доступними для всіх. Ми запрошуємо волонтерів, яким цікава історія,
                архіви, генеалогія чи локальні дослідження.
              </p>
            </div>

            {/* How You Can Help */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <CheckCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Чим ви можете допомогти:
                </h2>
              </div>
              <div className="flex flex-col gap-[15px]">
                <ul className="list-disc list-inside text-gray-900 dark:text-white text-[15px] lg:text-[16px] space-y-2 ml-[10px]">
                  <li>шукати інвентарні описи в каталогах архівів і бібліотек;</li>
                  <li>створювати короткі описи знайдених справ;</li>
                  <li>вводити дані до реєстру;</li>
                  <li>допомагати з перекладом і редагуванням;</li>
                  <li>ділитися власними знахідками та джерелами.</li>
                </ul>
                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                  Вам не обов'язково мати архівний досвід — ми допоможемо навчитися. Ви працюєте у зручному темпі,
                  з дому або в архівах, і робите свій внесок у спільну пам'ять про минуле.
                </p>
              </div>
            </div>

            {/* Current Needs */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px]">
                <Users className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Саме зараз Інвентаріум дуже потребує волонтерів з такими знаннями:
                </h2>
              </div>
              <ul className="list-disc list-inside text-gray-900 dark:text-white text-[15px] lg:text-[16px] space-y-2 ml-[10px]">
                <li>Архівознавців і генеалогів - для пошуку інвентарів і наповнення реєстру Інвентаріум</li>
                <li>Знавців польської, угорської, шведської мови - для перекладу корисних матеріалів на українську</li>
                <li>Журналістів - для того аби розказати про нас світу</li>
                <li>Редакторів і коректорів - для перевірки матеріалів і статей, які готують наші волонтери</li>
                <li>Дизайнерів - для підготовки графічних матеріалів на інвентарні теми</li>
              </ul>
            </div>

            {/* Call to Action */}
            <div className="flex flex-col gap-[15px]">
              <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                <strong>Долучайтеся</strong> — разом ми відкриємо джерела, які допомагають зрозуміти історію українських земель!
              </p>
              <div className="flex justify-center">
                <a
                  href="https://forms.gle/Xwi2upo2STVYasZ46"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-[8px] lg:gap-[10px] px-[15px] lg:px-[20px] h-[40px] lg:h-[44px] rounded bg-[#2563EB] hover:bg-[#1D4ED8]"
                >
                  <span className="text-white text-[15px] lg:text-[16px] font-semibold whitespace-nowrap">Заповнити анкету волонтера</span>
                  <ExternalLink className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                </a>
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}