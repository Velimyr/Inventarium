import Link from 'next/link';
import Header from '../components/header';
import { HelpCircle } from 'lucide-react';

export default function help() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
            Часті питання (FAQ)
          </h1>

          {/* FAQ Sections */}
          <div className="space-y-[20px]">
            {/* Question 1 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  1. Що таке "Інвентаріум"?
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                "Інвентаріум" — волонтерська ініціатива, спрямована на створення публічного реєстру інвентарних описів маєтків, що стосуються українських земель. Оскільки інвентарні описи розкидані по різних фондах українських та іноземних архівів і бібліотек з ними важко працювати, багато дослідників просто не знають про це цінне генеалогічне та краєзнавче джерело. Наша мета - зібрати і систематизувати відомості про інвентарі, що стосуються усіх українських етнічних земель.
              </p>
            </section>

            {/* Question 2 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  2. Навіщо мені як досліднику вивчати інвентарні описи?
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                Інвентарні описи (інвентарі) — це документи, які фіксували склад і стан маєтків, землю, будівлі, інвентар, населення, обов'язки селян та інші важливі дані. Вони є унікальним джерелом для дослідників історії, істориків локальних громад, краєзнавців та генеалогів.
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
            </section>

            {/* Question 3 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  3. Чи для усіх маєтків складалися інвентарі?
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                Ні, скоріше за все не всі маєтки мали інвентарі, оскільки для його складання потрібно було провести досить непросту роботу з обрахунку майна, а це коштувало грошей. Тому інвентар складався тільки якщо власник маєтку мав таку потребу. Зазвичай це перед продажем або заставою маєтку, або коли після смерті власника, його нащадки намагалися розділити спадщину.
              </p>
            </section>

            {/* Question 4 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  4. Чому на сайті немає реєстру усіх інвентарів?
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                Створення максимально повного реєстру інвентарів - наша мета, проте це непростий і тривалий процес, оскільки інвентарі не зібрані разом в окремих фондах, вони розкидані по сімейних фондах і колекціях магнатських родин, фондах різних судових установ. Інвентарі потрібно шукати і обліковувати. Ви можете допомогти у цій справі, долучившись до проєкту "Інвентаріум" у якості волонтера.{" "}
                <a
                  href="https://inventarium.org.ua/volunteer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                >
                  Детальніше див. тут
                </a>
              </p>
            </section>

            {/* Question 5 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  5. Як мені працювати з сайтом "Інвентаріум"?
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                Для пошуку інвентарю вам потрібно ввести сучасну назву населеного пункту в рядок пошуку. Якщо у реєстрі за цим населеним пунктом є зафіксований інвентарний опис - відповідна інформація відобразиться в таблиці. Або ви можете використати сторінку "Карта" аби подивитися по яких населеним пунктам інвентарі уже знайдені. Детальніше про роботу з сайтом див. тут.
              </p>
            </section>

            {/* Question 6 */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-start gap-[10px] mb-[15px]">
                <HelpCircle className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  6. Я знаю, що існує інвентар по певному населеному пункту, але його немає в реєстрі на сайті "Інвентаріум"
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] leading-relaxed">
                Чудово! Ви можете додати відомий вам інвентар за допомогою сторінки{" "}
                <a
                  href="https://inventarium.org.ua/add_inventory"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                >
                  Детальніше див. тут
                </a>. Наші адміністратори розглянуть цю інформацію і якщо вона підтвердиться - інвентар буде доданий до реєстру! Детальну інструкцію як додавати інвентарі див тут.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}