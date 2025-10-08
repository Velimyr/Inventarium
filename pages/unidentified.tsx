import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import { supabase } from '../lib/supabaseClient';

type RecordNotIdentify = {
    id: string;
    case_signature?: string | null;
    archive?: string | null;
    fonds?: string | null;
    series?: string | null;
    record?: string | null;
    case_date?: string | null;
    inventory_year?: number | null;
    notes?: string | null;
    case_title?: string | null;
    status?: string | null;
};

const PAGE_SIZE = 12;

export default function NotIdentifyPage() {
    const router = useRouter();
    const [items, setItems] = useState<RecordNotIdentify[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    // filters
    const [archive, setArchive] = useState('');
    const [fonds, setFonds] = useState('');
    const [series, setSeries] = useState('');
    const [record, setRecord] = useState('');
    const [query, setQuery] = useState('');

    // debounce timer
    const [debounceMs] = useState(400);

    async function fetchData(p = page) {
        setLoading(true);
        try {
            let q = supabase
                .from('records_notidentify')
                .select('*', { count: 'exact' })
                .in('status', ['new', 'review'])
                .order('created_at', { ascending: false });

            if (archive.trim()) q = q.ilike('archive', `%${archive.trim()}%`);
            if (fonds.trim()) q = q.ilike('fonds', `%${fonds.trim()}%`);
            if (series.trim()) q = q.ilike('series', `%${series.trim()}%`);
            if (record.trim()) q = q.ilike('record', `%${record.trim()}%`);

            if (query.trim()) {
                const escaped = query.trim().replace(/%/g, '');
                q = q.or(`case_signature.ilike.%${escaped}%,case_title.ilike.%${escaped}%`);
            }

            const from = (p - 1) * PAGE_SIZE;
            const to = p * PAGE_SIZE - 1;
            q = q.range(from, to);

            const { data, error, count } = await q;
            if (error) throw error;
            setItems((data || []) as RecordNotIdentify[]);
            setTotal(count ?? 0);
        } catch (err) {
            console.error('Fetch records_notidentify failed', err);
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData(page);
    }, [page]);

    useEffect(() => {
        setPage(1);
        const t = setTimeout(() => fetchData(1), debounceMs);
        return () => clearTimeout(t);
    }, [archive, fonds, series, record, query]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    function truncate(text: string | null | undefined, length = 30) {
        if (!text) return '—';
        return text.length > length ? text.slice(0, length) + '[...]' : text;
    }

    function getStatusLabel(status: string | null | undefined) {
        switch (status) {
            case 'new': return 'Новий';
            case 'review': return 'На перевірці';
            case 'approved': return 'Затверджено';
            case 'rejected': return 'Відхилено';
            default: return '—';
        }
    }

    return (
        <>
            <Header />
            <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="w-full space-y-6">
                    <div className="border border-gray-300 dark:border-gray-700 rounded p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-semibold mb-2">Неідентифіковані інвентарі</h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Тут зібрані інвентарі без точної прив'язки до населеного пункту.
                                    Фільтруйте або шукайте по сигнатурі/назві справи, щоб допомогти з ідентифікацією.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    window.location.href = '/add_unidentified';
                                }}
                                className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 self-start md:self-auto"
                            >
                                Додати неідентифікований інвентар
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="border border-gray-300 dark:border-gray-700 rounded p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                type="text"
                                placeholder="Пошук по сигнатурі або заголовку справи"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <input
                                type="text"
                                placeholder="Архів"
                                value={archive}
                                onChange={(e) => setArchive(e.target.value)}
                                className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <input
                                type="text"
                                placeholder="Фонд"
                                value={fonds}
                                onChange={(e) => setFonds(e.target.value)}
                                className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <input
                                type="text"
                                placeholder="Опис"
                                value={series}
                                onChange={(e) => setSeries(e.target.value)}
                                className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <input
                                type="text"
                                placeholder="Справa"
                                value={record}
                                onChange={(e) => setRecord(e.target.value)}
                                className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setQuery(''); setArchive(''); setFonds(''); setSeries(''); setRecord(''); }}
                                    className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-sm"
                                >
                                    Скинути
                                </button>
                                <button
                                    onClick={() => fetchData(1)}
                                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                >
                                    Знайти
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table view */}
                    <div className="overflow-x-auto w-full">
                        <table className="min-w-full w-full border-collapse border border-gray-300 dark:border-gray-600 hidden sm:table">
                            <thead>
                                <tr>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Сигнатура справи</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Назва справи</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Рік складання</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Дата справи</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Статус</th>
                                    <th className="border border-gray-300 dark:border-gray-600 p-2">Примітки</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(it => (
                                    <tr 
                                        key={it.id} 
                                        onClick={() => router.push(`/unidentified/${it.id}`)}
                                        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{it.case_signature || '—'}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{it.case_title || '—'}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{it.inventory_year || '—'}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{it.case_date || '—'}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{getStatusLabel(it.status)}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 p-2 text-xs">{truncate(it.notes) || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="block sm:hidden space-y-4">
                        {items.map(it => (
                            <div 
                                key={it.id} 
                                onClick={() => router.push(`/unidentified/${it.id}`)}
                                className="border rounded p-3 bg-white dark:bg-gray-800 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="text-xs mb-1"><strong>Сигнатура:</strong> {it.case_signature || '—'}</div>
                                <div className="text-xs mb-1"><strong>Назва справи:</strong> {it.case_title || '—'}</div>
                                <div className="text-xs mb-1"><strong>Рік:</strong> {it.inventory_year || '—'}</div>
                                <div className="text-xs mb-1"><strong>Дата:</strong> {it.case_date || '—'}</div>
                                <div className="text-xs mb-1"><strong>Статус:</strong> {getStatusLabel(it.status)}</div>
                                <div className="text-xs mb-1"><strong>Примітки:</strong> {truncate(it.notes) || '—'}</div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-between items-center mt-4 max-w-md mx-auto">
                        <button
                            className="px-4 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                        >
                            Попередня
                        </button>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            Сторінка {page} з {totalPages}
                        </span>
                        <button
                            className="px-4 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={items.length < PAGE_SIZE || loading}
                            onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                        >
                            Наступна
                        </button>
                    </div>

                </div>
            </main>
        </>
    );
}