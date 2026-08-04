import { AlertTriangle } from 'lucide-react';
import { hasInventoryTypeMismatch } from '../lib/inventoryType';

/**
 * Попередження про розбіжність між обраним типом документа й даними запису
 * (архів/фонд, регіон і шифр, назва справи).
 *
 * Це саме попередження: збереження воно не блокує — користувач може знати краще.
 */
export default function InventoryTypeWarning({ record }: { record: any }) {
  if (!hasInventoryTypeMismatch(record)) return null;

  return (
    <div className="flex gap-[10px] p-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308]">
      <AlertTriangle
        className="w-5 h-5 text-[#92400E] dark:text-[#451A03] flex-shrink-0 mt-[1px]"
        strokeWidth={2}
      />
      <div className="text-[#92400E] dark:text-[#451A03] text-[13px] lg:text-[14px]">
        <p>
          Вказано тип запису «{String(record.inventory_type).trim()}», проте це не відповідає
          архівним сигнатурам які ви обрали.
        </p>
        <p>Перевірте вказані архівні шифри або змініть тип.</p>
        <p className="opacity-80 mt-[6px]">
          Якщо ви впевнені у своєму виборі — просто зберігайте запис, попередження нічого не блокує.
        </p>
      </div>
    </div>
  );
}
