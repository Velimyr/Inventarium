import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../../components/header';
import { supabase } from '../../lib/supabaseClient';
import { toPair } from '../../components/keys/geometry';
import type { KeyPoint, MapKeyRow } from '../../components/keys/geometry';
import { BookOpen, FileText, MapPin, KeyRound, Calendar, Pencil } from 'lucide-react';
import { isNamedLevel } from '../../components/keys/regionData';

const KeyShapePreview = dynamic(() => import('../../components/keys/KeyShapePreview'), { ssr: false });

interface KeyDetails extends MapKeyRow {
    created_at: string;
}

// Посилання на сторінку поселення — той самий формат, що й у попапах карти
function settlementUrl(point: KeyPoint): string {
    const params = new URLSearchParams();
    if (point.country) params.set('current_country', point.country);
    if (point.region) params.set('current_region', point.region);
    if (point.district) params.set('current_district', point.district);
    if (point.community) params.set('current_community', point.community);
    if (point.name) params.set('current_settlement_name', point.name);
    return `/settlement?${params.toString()}`;
}

// Ключ поселення для мапи лічильників (той самий кортеж, що ідентифікує пункт у records)
function settlementKey(p: { region: string; district: string; community: string; name: string }): string {
    return [p.region, p.district, p.community, p.name].join('|');
}

// «1 інвентар», «2 інвентарі», «5 інвентарів»
function inventoriesLabel(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} інвентар`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} інвентарі`;
    return `${n} інвентарів`;
}

function SettlementRow({ point, badge, count }: { point: KeyPoint; badge?: string; count?: number }) {
    return (
        <li className="flex items-center justify-between gap-3 py-[8px] px-[12px] rounded border border-gray-200 dark:border-[#374151] bg-white dark:bg-[#1F2937]">
            <div className="min-w-0">
                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium">
                    {point.type} {point.name}
                </span>
                {badge && (
                    <span className="ml-2 text-[11px] px-[6px] py-[2px] rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 align-middle">
                        {badge}
                    </span>
                )}
                <div className="text-gray-600 dark:text-gray-400 text-[12px] truncate">
                    {[point.community, point.district, point.region, point.country]
                        .filter(isNamedLevel)
                        .join(', ')}
                </div>
            </div>
            <Link
                href={settlementUrl(point)}
                className={`flex-shrink-0 underline text-[13px] ${
                    count === 0
                        ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        : 'text-[#2563EB] hover:text-[#1D4ED8]'
                }`}
            >
                {count === undefined ? 'інвентарі…' : inventoriesLabel(count)}
            </Link>
        </li>
    );
}

