import { useState } from 'react';
import { X } from 'lucide-react';

export default function SearchBar({ onFilterChange }: { onFilterChange: (filters: any) => void }) {
  const [filters, setFilters] = useState({
    search: '',
    inventory_year_from: '',
    inventory_year_to: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updated = { ...filters, [name]: value };
    setFilters(updated);
    onFilterChange(updated);
  };

  const clearFilters = () => {
    const cleared = {
      search: '',
      inventory_year_from: '',
      inventory_year_to: '',
    };
    setFilters(cleared);
    onFilterChange(cleared);
  };

  return (
    <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-4 border-b border-gray-300">
      {/* Пошук */}
      <div className="mb-4">
        <input
          type="text"
          name="search"
          value={filters.search}
          onChange={handleChange}
          placeholder="Пошук за назвою населеного пункту або справи"
          className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Заголовок для фільтрів по роках */}
      <div className="mb-2 text-sm font-medium">Дата створення інвентаря</div>

      {/* Фільтри по роках */}
      <div className="grid grid-cols-2 gap-2 text-sm max-w-xs">
        <input
          name="inventory_year_from"
          placeholder="з..."
          value={filters.inventory_year_from}
          onChange={handleChange}
          className="p-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm"
          style={{ maxWidth: '100%' }}
        />
        <input
          name="inventory_year_to"
          placeholder="по..."
          value={filters.inventory_year_to}
          onChange={handleChange}
          className="p-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm"
          style={{ maxWidth: '100%' }}
        />
      </div>

      {/* Кнопка скидання */}
      <div className="mt-4 text-right">
        <button
          onClick={clearFilters}
          className="inline-flex items-center px-3 py-1 text-sm border border-gray-400 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4 mr-1" />
          Скинути фільтри
        </button>
      </div>
    </div>
  );
}
