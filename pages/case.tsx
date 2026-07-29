// pages/case.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import ClientOnly from '../components/clientonly';
import { ChevronDown } from 'lucide-react';

const CaseMapComponent = dynamic(() => import('../components/CaseMapComponent'), { ssr: false });

interface Record {
    id: string;
    latitude: number | null;
    longitude: number | null;
    mark_type: number | null;
    current_settlement_name: string | null;
    current_settlement_type: string | null;
    current_region: string | null;
    current_district: string | null;
    current_community: string | null;
    old_settlement_name: string | null;
    old_settlement_type: string | null;
    old_province: string | null;
    old_district: string | null;
    old_community: string | null;
    inventory_start_page: string | null;
    case_signature: string | null;
    case_title: string | null;
    inventory_year: string | null;
    archive: string | null;
    fonds: string | null;
    series: string | null;
    record: string | null;
}

export default function CasePage() {
    const router = useRouter();
    const { case_signature } = router.query;
    const [records, setRecords] = useState<Record[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [caseInfo, setCaseInfo] = useState<any>(null);

    useEffect(() => {
        if (!case_signature) return;

        const fetchRecords = async () => {
            setIsLoading(true);

            const { data, error } = await supabase
                .from('records')
                .select('*')
                .eq('approved', true)
                .eq('case_signature', case_signature)
                // одна справа може містити кілька інвентарів того самого НП за різні
                // роки — групуємо їх поруч і показуємо в хронологічному порядку
                .order('current_settlement_name', { ascending: true })
                .order('inventory_year', { ascending: true });

            if (error) {
                console.error('Помилка завантаження:', error);
            } else {
                setRecords(data || []);
                
                if (data && data.length > 0) {
                    setCaseInfo(data[0]);
                }
            }

            setIsLoading(false);
        };

        fetchRecords();
    }, [case_signature]);

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    {caseInfo && (
                        <div className="mb-[20px] lg:mb-[30px]">
                            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                                Справа: {case_signature}
                            </h1>
                            {caseInfo.case_title && (
                                <p className="text-gray-700 dark:text-gray-300 text-[16px] lg:text-[18px] mt-[8px]">
                                    {caseInfo.case_title}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Map Section */}
                    <div className="rounded-lg border border-gray-300 dark:border-[#374151] overflow-hidden mb-[20px]" style={{ height: '500px' }}>
                        {isLoading ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-[#1F2937]">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[16px] font-medium text-gray-900 dark:text-white">Завантаження даних...</span>
                                </div>
                            </div>
                        ) : records.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-[#1F2937]">
                                <span className="text-[16px] font-medium text-gray-900 dark:text-white">
                                    Записів не знайдено
                                </span>
                            </div>
                        ) : (
                            <ClientOnly>
                                <CaseMapComponent records={records} />
                            </ClientOnly>
                        )}
                    </div>

                    {/* Records Count and Title */}
                    {!isLoading && records.length > 0 && (
                        <>
                            <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] mb-[15px]">
                                Знайдено {records.length} {records.length === 1 ? 'запис' : records.length < 5 ? 'записи' : 'записів'}
                            </p>

                            {/* Desktop Table */}
                            <div className="hidden lg:block overflow-x-auto mb-[15px]">
                                <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-[2fr_2fr_3fr_1fr] border-b border-gray-300 dark:border-[#374151]">
                                        <TableHeader label="Сучасна назва" />
                                        <TableHeader label="Історична назва" />
                                        <TableHeader label="Адміністративний поділ" />
                                        <TableHeader label="Рік інвентаря" isLast />
                                    </div>

                                    {/* Table Body */}
                                    <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                        {records.map((record, index) => (
                                            <div
                                                key={record.id}
                                                className={`grid grid-cols-[2fr_2fr_3fr_1fr] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors ${
                                                    index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                                                }`}
                                                onClick={() => router.push(`/record/${record.id}`)}
                                            >
                                                <TableCell>
                                                    {record.current_settlement_type} {record.current_settlement_name || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {record.old_settlement_type && record.old_settlement_name
                                                        ? `${record.old_settlement_type} ${record.old_settlement_name}`
                                                        : '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="text-[13px] lg:text-[14px] font-bold">
                                                            {[
                                                                record.current_region ? `${record.current_region} область` : null,
                                                                record.current_district ? `${record.current_district} район` : null,
                                                                record.current_community ? `${record.current_community} громада` : null,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(', ') || '—'}
                                                        </div>
                                                        {(record.old_province || record.old_district || record.old_community) && (
                                                            <div className="text-[12px] text-gray-600 dark:text-gray-400">
                                                                {[record.old_province, record.old_district, record.old_community]
                                                                    .filter(Boolean)
                                                                    .join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{record.inventory_year || '—'}</TableCell>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Cards */}
                            <div className="block lg:hidden space-y-4">
                                {records.map((record) => (
                                    <div
                                        key={record.id}
                                        className="p-4 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                                        onClick={() => router.push(`/record/${record.id}`)}
                                    >
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                    Сучасна назва
                                                </div>
                                                <div className="text-[15px] text-gray-900 dark:text-white font-semibold">
                                                    {record.current_settlement_type} {record.current_settlement_name || '—'}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                    Рік інвентаря
                                                </div>
                                                <div className="text-[13px] text-gray-900 dark:text-white">
                                                    {record.inventory_year || '—'}
                                                </div>
                                            </div>

                                            {(record.old_settlement_type || record.old_settlement_name) && (
                                                <div>
                                                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                        Історична назва
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {record.old_settlement_type} {record.old_settlement_name}
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                    Адміністративний поділ
                                                </div>
                                                <div className="text-[13px] text-gray-900 dark:text-white">
                                                    {[record.current_region, record.current_district, record.current_community]
                                                        .filter(Boolean)
                                                        .join(', ') || '—'}
                                                </div>
                                            </div>

                                            {(record.old_province || record.old_district || record.old_community) && (
                                                <div>
                                                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                        Історичний поділ
                                                    </div>
                                                    <div className="text-[13px] text-gray-600 dark:text-gray-400">
                                                        {[record.old_province, record.old_district, record.old_community]
                                                            .filter(Boolean)
                                                            .join(', ')}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
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