import { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  WARNING_FACT_FIELDS,
  WARNING_HINTS,
  WARNING_LABELS,
  warningKinds,
  type RecordWarning,
  type WarningDiff,
  type WarningDiffRow,
  type WarningGroup,
} from '../lib/recordWarnings';

// Показ попереджень черги масового підтвердження.
//
// Позначка в рядку каже лише «тут щось не так», і щоб зрозуміти, що саме,
// доводилося відкривати справу. Тому і в рядку, і в плашці групи показуємо
// саме порівняння: шифр, населений пункт і рік цього запису поруч зі
// знайденим у реєстрі можливим дублем.

/** Рядок порівняння: підпис поля і два значення (тут / у реєстрі). */
type CompareRow = WarningDiff & { differs: boolean };

const compareRows = (self: RecordWarning['self'], group: WarningGroup): CompareRow[] => {
  const match = group.matches[0];
  if (!match) return [];

  return [
    ...WARNING_FACT_FIELDS.map(({ key, label }) => ({
      label,
      self: self[key] || '—',
      other: match.other[key] || '—',
      differs: self[key] !== match.other[key],
    })),
    // Розбіжні характеристики справи вже відібрані як такі, що не збіглися
    ...match.details.map((detail) => ({ ...detail, differs: true })),
  ];
};

const HEAD_CLASS =
  'text-gray-500 dark:text-gray-400 text-[10.5px] font-bold uppercase tracking-[0.06em]';

const GRID_CLASS =
  'grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.15fr)_minmax(0,1.15fr)] gap-x-[12px] gap-y-[3px]';

function CompareGrid({ rows }: { rows: CompareRow[] }) {
  return (
    <div className={GRID_CLASS}>
      <span className={HEAD_CLASS}>Поле</span>
      <span className={HEAD_CLASS}>Цей запис</span>
      <span className={HEAD_CLASS}>У реєстрі</span>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <span className="text-gray-500 dark:text-gray-400 text-[12px] break-words">{row.label}</span>
          <span
            className={`text-[12.5px] break-words ${
              row.differs
                ? 'text-[#92400E] dark:text-[#FDE68A] font-semibold'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {row.self}
          </span>
          <span
            className={`text-[12.5px] break-words ${
              row.differs
                ? 'text-[#92400E] dark:text-[#FDE68A] font-semibold'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {row.other}
          </span>
        </div>
      ))}
    </div>
  );
}

const CARD_WIDTH = 520;

/**
 * Знак оклику з підказкою-порівнянням.
 *
 * Панель позиціюється fixed і затискається в межах екрана (як HelpTooltip):
 * позначка стоїть у таблиці з горизонтальним прокручуванням, тож вкладена
 * панель просто обрізалася б. Відкривається наведенням і фокусом, а кліком —
 * для тачскрінів, де hover немає.
 */
export function WarningMarker({ warning }: { warning: RecordWarning }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };

  // Затримка дає перевести курсор із позначки на саму панель, не згорнувши її
  const hide = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(CARD_WIDTH, vw - margin * 2);

      let left = r.left;
      if (left + w > vw - margin) left = vw - margin - w;
      if (left < margin) left = margin;

      // Знизу місця може не бути (позначка в кінці довгої таблиці) — тоді вгору
      const h = panelRef.current?.getBoundingClientRect().height ?? 0;
      let top = r.bottom + gap;
      if (h > 0 && top + h > vh - margin) {
        top = r.top - gap - h >= margin ? r.top - gap - h : Math.max(margin, vh - margin - h);
      }

      setPos({ top, left, width: w });
    };

    place();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const kinds = warningKinds(warning);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((v) => !v);
          setOpen(true);
        }}
        aria-label={`Попередження: ${kinds.map((kind) => WARNING_LABELS[kind]).join(', ')}`}
        aria-expanded={open}
        className="inline-flex align-top mt-[2px] cursor-help"
      >
        <TriangleAlert
          className="w-[15px] h-[15px] text-[#D97706] dark:text-[#FBBF24]"
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            position: 'fixed',
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: pos?.width ?? CARD_WIDTH,
            maxHeight: '70vh',
            overflowY: 'auto',
            visibility: pos ? 'visible' : 'hidden',
            zIndex: 60,
          }}
          className="p-[12px] rounded-lg border border-[#FCD34D] dark:border-[#78350F] bg-white dark:bg-[#111827] shadow-lg text-left font-normal"
        >
          <div className="flex flex-col gap-[12px]">
            {warning.groups.map((group) => (
              <section key={group.kind}>
                <p className="flex items-center gap-[6px] text-[#92400E] dark:text-[#FDE68A] text-[12.5px] font-semibold">
                  <TriangleAlert className="w-[13px] h-[13px] flex-shrink-0" strokeWidth={2} />
                  {WARNING_LABELS[group.kind]}
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-[11.5px] leading-[1.45] mt-[3px]">
                  {WARNING_HINTS[group.kind]}
                </p>
                {group.matches.length > 0 && (
                  <div className="mt-[8px]">
                    <CompareGrid rows={compareRows(warning.self, group)} />
                    {group.total > 1 && (
                      <p className="text-gray-500 dark:text-gray-400 text-[11.5px] mt-[5px]">
                        Показано один із {group.total} схожих записів реєстру.
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const PLACES_SHOWN = 6;

const placesLine = (settlements: string[]) => {
  const sorted = [...settlements].sort((a, b) => a.localeCompare(b, 'uk'));
  const head = sorted.slice(0, PLACES_SHOWN).join(', ');
  const rest = sorted.length - PLACES_SHOWN;
  return rest > 0 ? `${head} та ще ${rest}` : head;
};

const ROWS_SHOWN = 4;

/**
 * Розбіжності цілої групи — по всіх населених пунктах, лише те, що різниться.
 *
 * Однакові розбіжності вже зведені в один рядок (collectWarningDiffs), тож
 * тут лишається показати, у яких саме селах вони трапилися.
 */
export function WarningDiffList({ rows }: { rows: WarningDiffRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const shown = expanded ? rows : rows.slice(0, ROWS_SHOWN);

  return (
    <div className="flex flex-col gap-[8px] mt-[10px]">
      {shown.map((row, index) => (
        <div
          key={`${row.kind}-${index}`}
          className="rounded border border-[#FCD34D] dark:border-[#78350F] bg-white dark:bg-[#111827] p-[10px_12px]"
        >
          <p className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] mb-[7px]">
            <span className="inline-flex items-center rounded px-[7px] py-[2px] bg-[#FDE68A] dark:bg-[#78350F] text-[#78350F] dark:text-[#FDE68A] text-[11.5px] font-semibold">
              {WARNING_LABELS[row.kind]}
            </span>
            <span className="text-gray-600 dark:text-gray-300 text-[12px]">
              {row.settlements.length} н.п.:{' '}
              <b className="font-semibold">{placesLine(row.settlements)}</b>
            </span>
            {row.identical && (
              <span className="text-[#B91C1C] dark:text-[#FCA5A5] text-[12px] font-semibold">
                збігається все — ймовірно, повний дубль
              </span>
            )}
          </p>
          <CompareGrid rows={row.diffs.map((diff) => ({ ...diff, differs: !row.identical }))} />
        </div>
      ))}

      {rows.length > ROWS_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[#92400E] dark:text-[#FDE68A] text-[12.5px] font-semibold underline underline-offset-2"
        >
          {expanded ? 'Згорнути розбіжності' : `Показати всі розбіжності (${rows.length})`}
        </button>
      )}
    </div>
  );
}
