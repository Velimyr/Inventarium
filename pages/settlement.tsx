import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';

export default function SettlementRecordsPage() {
  const router = useRouter();
  const {
    current_settlement_name,
    current_community,
    current_district,
    current_region,
  } = router.query;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (
      current_settlement_name &&
      current_community &&
      current_district &&
      current_region
    ) {
      fetchRecords();
    }
  }, [current_settlement_name, current_community, current_district, current_region]);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .match({
        current_settlement_name,
        current_community,
        current_district,
        current_region,
      });

    if (error) {
      console.error('Помилка:', error);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  return (
    <>
      <Header />
      <main className="p-4 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Інвентарі: {current_settlement_name}, {current_community}, {current_district}, {current_region}
        </h1>

        {loading ? (
          <p className="text-center">Завантаження...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            За вказаними параметрами записів не знайдено.
          </p>
        ) : (
          <div className="overflow-auto max-w-full">
            <table className="min-w-[1000px] border border-gray-300 table-auto mx-auto">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border p-2">Назва справи</th>
                  <th className="border p-2">Рік</th>
                  <th className="border p-2">Сигнатура</th>
                  <th className="border p-2">Дії</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="border p-2">{record.case_title}</td>
                    <td className="border p-2 text-center">{record.inventory_year}</td>
                    <td className="border p-2">{record.case_signature}</td>
                    <td className="border p-2 text-center">
                      <a
                        href={`/record/${record.id}`}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Переглянути
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
