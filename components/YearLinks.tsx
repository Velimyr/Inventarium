import Link from 'next/link';

// Роки зведеного рядка. Кожен рік лишається окремим посиланням на свій запис:
// зведення рядків не повинно відбирати доступ до інвентарів, які в них злилися.

type YearItem = {
  id: string;
  inventory_year?: string | number | null;
};

const label = (item: YearItem) => {
  const year = item.inventory_year;
  return year === null || year === undefined || String(year).trim() === '' ? '—' : String(year).trim();
};

const yearNumber = (item: YearItem) => {
  const parsed = parseInt(String(item.inventory_year ?? ''), 10);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

export default function YearLinks({ items, className = '' }: { items: YearItem[]; className?: string }) {
  // Один запис — рядок клікабельний цілком, тож рік лишається звичайним текстом
  if (items.length <= 1) return <>{items[0] ? label(items[0]) : '—'}</>;

  // Перелік років читається як хронологія справи, тож упорядковуємо за
  // зростанням незалежно від того, як відсортована сама таблиця. Записи без
  // року йдуть у кінець.
  const sorted = [...items].sort((a, b) => yearNumber(a) - yearNumber(b));

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-[5px] gap-y-[2px] ${className}`}>
      {sorted.map((item, index) => (
        <Link
          key={item.id}
          href={`/record/${item.id}`}
          onClick={(event) => event.stopPropagation()}
          className="text-[#2563EB] dark:text-[#60A5FA] hover:underline"
        >
          {label(item)}
          {index < sorted.length - 1 ? ',' : ''}
        </Link>
      ))}
    </span>
  );
}
