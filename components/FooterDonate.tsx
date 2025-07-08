// components/FooterDonate.tsx

export default function FooterDonate() {
    return (
      <footer
        className="
          fixed bottom-0 left-0 w-full
          bg-gray-50 dark:bg-gray-800
          text-gray-900 dark:text-gray-100
          border-t border-gray-300 dark:border-gray-700
          shadow-lg
          z-50
        "
        style={{ minHeight: '64px' }}
      >
        <div className="max-w-screen-lg mx-auto flex flex-col md:flex-row justify-between items-center gap-3 px-4 py-3">
          <p className="text-xs md:text-sm text-center md:text-left">
            Памʼятаймо, що ми маємо можливість займатися дослідженнями виключно завдяки стійкості і мужності Сил Оборони України, які щодня знищують ворога на нашій землі! Допоможіть військовим, зробивши пожертву.
          </p>
          <a
            href="/donate"
            className="inline-block px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
          >
            Задонатити
          </a>
        </div>
      </footer>
    );
  }