export default function KeyDetailsPage() {
    const router = useRouter();
    const { id } = router.query;

    const [keyData, setKeyData] = useState<KeyDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [inventoryCounts, setInventoryCounts] = useState<Record<string, number> | null>(null);

    useEffect(() => {
        if (!router.isReady || typeof id !== 'string') return;

        let cancelled = false;
        supabase
            .from('map_keys')
            .select('id, name, source, description, center, points, polygon, created_at')
            .eq('id', id)
            .eq('status', 'approved')
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) console.error('Помилка завантаження ключа:', error);
                if (data) setKeyData(data as KeyDetails);
                else setNotFound(true);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [router.isReady, id]);

    // Кількість підтверджених інвентарів по кожному поселенню ключа (один запит)
    useEffect(() => {
        if (!keyData) return;

        const allPoints = [keyData.center, ...keyData.points];
        const names = Array.from(new Set(allPoints.map(p => p.name).filter(Boolean)));
        if (names.length === 0) {
            setInventoryCounts({});
            return;
        }

        let cancelled = false;
        supabase
            .from('records')
            .select('current_settlement_name, current_country, current_region, current_district, current_community')
            .eq('approved', true)
            .in('current_settlement_name', names)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.error('Помилка підрахунку інвентарів:', error);
                    setInventoryCounts({});
                    return;
                }
                const counts: Record<string, number> = {};
                for (const r of data || []) {
                    const k = settlementKey({
                        region: r.current_region,
                        district: r.current_district,
                        community: r.current_community,
                        name: r.current_settlement_name,
                    });
                    counts[k] = (counts[k] || 0) + 1;
                }
                setInventoryCounts(counts);
            });

        return () => {
            cancelled = true;
        };
    }, [keyData]);

    const countFor = (point: KeyPoint): number | undefined =>
        inventoryCounts === null ? undefined : (inventoryCounts[settlementKey(point)] || 0);

    return (
        <>
            <Head>
                <title>{keyData ? `${keyData.name} — Інвентаріум` : 'Ключ — Інвентаріум'}</title>
            </Head>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {loading ? (
                        <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                    ) : notFound || !keyData ? (
                        <div className="text-center py-[60px]">
                            <p className="text-gray-900 dark:text-white text-[18px] mb-[10px]">Ключ не знайдено</p>
                            <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                                Можливо, він ще на перевірці або був відхилений.{' '}
                                <Link href="/map" className="text-[#2563EB] underline hover:text-[#1D4ED8]">
                                    Повернутися до карти
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-[10px] mb-[10px]">
                                <KeyRound className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                                    {keyData.name}
                                </h1>
                                <Link
                                    href={`/key/edit/${keyData.id}`}
                                    className="flex items-center gap-[6px] px-[12px] h-[34px] rounded border border-gray-300 dark:border-[#374151] text-gray-700 dark:text-gray-300 text-[13px] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors ml-auto"
                                >
                                    <Pencil className="w-4 h-4" strokeWidth={1.6} />
                                    Запропонувати зміни
                                </Link>
                            </div>

                            <p className="flex items-center gap-[6px] text-gray-600 dark:text-gray-400 text-[13px] mb-[20px]">
                                <Calendar className="w-4 h-4" strokeWidth={1.6} />
                                Додано {new Date(keyData.created_at).toLocaleDateString('uk-UA')} ·
                                Населених пунктів: {keyData.points.length + 1}
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-[20px]">
                                {/* Ліва колонка: опис + склад */}
                                <div>
                                    {(keyData.description || keyData.source) && (
                                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                            {keyData.description && (
                                                <div className="flex items-start gap-[10px] mb-[12px]">
                                                    <FileText className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <p className="min-w-0 text-gray-900 dark:text-white text-[14px] lg:text-[15px] whitespace-pre-wrap break-words">
                                                        {keyData.description}
                                                    </p>
                                                </div>
                                            )}
                                            {keyData.source && (
                                                <div className="flex items-start gap-[10px]">
                                                    <BookOpen className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <p className="min-w-0 text-gray-700 dark:text-gray-300 text-[13px] lg:text-[14px] break-words">
                                                        Джерело: {keyData.source}
                                                    </p>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827]">
                                        <div className="flex items-center gap-[10px] mb-[15px]">
                                            <MapPin className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                                Склад ключа
                                            </h2>
                                        </div>

                                        <ul className="space-y-[8px]">
                                            <SettlementRow point={keyData.center} badge="центр ключа" count={countFor(keyData.center)} />
                                            {keyData.points.map((point) => (
                                                <SettlementRow
                                                    key={point.code || `${point.lat}-${point.lng}`}
                                                    point={point}
                                                    count={countFor(point)}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                </div>

                                {/* Права колонка: карта */}
                                <div>
                                    <KeyShapePreview
                                        center={toPair(keyData.center)}
                                        points={keyData.points.map(toPair)}
                                        rings={keyData.polygon ?? undefined}
                                        heightClass="h-[420px]"
                                        interactive
                                    />
                                    <p className="mt-[8px] text-gray-600 dark:text-gray-400 text-[12px]">
                                        Червона точка — центр ключа, пунктирні лінії ведуть до населених пунктів.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
