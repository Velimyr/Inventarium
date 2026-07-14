import { useState } from 'react';

const NEW_VALUE = '__new__';

interface ComboSelectProps {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    emptyLabel?: string;      // текст першого пункту: «— не змінювати —» або «— не вибрано —»
    disabled?: boolean;
}

// Випадаючий список із можливістю ввести значення, якого ще немає в довіднику
export default function ComboSelect({
    label,
    value,
    options,
    onChange,
    emptyLabel = '— не вибрано —',
    disabled = false,
}: ComboSelectProps) {
    const [isNew, setIsNew] = useState(false);

    // Значення, введене вручну, у списку відсутнє — тримаємо режим вводу
    const showInput = isNew || (!!value && !options.includes(value));

    return (
        <label className="flex flex-col gap-[5px]">
            <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">{label}</span>

            <select
                value={showInput ? NEW_VALUE : value}
                disabled={disabled}
                onChange={e => {
                    if (e.target.value === NEW_VALUE) {
                        setIsNew(true);
                        onChange('');
                    } else {
                        setIsNew(false);
                        onChange(e.target.value);
                    }
                }}
                className="px-[10px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px] disabled:opacity-50"
            >
                <option value="">{emptyLabel}</option>
                {options.map(option => (
                    <option key={option} value={option}>{option}</option>
                ))}
                <option value={NEW_VALUE}>➕ Нове значення…</option>
            </select>

            {showInput && (
                <input
                    type="text"
                    value={value}
                    disabled={disabled}
                    autoFocus
                    placeholder={`Нова назва (${label.toLowerCase()})`}
                    onChange={e => onChange(e.target.value)}
                    className="px-[10px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px]"
                />
            )}
        </label>
    );
}
