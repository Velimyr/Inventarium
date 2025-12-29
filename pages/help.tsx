import Link from 'next/link';
import Header from '../components/header';
import { BookOpen, Video, Search, ExternalLink } from 'lucide-react';

export default function Help() {
  return (
    <>
      <Header />

      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
            Посібники для дослідників інвентарів
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px]">
            {/* Блок 1 – Як працювати з Inventarium */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-center gap-[10px] mb-[15px]">
                <BookOpen className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Основи роботи з Inventarium
                </h2>
              </div>
              <div className="flex flex-wrap gap-[10px]">
                <a 
                  href="https://telegra.ph/%D0%86nstrukc%D1%96ya-po-robot%D1%96-z-%D0%86nventar%D1%96um-06-29"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Як шукати інвентарі в реєстрі Inventarium
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://telegra.ph/YAk-dodavati-%D1%96nventar-v-reyestr-06-29"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Як додати новий інвентар до реєстру
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://telegra.ph/YAk%D1%96-tipi-dokument%D1%96v-predstavlen%D1%96-v-reyestr%D1%96-%D0%86nventar%D1%96um-09-22"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Які типи документів представлені в реєстрі Інвентаріум
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <Link href="/FAQ">
                  <a className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white">
                    Відповіді на часті запитання
                  </a>
                </Link>
              </div>
            </section>

            {/* Блок 2 – Навчальний курс */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-center gap-[10px] mb-[15px]">
                <Video className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Навчальні курси і відеолекції
                </h2>
              </div>
              <div className="flex flex-wrap gap-[10px]">
                <a 
                  href="https://youtu.be/gW30DA3QrBc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Навчальний курс "Інвентарний детектив XVIII ст." Лекція 1
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://youtu.be/bZUNAxE3Ztg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Навчальний курс "Інвентарний детектив XVIII ст." Лекція 2
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
              </div>
            </section>

            {/* Блок 3 – Про пошук інвентарів в архівах */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-center gap-[10px] mb-[15px]">
                <Search className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Методика пошуку інвентарів в архівах
                </h2>
              </div>
              <div className="flex flex-wrap gap-[10px]">
                <a 
                  href="https://telegra.ph/%D0%86nvertarn%D1%96-opisi-mayetk%D1%96v-yak-dzherelo-genealog%D1%96chnoi-%D1%96nformac%D1%96i-04-24"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Інвертарні описи маєтків, як джерело генеалогічної інформації
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-u-Lv%D1%96vsk%D1%96j-b%D1%96bl%D1%96otec%D1%96-%D1%96men%D1%96-Vasilya-Stefanika-07-06"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Пошук інвентарів у Львівській бібліотеці імені Василя Стефаника
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-v-%D0%86nstitut%D1%96-rukopisu-NBUV-07-09"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Пошук інвентарів в Інституті рукопису НБУВ
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-v-arh%D1%96vah-Ugorshchini-10-25"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Пошук інвентарів в архівах Угорщини
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
              </div>
            </section>

            {/* Блок 4 – Корисні посилання */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <div className="flex items-center gap-[10px] mb-[15px]">
                <ExternalLink className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Корисні генеалогічні та краєзнавчі ресурси
                </h2>
              </div>
              <div className="flex flex-wrap gap-[10px]">
                <a 
                  href="https://t.me/archivist_notes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Телеграм канал "Записки диванного архівіста"
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://www.facebook.com/groups/UAGenealogy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Спільнота UAGenealogy
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://t.me/fazulyanov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Телеграм канал "Генеалог Сергій Фазульянов"
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
                <a 
                  href="https://t.me/mk_genealogy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[8px] px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors text-[13px] lg:text-[14px] text-gray-900 dark:text-white"
                >
                  Телеграм канал "Моє коріння: генеалогія"
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}