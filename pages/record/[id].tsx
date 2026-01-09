import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import { useEffect, useState, useRef } from 'react';
import { ExternalLink, MapPin, Search, Edit3, AlertTriangle, Map, FileText, Clock, Feather, HelpCircle, Image, ArrowUpRight } from "lucide-react";

export default function RecordPage() {
    const router = useRouter();
    const { id } = router.query;

    const [record, setRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
    const [isTitleMultiline, setIsTitleMultiline] = useState(false);
    const titleRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (id) fetchRecord();
    }, [id]);

    useEffect(() => {
        // Check if title is multiline
        if (titleRef.current && record) {
            const lineHeight = parseInt(window.getComputedStyle(titleRef.current).lineHeight);
            const height = titleRef.current.offsetHeight;
            setIsTitleMultiline(height > lineHeight * 1.5);
        }
    }, [record]);

    const fetchRecord = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('records').select(`
            id, case_title, case_signature, case_date, inventory_year, inventory_start_page,
            pages_count, additional_case_signature, notes, scans_url, latitude, longitude,
            created_at, mark_type, archive, fonds, series, record, old_province, old_district,
            old_community, old_settlement_type, old_settlement_name, current_region,
            current_district, current_community, current_settlement_type, current_settlement_name
        `).eq('id', id).single();
        if (error) {
            console.error('Помилка:', error);
            setRecord(null);
        } else {
            setRecord(data);
        }
        setLoading(false);
    };

    const toggleTooltip = (tooltipId: string) => {
        setActiveTooltip(activeTooltip === tooltipId ? null : tooltipId);
    };

    if (loading) return <p className="p-4 text-gray-900 dark:text-white">Завантаження...</p>;
    if (!record) return <p className="p-4 text-gray-900 dark:text-white">Запис не знайдено</p>;

    const fullLocationOld = [
        record.old_province,
        record.old_district,
        record.old_community,
        record.old_settlement_type && record.old_settlement_name
            ? `${record.old_settlement_type} ${record.old_settlement_name}`
            : null,
    ].filter(Boolean).join(', ');

    const fullLocationCurrent = [
        record.current_region ? `${record.current_region} область` : null,
        record.current_district ? `${record.current_district} район` : null,
        record.current_community ? `${record.current_community} громада` : null,
        record.current_settlement_type && record.current_settlement_name
            ? `${record.current_settlement_type} ${record.current_settlement_name}`
            : null,
    ].filter(Boolean).join(', ');

    const currentSettlementDisplay = record.current_settlement_name
        ? `${record.current_settlement_name}, ${record.current_settlement_type || 'населений пункт'}`
        : '-';

    const oldSettlementDisplay = record.old_settlement_name
        ? `${record.old_settlement_name}, ${record.old_settlement_type || 'населений пункт'}`
        : '-';

    const hasScans = !!record.scans_url;

    const tooltips: Record<string, string> = {
        current_division: "Адміністративний поділ, який існував на час додавання запису про інвентар до реєстру Інвентаріум",
        historical_division: "Адміністративний поділ, який існував на час, коли інвентар було складено",
        inventory_year: "Рік, коли було складено інвентар по вказаному населеному пункту",
        case_signature: "Шифр, за яким ви можете знайти справу у відповідному архіві",
        case_date: "Дати, вказані в архівній справі, в якій знаходиться даний інвентар (Дати справи можуть не відповідати рокові складання інвентарю)",
        pages_count: "Загальна кількість сторінок у справі (Це саме кількість сторінок, вказана в архівному описі. Кількість сторінок НЕ відповідає кількості сканів)",
        start_page: "Номер початкової сторінки, на якій знаходиться інвентар по даному населеному пункту",
        additional_signature: "Якщо ця ж справа знаходиться також в іншому архіві — буде вказано її додаткову сигнатуру"
    };

    return (
        <>
            <Header />
            <main className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title with Badge */}
                    <div className={`flex gap-[15px] md:gap-[20px] mb-[20px] lg:mb-[29px] ${isTitleMultiline ? 'items-center' : 'flex-wrap items-baseline'}`}>
                        <h1 
                            ref={titleRef}
                            className={`text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold ${isTitleMultiline ? 'flex-1' : ''}`}
                        >
                            {record.case_title || 'Інвентарний опис'}
                        </h1>
                        {hasScans ? (
                            <div className={`inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded bg-[#ECFEF5] dark:bg-[#065E44] ${isTitleMultiline ? 'flex-shrink-0' : ''}`}>
                                <span className="text-[#065E44] dark:text-[#ECFEF5] text-[13px] lg:text-[14px] font-medium whitespace-nowrap">
                                    Скани доступні онлайн
                                </span>
                            </div>
                        ) : (
                            <div className={`inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded bg-[#FEE2E2] dark:bg-[#880E16] ${isTitleMultiline ? 'flex-shrink-0' : ''}`}>
                                <span className="text-[#880E16] dark:text-[#FEE2E2] text-[13px] lg:text-[14px] font-medium whitespace-nowrap">
                                    Скани недоступні онлайн
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-[10px] lg:gap-[15px] mb-[20px]">
                        {record.scans_url && (
                            <a
                                href={record.scans_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                            >
                                <ExternalLink className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                                <span className="text-white text-[14px] lg:text-[16px] font-medium whitespace-nowrap">Переглянути скани</span>
                            </a>
                        )}
                        {record.latitude && record.longitude && (
                            <a
                                href={`https://www.openstreetmap.org/?mlat=${record.latitude}&mlon=${record.longitude}#map=16/${record.latitude}/${record.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                            >
                                <MapPin className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">Відкрити на карті</span>
                            </a>
                        )}
                        {record.archive && record.fonds && record.series && record.record && (
                            <button
                                onClick={() => {
                                    const query = [record.archive, record.fonds, record.series, record.record]
                                        .filter(Boolean)
                                        .join('-');
                                    const url = `https://inspector.duckarchive.com/search?q=${encodeURIComponent(query)}`;
                                    window.open(url, '_blank');
                                }}
                                className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                            >
                                <Search className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">Знайти в Інспекторі</span>
                            </button>
                        )}
                        <button
                            onClick={() => router.push(`/edit/${record.id}`)}
                            className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                        >
                            <Edit3 className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                            <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">Запропонувати виправлення</span>
                        </button>
                    </div>

                    {/* Warning Banner */}
                    {record.mark_type === 0 && (
                        <div className="flex items-start gap-[10px] lg:gap-[15px] px-[12px] lg:px-[15px] py-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308] mb-[20px]">
                            <AlertTriangle className="w-4 h-4 text-[#92400E] dark:text-[#451A03] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                            <p className="text-[#92400E] dark:text-[#451A03] text-[14px] lg:text-[16px] font-medium flex-1">
                                Зверніть увагу, що даний інвентар відноситься до певної області навколо населеного пункту. Потенційно у справі можуть бути ще й інвентарі по навколишнім населеним пунктам, а не лише по тому, що вказаний в записі.
                            </p>
                        </div>
                    )}

                    {/* Main Content Card */}
                    <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[30px] lg:gap-[40px]">
                        {/* Administrative Divisions */}
                        <div className="flex flex-col lg:flex-row gap-[20px] lg:gap-[10px]">
                            {/* Current Division */}
                            <div className="flex-1 flex flex-col gap-[15px]">
                                <div className="flex items-center gap-[10px]">
                                    <Map className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                                    <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                        Сучасний адміністративний поділ
                                    </h2>
                                    <div className="relative group">
                                        <button
                                            onClick={() => toggleTooltip('current_division')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                        >
                                            <HelpCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                        </button>
                                        {/* Desktop hover tooltip */}
                                        <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                            <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.current_division}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-[10px]">
                                    <div className="flex items-center gap-[5px]">
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">
                                            {currentSettlementDisplay}
                                        </p>
                                        {record.current_settlement_name && (
                                            <button
                                                onClick={() => {
                                                    const params = new URLSearchParams();
                                                    if (record.current_region) params.set('current_region', record.current_region);
                                                    if (record.current_district) params.set('current_district', record.current_district);
                                                    if (record.current_community) params.set('current_community', record.current_community);
                                                    if (record.current_settlement_name) params.set('current_settlement_name', record.current_settlement_name);

                                                    const url = `/settlement?${params.toString()}`;
                                                    window.open(url, '_self', 'noopener,noreferrer');
                                                }}
                                                className="flex items-center justify-center w-4 h-4 rounded bg-white dark:bg-white hover:bg-[#2563EB] dark:hover:bg-[#2563EB] transition-colors flex-shrink-0 group"
                                            >
                                                <ArrowUpRight className="w-3 h-3 text-gray-900 dark:text-gray-900 group-hover:text-white transition-colors" strokeWidth={2} />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                                        {fullLocationCurrent || '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Historical Division */}
                            <div className="flex-1 flex flex-col gap-[15px]">
                                <div className="flex items-center gap-[10px]">
                                    <Feather className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                                    <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                        Історичний адміністративний поділ {record.inventory_year ? `(станом на ${record.inventory_year} рік)` : ''}
                                    </h2>
                                    <div className="relative group">
                                        <button
                                            onClick={() => toggleTooltip('historical_division')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                        >
                                            <HelpCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                        </button>
                                        {/* Desktop hover tooltip */}
                                        <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                            <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.historical_division}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-[10px]">
                                    <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">
                                        {oldSettlementDisplay}
                                    </p>
                                    <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                                        {fullLocationOld || '-'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="h-[1px] w-full bg-gray-300 dark:bg-[#374151]"></div>

                        {/* Inventory Information */}
                        <div className="flex flex-col gap-[15px]">
                            <div className="flex items-center gap-[10px]">
                                <FileText className="w-5 h-5 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">Інформація про інвентар</h2>
                            </div>

                            <div className="flex flex-col gap-[20px]">
                                {/* Grid of Details */}
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-x-[15px] lg:gap-x-[20px] gap-y-[15px] lg:gap-y-[20px]">
                                    {/* Year */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Рік складання</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('inventory_year')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.inventory_year}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.inventory_year || '-'}</p>
                                    </div>

                                    {/* Case Signature */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Сигнатура справи</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('case_signature')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.case_signature}</p>
                                                </div>
                                            </div>
                                        </div>
                                        {record.case_signature ? (
                                            <div className="flex items-center gap-[5px]">
                                                <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.case_signature}</p>
                                                <button
                                                    onClick={() => router.push(`/case?case_signature=${encodeURIComponent(record.case_signature)}`)}
                                                    className="flex items-center justify-center w-4 h-4 rounded bg-white dark:bg-white hover:bg-[#2563EB] dark:hover:bg-[#2563EB] transition-colors flex-shrink-0 group"
                                                >
                                                    <ArrowUpRight className="w-3 h-3 text-gray-900 dark:text-gray-900 group-hover:text-white transition-colors" strokeWidth={2} />
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">-</p>
                                        )}
                                    </div>

                                    {/* Case Date */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Дата справи</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('case_date')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.case_date}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.case_date || '-'}</p>
                                    </div>

                                    {/* Pages */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Сторінок у справі</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('pages_count')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.pages_count}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.pages_count || '-'}</p>
                                    </div>

                                    {/* Start Page */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Початкова сторінка</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('start_page')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.start_page}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.inventory_start_page || '-'}</p>
                                    </div>

                                    {/* Additional Reference */}
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="flex items-center gap-[5px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Додаткова сигнатура</p>
                                            <div className="relative group">
                                                <button
                                                    onClick={() => toggleTooltip('additional_signature')}
                                                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#374151] rounded-full transition-colors lg:pointer-events-none"
                                                >
                                                    <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                                                </button>
                                                {/* Desktop hover tooltip */}
                                                <div className="hidden lg:group-hover:block absolute left-0 top-full mt-2 w-[280px] p-3 bg-white dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg shadow-lg z-10">
                                                    <p className="text-gray-900 dark:text-white text-[13px]">{tooltips.additional_signature}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.additional_case_signature || '-'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="h-[1px] w-full bg-gray-300 dark:bg-[#374151]"></div>

                        {/* Notes */}
                        {record.notes && (
                            <>
                                <div className="flex flex-col gap-[15px]">
                                    <div className="flex items-center gap-[10px]">
                                        <Edit3 className="w-5 h-5 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={2} />
                                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">Примітки</h2>
                                    </div>
                                    <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                                        {record.notes}
                                    </p>
                                </div>

                                {/* Separator */}
                                <div className="h-[1px] w-full bg-gray-300 dark:bg-[#374151]"></div>
                            </>
                        )}

                        {/* Scans */}
                        <div className="flex flex-col gap-[15px]">
                            <div className="flex items-center gap-[10px]">
                                <Image className="w-5 h-5 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">Скани</h2>
                            </div>
                            
                            {hasScans ? (
                                <div className="flex flex-col gap-[20px]">
                                    <div className="flex items-center gap-[5px]">
                                        <a
                                            href={record.scans_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium"
                                        >
                                            {(() => {
                                                try {
                                                    const url = new URL(record.scans_url);
                                                    return url.hostname.replace('www.', '');
                                                } catch {
                                                    return record.scans_url;
                                                }
                                            })()}
                                        </a>
                                        <button
                                            onClick={() => window.open(record.scans_url, '_blank')}
                                            className="flex items-center justify-center w-4 h-4 rounded bg-white dark:bg-white hover:bg-[#2563EB] dark:hover:bg-[#2563EB] transition-colors flex-shrink-0 group"
                                        >
                                            <ArrowUpRight className="w-3 h-3 text-gray-900 dark:text-gray-900 group-hover:text-white transition-colors" strokeWidth={2} />
                                        </button>
                                    </div>
                                    <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                                        Копія цієї справи доступна онлайн. Зверніть увагу, що для доступу до сайтів окремих іноземних архівів необхідно ввімкнути VPN.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px]">
                                    Наразі скановані копії цієї справи недоступні онлайн або нам про них не відомо. Якщо ви маєте посилання на такі матеріали, будь ласка, додайте його через кнопку "Запропонувати виправлення" вгорі сторінки.
                                </p>
                            )}
                        </div>

                        {/* Separator */}
                        <div className="h-[1px] w-full bg-gray-300 dark:bg-[#374151]"></div>

                        {/* Timestamp */}
                        <div className="flex items-center gap-[10px]">
                            <Clock className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px]">
                                Додано в реєстр {new Date(record.created_at).toLocaleDateString('uk-UA', { 
                                    day: 'numeric', 
                                    month: 'long', 
                                    year: 'numeric' 
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Tooltip Modal - appears at bottom on mobile, near button on desktop */}
            {activeTooltip && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/20 z-40 lg:hidden"
                        onClick={() => setActiveTooltip(null)}
                    />
                    
                    {/* Tooltip Content */}
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1F2937] border-t border-gray-300 dark:border-[#374151] shadow-lg z-50 lg:hidden">
                        <div className="max-w-[600px] mx-auto">
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="text-gray-900 dark:text-white text-[15px] font-semibold">Довідка</h3>
                                <button
                                    onClick={() => setActiveTooltip(null)}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-[#374151] rounded transition-colors"
                                >
                                    <span className="text-gray-600 dark:text-gray-400 text-[18px]">×</span>
                                </button>
                            </div>
                            <p className="text-gray-900 dark:text-white text-[14px] leading-relaxed">
                                {tooltips[activeTooltip]}
                            </p>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}