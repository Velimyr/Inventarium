import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import { supabase } from '../lib/supabaseClient';
import { Search, ChevronDown, ChevronLeft, ChevronRight, Plus, AlertCircle } from 'lucide-react';

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
            case 'new': return 'Очікує ідентифікації';
            case 'review': return 'Обробляється адміністратором';
            case 'done': return 'Оброблено';            
            default: return '—';
        }
    }

    const resetFilters = () => {
        setQuery('');
        setArchive('');
        setFonds('');
        setSeries('');
        setRecord('');
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Header Section */}
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-[20px] lg:mb-[29px]">
                        <div>
                            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                                Неідентифіковані інвентарі
                            </h1>
                            <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                                Тут зібрані інвентарі без точної прив'язки до населеного пункту.
                                Фільтруйте або шукайте по сигнатурі/назві справи, щоб допомогти з ідентифікацією.
                            </p>
                        </div>

                        <button
                            onClick={() => window.location.href = '/add_unidentified'}
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] whitespace-nowrap hover:bg-[#1D4ED8] transition-colors"
                        >
                            <Plus className="w-4 h-4 text-white" strokeWidth={1.6} />
                            <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                Додати неідентифікований інвентар
                            </span>
                        </button>
                    </div>

                    {/* Filters Section */}
                    <div className="p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[15px]">
                            {/* Search Query */}
                            <div className="flex items-center gap-[10px] px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937]">
                                <Search className="w-4 h-4 text-gray-400 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                <input
                                    type="text"
                                    placeholder="Пошук по сигнатурі або заголовку"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none flex-1 min-w-0"
                                />
                            </div>

                            {/* Archive */}
                            <input
                                type="text"
                                placeholder="Архів"
                                value={archive}
                                onChange={(e) => setArchive(e.target.value)}
                                className="px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none"
                            />

                            {/* Fonds */}
                            <input
                                type="text"
                                placeholder="Фонд"
                                value={fonds}
                                onChange={(e) => setFonds(e.target.value)}
                                className="px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none"
                            />

                            {/* Series */}
                            <input
                                type="text"
                                placeholder="Опис"
                                value={series}
                                onChange={(e) => setSeries(e.target.value)}
                                className="px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none"
                            />

                            {/* Record */}
                            <input
                                type="text"
                                placeholder="Справа"
                                value={record}
                                onChange={(e) => setRecord(e.target.value)}
                                className="px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none"
                            />

                            {/* Action Buttons */}
                            <div className="flex items-center gap-[10px]">
                                <button
                                    onClick={resetFilters}
                                    className="flex-1 px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                                >
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium">Скинути</span>
                                </button>
                                <button
                                    onClick={() => fetchData(1)}
                                    className="flex-1 px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                                >
                                    <span className="text-white text-[14px] font-medium">Знайти</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results Count */}
                    {total > 0 && !loading && (
                        <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] mb-[15px]">
                            Знайдено {total} {total === 1 ? 'інвентар' : total < 5 ? 'інвентарі' : 'інвентарів'}
                        </p>
                    )}

                    {loading && (
                        <div className="text-center py-8">
                            <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                        </div>
                    )}

                    {/* Desktop Table */}
                    <div className="hidden lg:block overflow-x-auto mb-[15px]">
                        <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[2fr_2.5fr_1fr_1fr_1.5fr_2fr] border-b border-gray-300 dark:border-[#374151]">
                                <TableHeader label="Сигнатура справи" />
                                <TableHeader label="Назва справи" />
                                <TableHeader label="Рік складання" />
                                <TableHeader label="Дата справи" />
                                <TableHeader label="Статус" />
                                <TableHeader label="Примітки" isLast />
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                {items.length === 0 && !loading && (
                                    <div className="text-center py-8">
                                        <p className="text-gray-600 dark:text-gray-400 text-[14px] lg:text-[16px]">
                                            Інвентарі не знайдено
                                        </p>
                                    </div>
                                )}
                                {items.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={`grid grid-cols-[2fr_2.5fr_1fr_1fr_1.5fr_2fr] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors ${
                                            index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                                        }`}
                                        onClick={() => router.push(`/unidentified/${item.id}`)}
                                    >
                                        <TableCell>{item.case_signature || '—'}</TableCell>
                                        <TableCell>{item.case_title || '—'}</TableCell>
                                        <TableCell>{item.inventory_year || '—'}</TableCell>
                                        <TableCell>{item.case_date || '—'}</TableCell>
                                        <TableCell>{getStatusLabel(item.status)}</TableCell>
                                        <TableCell>{truncate(item.notes) || '—'}</TableCell>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="block lg:hidden space-y-4 mb-[15px]">
                        {items.length === 0 && !loading && (
                            <div className="text-center p-6 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937]">
                                <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                                    Інвентарі не знайдено
                                </p>
                            </div>
                        )}
                        {items.map(item => (
                            <div
                                key={item.id}
                                className="p-4 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                                onClick={() => router.push(`/unidentified/${item.id}`)}
                            >
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                            Сигнатура справи
                                        </div>
                                        <div className="text-[13px] text-gray-900 dark:text-white">
                                            {item.case_signature || '—'}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                            Назва справи
                                        </div>
                                        <div className="text-[13px] text-gray-900 dark:text-white">
                                            {item.case_title || '—'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Рік складання</div>
                                            <div className="text-[13px] text-gray-900 dark:text-white">{item.inventory_year || '—'}</div>
                                        </div>
                                        <div>
                                            <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Дата справи</div>
                                            <div className="text-[13px] text-gray-900 dark:text-white">{item.case_date || '—'}</div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Статус</div>
                                        <div className="text-[13px] text-gray-900 dark:text-white">{getStatusLabel(item.status)}</div>
                                    </div>

                                    <div>
                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Примітки</div>
                                        <div className="text-[13px] text-gray-900 dark:text-white">{truncate(item.notes) || '—'}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div className="flex flex-col md:flex-row items-center justify-between gap-[15px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827]">
                            <div className="flex items-center gap-[20px]">
                                <button 
                                    className="flex items-center gap-[5px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={page === 1 || loading}
                                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                                >
                                    <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Назад</span>
                                </button>

                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                                    Сторінка {page} з {totalPages}
                                </span>

                                <button 
                                    className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={items.length < PAGE_SIZE || loading}
                                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                                >
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Вперед</span>
                                    <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function TableHeader({ label, isLast = false }: { label: string; isLast?: boolean }) {
    return (
        <div className={`flex items-center justify-center gap-[5px] p-[10px] ${isLast ? '' : 'border-r border-gray-200 dark:border-[#374151]'} bg-gray-100 dark:bg-[#1F2937] min-h-[50px]`}>
            <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold text-center">{label}</span>
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
        </div>
    );
}

function TableCell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-center p-[10px] border-r border-gray-200 dark:border-[#374151] last:border-r-0 min-h-[50px]">
            <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px] text-center">{children}</span>
        </div>
    );
}