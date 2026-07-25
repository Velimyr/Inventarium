import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Іконка «?» біля заголовка розділу про архівну справу. На десктопі тултіп
 * показується при наведенні, на мобільному — по кліку. Пояснює, як має
 * виглядати шифр справи (той самий формат, що перевіряє validateCaseSignature).
 */
export default function SignatureHelp() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Як має виглядати шифр справи"
        className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
      >
        <HelpCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2} />
      </button>

      <span
        className={`${
          open ? 'block' : 'hidden'
        } group-hover:block absolute left-0 top-full mt-2 z-20 w-[300px] p-3 rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] shadow-lg text-left font-normal`}
      >
        <span className="block text-gray-900 dark:text-white text-[13px] leading-[1.5] space-y-[6px]">
          <span className="block">
            <b>Український архів:</b> шифр складається автоматично з полів Архів, Фонд, Опис,
            Справа — напр. <code className="text-[#2563EB]">ЦДІАК 1-2-3</code>.
          </span>
          <span className="block">
            <b>Іноземний архів:</b> вводиться вручну одним рядком — напр.{' '}
            <code className="text-[#2563EB]">AGAD ASK 1/7/0/9/4</code>.
          </span>
          <span className="block">
            Має містити щонайменше одну літеру й одну цифру. Без символів{' '}
            <code>\</code> та <code>?</code>, без лапок і надто довгого тексту.
          </span>
          <span className="block">
            Якщо та сама справа є ще в одному архіві — додайте її окремим рядком у полі
            «Сигнатура додаткової справи».
          </span>
        </span>
      </span>
    </span>
  );
}
