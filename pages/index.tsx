import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';


const PAGE_SIZE = 20;

export default function Home() {
  const [records, setRecords] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  //console.log('Завантаження почалося');

  useEffect(() => {
    loadRecords();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const loadRecords = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Забираємо записи з фільтром approved=true
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Помилка при завантаженні:', error);
      setRecords([]);
    } else {
      setRecords(data || []);
      console.log('Завантажені записи:', data);
    }
    setLoading(false);
  };

  return (
    <>
      <Header />
      <main className="p-4 max-w-full mx-auto overflow-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        <h1 className="text-2xl font-bold mb-6">Підтверджені записи (сторінка {page + 1})</h1>

        {loading && <p>Завантаження...</p>}

        <table className="min-w-full border border-gray-300 table-auto">
          <thead>
            <tr>
              <th className="border border-gray-300 p-2">Адміністративний поділ (на час складання)</th>
              <th className="border border-gray-300 p-2">Адміністративний поділ (сучасний)</th>
              <th className="border border-gray-300 p-2">Див. на карті</th>
              <th className="border border-gray-300 p-2">Тип позначки</th>
              <th className="border border-gray-300 p-2">Сигнатура справи</th>
              <th className="border border-gray-300 p-2">Сигнатура додаткової справи</th>
              <th className="border border-gray-300 p-2">Назва справи</th>
              <th className="border border-gray-300 p-2">Дата справи</th>
              <th className="border border-gray-300 p-2">Кількість сторінок</th>
              <th className="border border-gray-300 p-2">Сторінка поч. інвентаря</th>
              <th className="border border-gray-300 p-2">Рік складання інвентаря</th>
              <th className="border border-gray-300 p-2">Посилання на скани</th>
              <th className="border border-gray-300 p-2">Примітки</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading && (
              <tr>
                <td colSpan={27} className="text-center p-4">Немає записів</td>
              </tr>
            )}
            {records.map(record => (
              <tr key={record.id} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => window.location.href = `/record/${record.id}`}>
                <td className="border border-gray-300 p-1 text-xs">
                  {[record.old_province, record.old_district, record.old_community]
                    .filter(Boolean)
                    .join(', ')}{record.old_settlement_type || record.old_settlement_name ? ' ' : ''}
                  {[record.old_settlement_type, record.old_settlement_name]
                    .filter(Boolean)
                    .join(' ')}
                </td>
                <td className="border border-gray-300 p-1 text-xs">
                  {[record.current_region, record.current_district, record.current_community]
                    .filter(Boolean)
                    .join(', ')}{record.current_settlement_type || record.current_settlement_name ? ' ' : ''}
                  {[record.current_settlement_type, record.current_settlement_name]
                    .filter(Boolean)
                    .join(' ')}
                </td>

                <td className="border border-gray-300 p-1 text-xs">
                  {record.latitude && record.longitude ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${record.latitude}&mlon=${record.longitude}#map=16/${record.latitude}/${record.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Відкрити
                    </a>
                  ) : (
                    '-'
                  )}
                </td>

                <td className="border border-gray-300 p-1 text-xs">{record.mark_type || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.case_signature || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.additional_case_signature || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.case_title || '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">
                  {record.case_date ? new Date(record.case_date).toLocaleDateString() : '-'}
                </td>
                <td className="border border-gray-300 p-1 text-xs">{record.pages_count ?? '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.inventory_start_page ?? '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">{record.inventory_year ?? '-'}</td>
                <td className="border border-gray-300 p-1 text-xs">
                  {record.scans_url ? (
                    <a href={record.scans_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Посилання</a>
                  ) : '-'}
                </td>
                <td className="border border-gray-300 p-1 text-xs">{record.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between mt-4">
          <button
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
            disabled={page === 0 || loading}
            onClick={() => setPage(prev => Math.max(prev - 1, 0))}
          >
            Попередня
          </button>
          <button
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
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
