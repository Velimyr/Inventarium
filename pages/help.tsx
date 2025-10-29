import Link from 'next/link';
import Header from '../components/header';

export default function Help() {
  return (
    <>
      <Header />

      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-md mx-auto space-y-8">



          {/* Блок 1 – Як працювати з Inventarium */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6">
            <h2 className="text-xl font-semibold mb-4">Основи роботи з Inventarium</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              <Link href="https://telegra.ph/%D0%86nstrukc%D1%96ya-po-robot%D1%96-z-%D0%86nventar%D1%96um-06-29" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Як шукати інвентарі в реєстрі Inventarium
                </a>
              </Link>
              <Link href="https://telegra.ph/YAk-dodavati-%D1%96nventar-v-reyestr-06-29" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Як додати новий інвентар до реєстру
                </a>
              </Link>
              <Link href="https://telegra.ph/YAk%D1%96-tipi-dokument%D1%96v-predstavlen%D1%96-v-reyestr%D1%96-%D0%86nventar%D1%96um-09-22" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Які типи документів представлені в реєстрі Інвентаріум
                </a>
              </Link>

              <Link href="/FAQ" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Відповіді на часті запитання
                </a>
              </Link>
            </div>
          </div>

          {/* Блок 2 – Навчальний курс */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6">
            <h2 className="text-xl font-semibold mb-4">Навчальні курси і відеолекції</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              <Link href="https://youtu.be/gW30DA3QrBc" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Навчальний курс "Інвентарний детектив XVIII ст." Лекція 1
                </a>
              </Link>
              <Link href="https://youtu.be/bZUNAxE3Ztg" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Навчальний курс "Інвентарний детектив XVIII ст." Лекція 2
                </a>
              </Link>

            </div>
          </div>
          {/* Блок 3 – Про пошук інвентарів в архівах */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6">
            <h2 className="text-xl font-semibold mb-4">Методика пошуку інвентарів в архівах</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              <Link href="https://telegra.ph/%D0%86nvertarn%D1%96-opisi-mayetk%D1%96v-yak-dzherelo-genealog%D1%96chnoi-%D1%96nformac%D1%96i-04-24" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Інвертарні описи маєтків, як джерело генеалогічної інформації
                </a>
              </Link>
              <Link href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-u-Lv%D1%96vsk%D1%96j-b%D1%96bl%D1%96otec%D1%96-%D1%96men%D1%96-Vasilya-Stefanika-07-06" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Пошук інвентарів у Львівській бібліотеці імені Василя Стефаника
                </a>
              </Link>
              <Link href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-v-%D0%86nstitut%D1%96-rukopisu-NBUV-07-09" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Пошук інвентарів в Інституті рукопису НБУВ
                </a>
              </Link>
              <Link href="https://istznu.org/index.php/journal/article/view/1947" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Господарські інвентарі як джерело з історії Поділля XVII-XIX ст.
                </a>
              </Link>
               <Link href="https://telegra.ph/Poshuk-%D1%96nventar%D1%96v-v-arh%D1%96vah-Ugorshchini-10-25" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Пошук інвентарів в архівах Угорщини
                </a>
              </Link>
            </div>
          </div>

          {/* Блок 4 – Корисні посилання */}
          <div className="border border-gray-300 dark:border-gray-700 rounded p-6">
            <h2 className="text-xl font-semibold mb-4">Корисні генеалогічні та краєзнавчі ресурси</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              <Link href="https://t.me/archivist_notes" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Телеграм канал "Записки диванного архівіста"
                </a>
              </Link>
              <Link href="https://www.facebook.com/groups/UAGenealogy" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Спільнота UAGenealogy
                </a>
              </Link>
              <Link href="https://t.me/fazulyanov" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Телеграм канал "Генеалог Сергій Фазульянов"
                </a>
              </Link>
              <Link href="https://t.me/mk_genealogy" passHref>
                <a className="inline-flex w-fit px-3 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700 dark:hover:bg-blue-800 transition text-sm">
                  Телеграм канал "Моє коріння: генеалогія"
                </a>
              </Link>
            </div>
          </div>



        </div>
      </main>
    </>
  );
}