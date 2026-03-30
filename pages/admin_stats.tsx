import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { isAdminUser } from '../lib/adminUsers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function StatsPage() {
  const { user, loading: userLoading } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const thisYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${thisYear}-01-01`);
  const [dateTo, setDateTo] = useState(`${thisYear}-12-31`);

  const [byDay, setByDay] = useState<any[]>([]);
  const [byRegion, setByRegion] = useState<any[]>([]);
  const [byEmail, setByEmail] = useState<any[]>([]);
  const [byArchive, setByArchive] = useState<any[]>([]);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const load = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      // Завантаження всіх записів з пагінацією
      let allRecords: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('records')
          .select('created_at, current_region, email, archive, case_signature')
          .range(from, from + pageSize - 1);
        
        if (error) {
          console.error('Помилка завантаження записів:', error);
          break;
        }
        
        if (!data || data.length === 0) break;
        
        allRecords = [...allRecords, ...data];
        
        if (data.length < pageSize) break;
        from += pageSize;
      }

      console.log('📊 Всього записів завантажено:', allRecords.length);

      const filteredRecords = allRecords.filter((r) => {
        const created = r.created_at?.slice(0, 10);
        return created && created >= dateFrom && created <= dateTo;
      });

      console.log('📊 Після фільтрації filteredRecords:', filteredRecords.length);

      const groupedByDay = filteredRecords.reduce((acc: any, r) => {
        const day = r.created_at?.slice(0, 10);
        if (!day) return acc;
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {});

      setByDay(
        Object.entries(groupedByDay || {})
          .map(([day, count]) => ({ day, records_count: count }))
          .sort((a, b) => a.day.localeCompare(b.day))
      );

      // Запит 2: по регіонах
      const groupedByRegion = filteredRecords.reduce((acc: any, r) => {
        const region = (r.current_region || '').trim().toLowerCase() || 'невизначено';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
      }, {});

      // Зберігаємо оригінальні назви регіонів
      const regionDisplayNames: Record<string, string> = {};
      filteredRecords.forEach(r => {
        const key = (r.current_region || '').trim().toLowerCase();
        if (key && !regionDisplayNames[key]) {
          regionDisplayNames[key] = (r.current_region || '').trim();
        }
      });

      setByRegion(
        Object.entries(groupedByRegion || {}).map(([regionKey, count]) => ({
          region: regionDisplayNames[regionKey] || regionKey,
          records_count: count
        }))
      );

      // Запит 3: по email
      const groupedByEmail = filteredRecords.reduce((acc: any, r) => {
        const email = r.email?.trim() || 'Без email';
        acc[email] = (acc[email] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 Групування по email:', groupedByEmail);
      console.log('📊 Запис для romankozak97.ua@gmail.com:',
        groupedByEmail['romankozak97.ua@gmail.com']);

      setByEmail(Object.entries(groupedByEmail || {}).map(([author_email, count]) => ({ author_email, records_count: count })));

      const groupedByArchive = filteredRecords.reduce((acc: any, r) => {
        let key = (r.archive || '').trim();
        if (!key && r.case_signature) {
          const match = r.case_signature.trim().match(/^[^,\s-]+/);
          if (match) key = match[0];
        }
        key = key || 'Невідомо';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      setByArchive(Object.entries(groupedByArchive).map(([archive, records_count]) => ({ archive, records_count })));

      setLoading(false);
    };

    load();
  }, [user, userLoading, dateFrom, dateTo]);

  if (userLoading || loading) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 flex items-center justify-center">
          <p>{error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-8">Статистика інвентарів</h1>

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <label className="flex flex-col">
              <span className="mb-1">Дата від:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="p-2 rounded border dark:bg-gray-800 dark:border-gray-600"
              />
            </label>
            <label className="flex flex-col">
              <span className="mb-1">Дата до:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="p-2 rounded border dark:bg-gray-800 dark:border-gray-600"
              />
            </label>
          </div>

          <div className="space-y-12">

            <section>
              <h2 className="text-xl font-semibold mb-2">Динаміка записів по днях</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={byDay}
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <XAxis dataKey="day" angle={-45} textAnchor="end" interval={0} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    itemStyle={{ color: '#f9fafb' }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <CartesianGrid stroke="#ccc" />
                  <Line type="monotone" dataKey="records_count" stroke="#8884d8" label />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Записи по областях</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={byRegion.sort((a, b) => b.records_count - a.records_count).slice(0, 40)}
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <XAxis dataKey="region" angle={-45} textAnchor="end" interval={0} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    itemStyle={{ color: '#f9fafb' }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Bar dataKey="records_count" fill="#82ca9d" label />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Розподіл по архівах</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={byArchive.sort((a, b) => b.records_count - a.records_count)}
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <XAxis dataKey="archive" angle={-45} textAnchor="end" interval={0} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    itemStyle={{ color: '#f9fafb' }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Bar dataKey="records_count" fill="#8884d8" label />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Активність авторів (топ 10)</h2>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={byEmail.sort((a, b) => b.records_count - a.records_count).slice(0, 10)}
                    dataKey="records_count"
                    nameKey="author_email"
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    label={({ payload }) =>
                      `${payload.author_email}: ${payload.records_count}`
                    }
                  >
                    {byEmail.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF", "#FF5C8D", "#FF7F50", "#9ACD32", "#40E0D0", "#D2691E"][index % 10]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    itemStyle={{ color: '#f9fafb' }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>

          </div>
        </div>
      </main>
    </>
  );
}
