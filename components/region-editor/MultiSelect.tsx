import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

const VISIBLE_LIMIT = 300;   // довші списки (громад ~1500) звужуються пошуком

interface MultiSelectProps {
    label: string;
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    allLabel?: string;
}

// Фільтр із множинним вибором: чекбокси у випадаючій панелі + пошук по списку
export default function MultiSelect({
    label,
    options,
    value,
    onChange,
    allLabel = '— усі —',
}: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onEscape);
        };
    }, [open]);

    const searching = query.trim().length > 0;

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matched = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
        return {
            matched,
            list: matched.slice(0, VISIBLE_LIMIT),
            hidden: Math.max(0, matched.length - VISIBLE_LIMIT),
        };
    }, [options, query]);

    // Кнопки діють на знайдене пошуком, а без пошуку — на весь список
    const selectAll = () => onChange(Array.from(new Set([...value, ...shown.matched])));
    const clearAll = () => {
        if (!searching) return onChange([]);
        const drop = new Set(shown.matched);
        onChange(value.filter(v => !drop.has(v)));
    };

    const toggle = (option: string) => {
        onChange(value.includes(option) ? value.filter(v => v !== option) : [...value, option]);
    };

    const summary = value.length === 0
        ? allLabel
        : value.length <= 2
            ? value.join(', ')
            : `${value.length} вибрано`;

    return (
        <div className="flex flex-col gap-[5px]" ref={boxRef}>
            <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">{label}</span>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-label={`${label}: ${summary}`}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-[8px] px-[10px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px] text-left"
                >
                    <span className={`truncate ${value.length === 0 ? 'opacity-60' : ''}`}>{summary}</span>
                    <span className="flex items-center gap-[4px] flex-shrink-0">
                        {value.length > 0 && (
                            <X
                                className="w-4 h-4 opacity-60 hover:opacity-100"
                                strokeWidth={1.6}
                                role="button"
                                aria-label={`Очистити «${label}»`}
                                onClick={e => { e.stopPropagation(); onChange([]); }}
                            />
                        )}
                        <ChevronDown className="w-4 h-4 opacity-60" strokeWidth={1.6} />
                    </span>
                </button>

                {open && (
                    <div className="absolute z-40 mt-[4px] w-full min-w-[220px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] shadow-lg">
                        <div className="p-[8px] border-b border-gray-200 dark:border-[#374151]">
                            <input
                                type="text"
                                value={query}
                                autoFocus
                                placeholder="Пошук…"
                                onChange={e => setQuery(e.target.value)}
                                className="w-full px-[8px] py-[6px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                            />
                            <div className="flex gap-[10px] mt-[8px]">
                                <button
                                    type="button"
                                    onClick={selectAll}
                                    className="text-blue-600 dark:text-blue-400 text-[12px]"
                                >
                                    {searching
                                        ? `Вибрати знайдені (${shown.matched.length})`
                                        : `Вибрати все (${options.length})`}
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="text-gray-600 dark:text-[#D1D5DB] text-[12px]"
                                >
                                    {searching ? 'Зняти знайдені' : 'Зняти все'}
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[260px] overflow-y-auto p-[8px]">
                            {shown.list.map(option => (
                                <label
                                    key={option}
                                    className="flex items-center gap-[8px] px-[4px] py-[5px] rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                >
                                    <input
                                        type="checkbox"
                                        checked={value.includes(option)}
                                        onChange={() => toggle(option)}
                                    />
                                    <span className="truncate">{option}</span>
                                </label>
                            ))}

                            {shown.list.length === 0 && (
                                <p className="px-[4px] py-[5px] text-gray-600 dark:text-[#9CA3AF] text-[13px]">
                                    Нічого не знайдено
                                </p>
                            )}
                            {shown.hidden > 0 && (
                                <p className="px-[4px] py-[5px] text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                                    …та ще {shown.hidden}. Звузьте пошуком.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
