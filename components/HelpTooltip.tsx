import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Іконка «?» із поясненням. Відкривається кліком/тапом (працює і на мобільному,
 * де немає hover), закривається кліком поза підказкою або Escape.
 *
 * Панель позиціюється fixed і затискається в межі екрана — тому на вузьких
 * екранах не вилазить за правий/лівий край і не обрізається.
 */
export default function HelpTooltip({
  label,
  children,
  width = 300,
}: {
  label: string;
  children: ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const margin = 12;
      const vw = window.innerWidth;
      const w = Math.min(width, vw - margin * 2);
      let left = r.left;
      if (left + w > vw - margin) left = vw - margin - w; // не вилазити праворуч
      if (left < margin) left = margin; // і ліворуч
      setPos({ top: r.bottom + 8, left, width: w });
    };

    place();

    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReflow = () => place();

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, width]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex p-1 rounded-full hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors align-middle"
      >
        <HelpCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2} />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
          className="p-3 rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] shadow-lg text-left font-normal"
        >
          <div className="text-gray-900 dark:text-white text-[13px] leading-[1.5] space-y-[6px]">
            {children}
          </div>
        </div>
      )}
    </>
  );
}
