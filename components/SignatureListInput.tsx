import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toSignatureList } from '../lib/caseSignature';

interface SignatureListInputProps {
  /** Значення з форми: масив, або рядок для записів, доданих до міграції. */
  value: any;
  /** Отримує вже очищений список — без порожніх рядків і зайвих пробілів. */
  onChange: (list: string[]) => void;
  placeholder: string;
  addLabel?: string;
}

/**
 * Поле для кількох сигнатур додаткових справ.
 *
 * Назовні віддає чистий список, а порожні рядки тримає у власному стані:
 * інакше щойно очищений рядок зникав би прямо під час набору.
 */
export default function SignatureListInput({
  value,
  onChange,
  placeholder,
  addLabel = 'Додати ще одну сигнатуру',
}: SignatureListInputProps) {
  const list = toSignatureList(value);
  const [rows, setRows] = useState<string[]>(() => (list.length > 0 ? list : ['']));

  // Значення підмінили ззовні (інший запис у формі) — перечитуємо його.
  // Поки очищені рядки збігаються зі списком, це та сама правка, і чіпати
  // локальний стан не можна.
  useEffect(() => {
    const cleaned = rows.map((row) => row.trim()).filter((row) => row !== '');
    const same = cleaned.length === list.length && cleaned.every((item, i) => item === list[i]);
    if (!same) setRows(list.length > 0 ? list : ['']);
  }, [value]);

  const emit = (next: string[]) => {
    setRows(next);
    onChange(next.map((row) => row.trim()).filter((row) => row !== ''));
  };

  const setRow = (index: number, next: string) =>
    emit(rows.map((row, i) => (i === index ? next : row)));

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    emit(next.length > 0 ? next : ['']);
  };

  return (
    <div className="flex flex-col gap-[10px]">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-[10px]">
          <input
            type="text"
            value={row}
            onChange={(e) => setRow(index, e.target.value)}
            placeholder={placeholder}
            className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={rows.length === 1 && row.trim() === ''}
            aria-label="Видалити сигнатуру"
            title="Видалити сигнатуру"
            className="flex items-center justify-center w-[40px] h-[40px] flex-shrink-0 rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4 text-gray-700 dark:text-[#F3F4F6]" strokeWidth={1.6} />
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={() => emit([...rows, ''])}
          className="inline-flex items-center gap-[8px] px-[12px] h-[36px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
        >
          <Plus className="w-4 h-4 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={1.6} />
          <span className="text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] font-medium">
            {addLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
