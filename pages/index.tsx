import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import SearchBar from '../components/SearchBar';

const PAGE_SIZE = 20;

export default function Home() {
  const [records, setRecords] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<any>({});

  useEffect(() => {
    const shouldSearch = filters.search && filters.search.trim().length >= 3;
    if (shouldSearch) {
      loadRecords();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setRecords([]);
    }
  }, [page, filters]);

  const loadRecords = async () => {
    if (!filters.search || filters.search.trim() === '') {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('records')
      .select('*')
      .eq('approved', true);

    const textFields = [
      'old_province',
      'old_district',
      'old_community',
      'current_region',
      'current_district',
      'current_community'
    ];

    textFields.forEach(field => {
      if (filters[field]) {
        query = query.ilike(field, `%${filters[field]}%`);
      }
    });

    if (filters.inventory_year_from) {
      query = query.gte('inventory_year', Number(filters.inventory_year_from));
    }
    if (filters.inventory_year_to) {
      query = query.lte('inventory_year', Number(filters.inventory_year_to));
    }

    query = query.or([
      `old_settlement_name.ilike.%${filters.search}%`,
      `current_settlement_name.ilike.%${filters.search}%`,
      `case_title.ilike.%${filters.search}%`
    ].join(','));

    query = query.order('inventory_year', { ascending: false }).range(from, to);

    const { data, error } = await query;

    if (error) {
      console.error('Помилка при завантаженні:', error);
      setRecords([]);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
    setPage(0);
  };

  return (
    <>
      <Header />
      <SearchBar onFilterChange={handleFilterChange} />
      <main className="p-4 max-w-full mx-auto overflow-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">

        {loading && <p>Завантаження...</p>}

        <table className="min-w-full border border-gray-300 table-auto">
          <thead>
            <tr>
              <th className="border border-gray-300 p-2">Адміністративний поділ (на час складання)</th>
              <th className="border border-gray-300 p-2">Адміністративний поділ (сучасний)</th>
              <th className="border border-gray-300 p-2">Рік складання інвентарю</th>
              <th className="border border-gray-300 p-2">Сигнатура справи</th>
              <th className="border border-gray-300 p-2">Назва справи</th>
              <th className="border border-gray-300 p-2">Дата справи</th>
              <th className="border border-gray-300 p-2">Примітки</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="text-center p-4 text-sm text-blue-600 dark:text-blue-400">
                  Введіть назву для пошуку потрібного вам інвентарю.
                </td>
              </tr>
            )}
            {records.map(record => (
              <tr
                key={record.id}
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => window.location.href = `/record/${record.id}`}
              >
                <td className="border border-gray-300 p-1 text-xs">
                  {[record.old_province, record.old_district, record.old_community]
                    .filter(Boolean)
                    .map((item, idx) => <div key={`old-main-${idx}`}>{item}</div>)}
                  {(record.old_settlement_type || record.old_settlement_name) && (
                    <div>
                      {[record.old_settlement_type, record.old_settlement_name]
                        .filter(Boolean)
                        .join(' ')}
                    </div>
                  )}
                </td>
                <td className="border border-gray-300 p-1 text-xs">
                  {[record.current_region + ' область', record.current_district+ ' район', record.current_community+ ' громада']
                    .filter(Boolean)
                    .map((item, idx) => <div key={`current-main-${idx}`}>{item}</div>)}
                  {(record.current_settlement_type || record.current_settlement_name) && (
                    <div>
                      {[record.current_settlement_type, record.current_settlement_name]
                        .filter(Boolean)
                        .join(' ')}
                    </div>
                  )}
                </td> 

                {/* <td className="border border-gray-300 p-1 text-xs">
                  {[
                    record.current_region && !record.current_region.includes('область')
                      ? `${record.current_region} область`
                      : record.current_region,
                    record.current_district && !record.current_district.includes('район')
                      ? `${record.current_district} район`
                      : record.current_district,
                    record.current_community && !record.current_community.includes('громада')
                      ? `${record.current_community} громада`
                      : record.current_community,
                  ]
                  .filter(Boolean)
                    .map((item, idx) => (
                  <div key={`current-main-${idx}`}>{item}</div>
                    ))}

                  {(record.current_settlement_type || record.current_settlement_name) && (
                    <div>
                      {[record.current_settlement_type, record.current_settlement_name]
                        .filter(Boolean)
                        .join(' ')}
                    </div>
                  )}
                </td> */}

                <td className="border border-gray-300 p-1 text-xs">{record.inventory_year ?? '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.case_signature || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.case_title || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.case_date || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center mt-4 max-w-md mx-auto">
          <button
            className="px-4 py-2 rounded
              bg-gray-700 text-gray-100
              hover:bg-gray-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
            disabled={page === 0 || loading}
            onClick={() => setPage(prev => Math.max(prev - 1, 0))}
          >
            Попередня
          </button>

          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Сторінка {page + 1}
          </span>

          <button
            className="px-4 py-2 rounded
              bg-gray-700 text-gray-100
              hover:bg-gray-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
            disabled={records.length < PAGE_SIZE || loading}
            onClick={() => setPage(prev => prev + 1)}
          >
            Наступна
          </button>
        </div>
      </main>
    </>
  );
}
