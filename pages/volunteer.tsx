import Header from '../components/header';

export default function VolunteerPage() {
  return (
    <>
      <Header />
      <main className="p-6 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold mb-6 text-center">Стати волонтером</h1>

          <p className="mb-4 text-lg">
            Проєкт <strong>Інвентаріум</strong> зібрався навколо ідеї зробити важливі історичні джерела —
            інвентарні описи маєтків — доступними для всіх. Ми запрошуємо волонтерів, яким цікава історія,
            архіви, генеалогія чи локальні дослідження.
          </p>

          <h2 className="text-xl font-semibold mt-6 mb-2">Чим ви можете допомогти:</h2>
          <ul className="list-disc list-inside mb-6 space-y-1 text-lg">
            <li>шукати інвентарні описи в каталогах архівів і бібліотек;</li>
            <li>створювати короткі описи знайдених справ;</li>
            <li>вводити дані до реєстру;</li>
            <li>допомагати з перекладом і редагуванням;</li>
            <li>ділитися власними знахідками та джерелами.</li>
          </ul>

          <p className="mb-4 text-lg">
            Вам не обов’язково мати архівний досвід — ми допоможемо навчитися. Ви працюєте у зручному темпі,
            з дому або в архівах, і робите свій внесок у спільну пам’ять про минуле.
          </p>

          <p className="mb-6 text-lg">
            <strong>Долучайтеся</strong> — разом ми відкриємо джерела, які допомагають зрозуміти історію українських земель!
          </p>

          <div className="text-center">
            <a
              href="https://forms.gle/Xwi2upo2STVYasZ46"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded transition"
            >
              Заповнити анкету волонтера
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
