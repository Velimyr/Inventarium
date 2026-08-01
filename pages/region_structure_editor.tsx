import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/header';
import Toast from '../components/Toast';
import ComboSelect from '../components/region-editor/ComboSelect';
import MultiSelect from '../components/region-editor/MultiSelect';
import {
    parseStructure,
    buildNested,
    validatePoints,
    problemSnapshot,
    splitIssues,
    describeIssue,
    levelOptions,
    GROUP_LEVELS,
    LEVEL_LABELS,
    PROBLEM_LABELS,
} from '../components/region-editor/structure';
import type { FlatPoint, GroupLevel, ProblemCode } from '../components/region-editor/structure';
import { Upload, Download, Pencil, AlertTriangle, CheckCircle2, X, Layers, MapPin, ListChecks } from 'lucide-react';
import { searchKey } from '../lib/textSearch';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

const PAGE_SIZE = 100;

// Кожен фільтр-список приймає кілька значень; порожній масив = «усі»
interface Filters {
    q: string;
    country: string[];
    region: string[];
    district: string[];
    community: string[];
    type: string[];
    onlyInvalid: boolean;
    problem: ProblemFilter;
}

// 'no_coords' — узагальнення: бракує широти або довготи
type ProblemFilter = ProblemCode | 'no_coords' | '';

const EMPTY_FILTERS: Filters = {
    q: '', country: [], region: [], district: [], community: [], type: [],
    onlyInvalid: false, problem: '',
};

function hasNoCoords(point: FlatPoint): boolean {
    return !Number.isFinite(point.lat) || !Number.isFinite(point.lon);
}

type GroupDraft = Record<GroupLevel, string>;

const EMPTY_GROUP_DRAFT: GroupDraft = { country: '', region: '', district: '', community: '' };

interface PointDraft extends GroupDraft {
    name: string;
    code: string;
    type: string;
    lat: string;
    lon: string;
}

export default function RegionStructureEditorPage() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [points, setPoints] = useState<FlatPoint[] | null>(null);
    const [fileName, setFileName] = useState('');
    const [hadCountry, setHadCountry] = useState(false);

    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const [groupDraft, setGroupDraft] = useState<GroupDraft>(EMPTY_GROUP_DRAFT);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<PointDraft | null>(null);

    const [showIssues, setShowIssues] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Дефекти, що вже були у завантаженому файлі — щоб відрізняти їх від внесених редактором
    const [snapshot, setSnapshot] = useState<Map<string, Set<ProblemCode>>>(new Map());

    const report = useMemo(() => (points ? validatePoints(points) : null), [points]);

    const { blocking, inherited } = useMemo(
        () => splitIssues(report?.issues ?? [], snapshot),
        [report, snapshot],
    );

    const blockingIds = useMemo(() => new Set(blocking.map(i => i.id)), [blocking]);
    const inheritedIds = useMemo(() => new Set(inherited.map(i => i.id)), [inherited]);
    const invalidIds = useMemo(
        () => new Set([...blockingIds, ...inheritedIds]),
        [blockingIds, inheritedIds],
    );

    const codesById = useMemo(() => {
        const map = new Map<string, Set<ProblemCode>>();
        for (const issue of report?.issues ?? []) map.set(issue.id, new Set(issue.codes));
        return map;
    }, [report]);

    // Скільки записів має кожну проблему — це і є «що ще треба виправити»
    const stats = useMemo(() => {
        const perCode = {} as Record<ProblemCode, number>;
        for (const code of Object.keys(PROBLEM_LABELS) as ProblemCode[]) perCode[code] = 0;

        for (const issue of report?.issues ?? []) {
            for (const code of issue.codes) perCode[code]++;
        }

        const total = points?.length ?? 0;
        const invalid = report?.issues.length ?? 0;
        const noCoords = points ? points.filter(hasNoCoords).length : 0;

        return { perCode, total, invalid, ok: total - invalid, noCoords };
    }, [report, points]);

    const filtered = useMemo(() => {
        if (!points) return [];
        const q = searchKey(filters.q.trim());

        // Порожній набір означає «усі значення цього рівня»
        const sets = {
            country: new Set(filters.country),
            region: new Set(filters.region),
            district: new Set(filters.district),
            community: new Set(filters.community),
            type: new Set(filters.type),
        };
        const allows = (set: Set<string>, value: string) => set.size === 0 || set.has(value);

        return points.filter(p => {
            if (!allows(sets.country, p.country)) return false;
            if (!allows(sets.region, p.region)) return false;
            if (!allows(sets.district, p.district)) return false;
            if (!allows(sets.community, p.community)) return false;
            if (!allows(sets.type, p.type)) return false;
            if (filters.onlyInvalid && !invalidIds.has(p.id)) return false;

            if (filters.problem === 'no_coords') {
                if (!hasNoCoords(p)) return false;
            } else if (filters.problem && !codesById.get(p.id)?.has(filters.problem)) {
                return false;
            }

            if (q && !searchKey(p.name).includes(q) && !p.code.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [points, filters, invalidIds, codesById]);

    useEffect(() => { setPage(0); }, [filters]);

    const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    const typeOptions = useMemo(() => {
        if (!points) return [];
        return Array.from(new Set(points.map(p => p.type).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    }, [points]);

    // Довідники для фільтрів: кожен наступний рівень звужується попереднім
    const filterOptions = useMemo(() => {
        if (!points) return { country: [], region: [], district: [], community: [] } as Record<GroupLevel, string[]>;
        return {
            country: levelOptions(points, 'country'),
            region: levelOptions(points, 'region', { country: filters.country }),
            district: levelOptions(points, 'district', { country: filters.country, region: filters.region }),
            community: levelOptions(points, 'community', {
                country: filters.country, region: filters.region, district: filters.district,
            }),
        };
    }, [points, filters.country, filters.region, filters.district]);

    // Звузили батьківський рівень — знімаємо вибір дочірніх значень, яких там більше немає
    useEffect(() => {
        setFilters(prev => {
            let changed = false;
            const next = { ...prev };

            for (const level of ['region', 'district', 'community'] as GroupLevel[]) {
                const allowed = new Set(filterOptions[level]);
                const kept = prev[level].filter(value => allowed.has(value));
                if (kept.length !== prev[level].length) {
                    next[level] = kept;
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [filterOptions]);

    const groupOptions = useMemo(() => {
        if (!points) return { country: [], region: [], district: [], community: [] } as Record<GroupLevel, string[]>;
        return {
            country: levelOptions(points, 'country'),
            region: levelOptions(points, 'region', { country: groupDraft.country }),
            district: levelOptions(points, 'district', { country: groupDraft.country, region: groupDraft.region }),
            community: levelOptions(points, 'community', {
                country: groupDraft.country, region: groupDraft.region, district: groupDraft.district,
            }),
        };
    }, [points, groupDraft.country, groupDraft.region, groupDraft.district]);

    const editOptions = useMemo(() => {
        if (!points || !editDraft) return { country: [], region: [], district: [], community: [] } as Record<GroupLevel, string[]>;
        return {
            country: levelOptions(points, 'country'),
            region: levelOptions(points, 'region', { country: editDraft.country }),
            district: levelOptions(points, 'district', { country: editDraft.country, region: editDraft.region }),
            community: levelOptions(points, 'community', {
                country: editDraft.country, region: editDraft.region, district: editDraft.district,
            }),
        };
    }, [points, editDraft?.country, editDraft?.region, editDraft?.district, editDraft]);

    // Куди навести карту для точки без координат — на середину сусідів по громаді,
    // інакше по району чи області. Інакше довелось би шукати кримське село, стартуючи з Києва.
    const mapCenter = useMemo((): [number, number] => {
        const fallback: [number, number] = [50.4501, 30.5234];
        if (!points || !editDraft) return fallback;

        const scopes: ((p: FlatPoint) => boolean)[] = [
            p => p.community === editDraft.community && p.district === editDraft.district && p.region === editDraft.region,
            p => p.district === editDraft.district && p.region === editDraft.region,
            p => p.region === editDraft.region,
        ];

        for (const inScope of scopes) {
            const neighbours = points.filter(p => !hasNoCoords(p) && inScope(p));
            if (neighbours.length === 0) continue;

            const lat = neighbours.reduce((sum, p) => sum + p.lat, 0) / neighbours.length;
            const lon = neighbours.reduce((sum, p) => sum + p.lon, 0) / neighbours.length;
            return [lat, lon];
        }

        return fallback;
    }, [points, editDraft?.region, editDraft?.district, editDraft?.community, editDraft]);

    const handleFile = async (file: File) => {
        try {
            const text = await file.text();
            const result = parseStructure(JSON.parse(text));

            setPoints(result.points);
            setHadCountry(result.hadCountry);
            setFileName(file.name);
            setSnapshot(problemSnapshot(result.points));
            setFilters(EMPTY_FILTERS);
            setSelected(new Set());
            setGroupDraft(EMPTY_GROUP_DRAFT);
            setShowIssues(false);
            setPage(0);

            setToast({
                message: `Завантажено ${result.points.length} точок${result.hadCountry ? ' (країна вже є у файлі)' : ''}`,
                type: 'success',
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Не вдалося прочитати файл';
            setToast({ message, type: 'error' });
        }
    };

    const patchPoints = (ids: Set<string>, patch: Partial<FlatPoint>) => {
        setPoints(prev => prev && prev.map(p => (ids.has(p.id) ? { ...p, ...patch } : p)));
    };

    const applyGroupEdit = () => {
        const patch: Partial<FlatPoint> = {};
        for (const level of GROUP_LEVELS) {
            const value = groupDraft[level].trim();
            if (value) patch[level] = value;
        }

        if (Object.keys(patch).length === 0) {
            setToast({ message: 'Виберіть хоча б одне значення для зміни', type: 'error' });
            return;
        }

        patchPoints(selected, patch);
        setToast({ message: `Оновлено записів: ${selected.size}`, type: 'success' });
        setGroupDraft(EMPTY_GROUP_DRAFT);
        setSelected(new Set());
    };

    const openEditor = (point: FlatPoint) => {
        setEditingId(point.id);
        setEditDraft({
            name: point.name,
            code: point.code,
            type: point.type,
            lat: Number.isFinite(point.lat) ? String(point.lat) : '',
            lon: Number.isFinite(point.lon) ? String(point.lon) : '',
            country: point.country,
            region: point.region,
            district: point.district,
            community: point.community,
        });
    };

    const saveEditor = () => {
        if (!editingId || !editDraft) return;

        const lat = Number(editDraft.lat.replace(',', '.'));
        const lon = Number(editDraft.lon.replace(',', '.'));

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            setToast({ message: 'Широта має бути числом у межах −90…90', type: 'error' });
            return;
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            setToast({ message: 'Довгота має бути числом у межах −180…180', type: 'error' });
            return;
        }

        patchPoints(new Set([editingId]), {
            name: editDraft.name.trim(),
            code: editDraft.code.trim(),
            type: editDraft.type.trim(),
            lat,
            lon,
            country: editDraft.country.trim(),
            region: editDraft.region.trim(),
            district: editDraft.district.trim(),
            community: editDraft.community.trim(),
        });

        setEditingId(null);
        setEditDraft(null);
        setToast({ message: 'Запис оновлено', type: 'success' });
    };

    // force = true — «як є»: вивантажуємо навіть із незаповненими полями
    const handleDownload = (force = false) => {
        if (!points || !report) return;

        if (!force && report.issues.length > 0) {
            setShowIssues(true);
            setToast({
                message: `Неповних записів: ${report.issues.length}. Виправте їх або скористайтесь кнопкою «Вивантажити попри ці прогалини».`,
                type: 'error',
            });
            return;
        }

        const json = JSON.stringify(buildNested(points), null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.replace(/\.json$/i, '') + '_with_country.json';
        link.click();
        URL.revokeObjectURL(url);

        setToast({
            message: force && report.issues.length > 0
                ? `Файл вивантажено як є — з ${report.issues.length} неповними записами`
                : 'Файл сформовано та завантажено',
            type: 'success',
        });
    };

    const toggleOne = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const pageAllSelected = pageItems.length > 0 && pageItems.every(p => selected.has(p.id));

    const togglePage = () => {
        setSelected(prev => {
            const next = new Set(prev);
            for (const p of pageItems) {
                if (pageAllSelected) next.delete(p.id); else next.add(p.id);
            }
            return next;
        });
    };

    const inputClass = 'px-[10px] py-[8px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px] w-full';
    const cardClass = 'p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]';

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                        Редактор регіональної структури
                    </h1>
                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                        Завантажте JSON, відредагуйте окремі точки або групи, додайте рівень «Країна» — і завантажте новий файл.
                    </p>

                    {/* Завантаження файлу */}
                    <section className={cardClass}>
                        <div className="flex flex-wrap items-center gap-[15px]">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFile(file);
                                    e.target.value = '';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-[8px] px-[16px] py-[10px] rounded bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-medium"
                            >
                                <Upload className="w-4 h-4" strokeWidth={1.6} />
                                Завантажити JSON
                            </button>

                            {points && (
                                <>
                                    <span className="text-gray-700 dark:text-[#D1D5DB] text-[14px]">
                                        <b>{fileName}</b> — {points.length} точок,{' '}
                                        {hadCountry ? 'формат уже з країною' : 'старий формат (без країни)'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDownload()}
                                        className="flex items-center gap-[8px] px-[16px] py-[10px] rounded bg-green-600 hover:bg-green-700 text-white text-[14px] font-medium ml-auto"
                                    >
                                        <Download className="w-4 h-4" strokeWidth={1.6} />
                                        Скачати новий JSON
                                    </button>
                                </>
                            )}
                        </div>
                    </section>

                    {points && report && (
                        <>
                            {/* Стан заповненості */}
                            <section className={cardClass}>
                                <div className="flex items-start gap-[10px]">
                                    {report.issues.length === 0 ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5 text-[#CA8A04] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                                    )}
                                    <div className="flex-1">
                                        <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                                            {report.issues.length === 0
                                                ? 'Усі записи заповнені повністю — файл готовий до вивантаження.'
                                                : `Неповних записів: ${report.issues.length}. «Скачати новий JSON» їх не пропустить — виправте або вивантажте як є.`}
                                        </p>

                                        {inherited.length > 0 && (
                                            <p className="text-gray-700 dark:text-[#D1D5DB] text-[13px] mt-[5px]">
                                                З них {inherited.length} — прогалини (координати чи код), які вже були
                                                у вихідному файлі; редактор їх не створював.
                                            </p>
                                        )}

                                        {report.duplicateCodes.length > 0 && (
                                            <p className="text-gray-700 dark:text-[#D1D5DB] text-[13px] mt-[5px]">
                                                Попередження: кодів, що дублюються — {report.duplicateCodes.length} шт.
                                                (не блокує вивантаження)
                                            </p>
                                        )}

                                        {report.issues.length > 0 && (
                                            <div className="flex flex-wrap gap-[10px] mt-[10px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setFilters(prev => ({ ...prev, onlyInvalid: true }))}
                                                    className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                                >
                                                    Показати лише неповні
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowIssues(v => !v)}
                                                    className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                                >
                                                    {showIssues ? 'Сховати перелік проблем' : 'Показати перелік проблем'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDownload(true)}
                                                    className="flex items-center gap-[6px] px-[12px] py-[6px] rounded bg-[#EAB308] hover:bg-[#CA8A04] text-[#451A03] text-[13px] font-medium"
                                                >
                                                    <Download className="w-4 h-4" strokeWidth={1.6} />
                                                    Вивантажити попри ці прогалини
                                                </button>
                                            </div>
                                        )}

                                        {showIssues && report.issues.length > 0 && (
                                            <ul className="mt-[10px] max-h-[200px] overflow-y-auto text-[13px] text-gray-700 dark:text-[#D1D5DB] list-disc pl-[20px]">
                                                {[...blocking, ...inherited].slice(0, 200).map((issue, index) => (
                                                    <li key={`${issue.id}-${index}`}>
                                                        {issue.name}: {describeIssue(issue)}
                                                    </li>
                                                ))}
                                                {report.issues.length > 200 && (
                                                    <li>…та ще {report.issues.length - 200}</li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* Що ще треба виправити */}
                            <section className={cardClass}>
                                <h2 className="flex items-center gap-[8px] text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    <ListChecks className="w-5 h-5" strokeWidth={1.6} />
                                    Що треба виправити
                                </h2>

                                <div className="flex flex-wrap gap-[10px] mb-[15px]">
                                    <div className="px-[12px] py-[8px] rounded border border-gray-300 dark:border-[#374151]">
                                        <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px]">Усього точок: </span>
                                        <b className="text-gray-900 dark:text-[#F3F4F6] text-[14px]">{stats.total}</b>
                                    </div>
                                    <div className="px-[12px] py-[8px] rounded border border-green-600 bg-green-50 dark:bg-green-900/20">
                                        <span className="text-green-800 dark:text-green-300 text-[13px]">Заповнені повністю: </span>
                                        <b className="text-green-800 dark:text-green-300 text-[14px]">{stats.ok}</b>
                                    </div>
                                    <div className="px-[12px] py-[8px] rounded border border-[#CA8A04] bg-[#FEF3C7] dark:bg-[#EAB308]/20">
                                        <span className="text-[#92400E] dark:text-[#FDE68A] text-[13px]">Потребують уваги: </span>
                                        <b className="text-[#92400E] dark:text-[#FDE68A] text-[14px]">{stats.invalid}</b>
                                    </div>
                                </div>

                                {stats.invalid === 0 ? (
                                    <p className="text-gray-700 dark:text-[#D1D5DB] text-[14px]">
                                        Виправляти нічого — усі точки заповнені.
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-gray-700 dark:text-[#D1D5DB] text-[13px] mb-[10px] opacity-80">
                                            Натисніть на проблему, щоб залишити в таблиці лише такі точки.
                                        </p>
                                        <div className="flex flex-wrap gap-[10px]">
                                            {stats.noCoords > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFilters({ ...EMPTY_FILTERS, problem: 'no_coords' })}
                                                    className={`flex items-center gap-[6px] px-[12px] py-[8px] rounded border text-[13px] ${
                                                        filters.problem === 'no_coords'
                                                            ? 'border-red-600 bg-red-600 text-white'
                                                            : 'border-red-400 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                    }`}
                                                >
                                                    <MapPin className="w-4 h-4" strokeWidth={1.8} />
                                                    Без координат: <b>{stats.noCoords}</b>
                                                </button>
                                            )}

                                            {(Object.keys(PROBLEM_LABELS) as ProblemCode[])
                                                .filter(code => code !== 'bad_lat' && code !== 'bad_lon' && stats.perCode[code] > 0)
                                                .map(code => (
                                                    <button
                                                        key={code}
                                                        type="button"
                                                        onClick={() => setFilters({ ...EMPTY_FILTERS, problem: code })}
                                                        className={`px-[12px] py-[8px] rounded border text-[13px] ${
                                                            filters.problem === code
                                                                ? 'border-[#CA8A04] bg-[#CA8A04] text-white'
                                                                : 'border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] hover:bg-gray-100 dark:hover:bg-[#374151]'
                                                        }`}
                                                    >
                                                        {PROBLEM_LABELS[code]}: <b>{stats.perCode[code]}</b>
                                                    </button>
                                                ))}
                                        </div>
                                    </>
                                )}
                            </section>

                            {/* Фільтри */}
                            <section className={cardClass}>
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-[15px]">
                                    <label className="flex flex-col gap-[5px]">
                                        <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">Пошук (назва або код)</span>
                                        <input
                                            type="text"
                                            value={filters.q}
                                            onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
                                            className={inputClass}
                                        />
                                    </label>

                                    {GROUP_LEVELS.map(level => (
                                        <MultiSelect
                                            key={level}
                                            label={LEVEL_LABELS[level]}
                                            options={filterOptions[level]}
                                            value={filters[level]}
                                            onChange={value => setFilters(prev => ({ ...prev, [level]: value }))}
                                        />
                                    ))}

                                    <MultiSelect
                                        label="Тип"
                                        options={typeOptions}
                                        value={filters.type}
                                        onChange={value => setFilters(prev => ({ ...prev, type: value }))}
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-[15px] mt-[15px]">
                                    <label className="flex items-center gap-[8px] text-gray-700 dark:text-[#D1D5DB] text-[14px]">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyInvalid}
                                            onChange={e => setFilters(prev => ({ ...prev, onlyInvalid: e.target.checked }))}
                                        />
                                        Лише неповні записи
                                    </label>
                                    {filters.problem && (
                                        <button
                                            type="button"
                                            onClick={() => setFilters(prev => ({ ...prev, problem: '' }))}
                                            className="flex items-center gap-[6px] px-[10px] py-[5px] rounded bg-[#FEF3C7] dark:bg-[#EAB308]/20 text-[#92400E] dark:text-[#FDE68A] text-[13px]"
                                        >
                                            {filters.problem === 'no_coords' ? 'Без координат' : PROBLEM_LABELS[filters.problem]}
                                            <X className="w-3.5 h-3.5" strokeWidth={2} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setFilters(EMPTY_FILTERS)}
                                        className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                    >
                                        Скинути фільтри
                                    </button>
                                    <span className="text-gray-700 dark:text-[#D1D5DB] text-[14px] ml-auto">
                                        Знайдено: <b>{filtered.length}</b>
                                    </span>
                                </div>
                            </section>

                            {/* Групове редагування */}
                            <section className={cardClass}>
                                <h2 className="flex items-center gap-[8px] text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    <Layers className="w-5 h-5" strokeWidth={1.6} />
                                    Групове редагування — вибрано {selected.size}
                                </h2>

                                <div className="flex flex-wrap gap-[10px] mb-[15px]">
                                    <button
                                        type="button"
                                        onClick={() => setSelected(new Set(filtered.map(p => p.id)))}
                                        className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                    >
                                        Вибрати всі відфільтровані ({filtered.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(new Set())}
                                        className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                                    >
                                        Зняти виділення
                                    </button>
                                </div>

                                <p className="text-gray-700 dark:text-[#D1D5DB] text-[13px] mb-[15px] opacity-80">
                                    Групою змінюються лише рівні групування. Назва, координати й тип редагуються окремо для кожної точки.
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-[15px]">
                                    {GROUP_LEVELS.map(level => (
                                        <ComboSelect
                                            key={level}
                                            label={LEVEL_LABELS[level]}
                                            value={groupDraft[level]}
                                            options={groupOptions[level]}
                                            emptyLabel="— не змінювати —"
                                            disabled={selected.size === 0}
                                            onChange={value => setGroupDraft(prev => ({ ...prev, [level]: value }))}
                                        />
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={applyGroupEdit}
                                    disabled={selected.size === 0}
                                    className="mt-[15px] px-[16px] py-[10px] rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[14px] font-medium"
                                >
                                    Застосувати до вибраних ({selected.size})
                                </button>
                            </section>

                            {/* Таблиця точок */}
                            <section className="rounded-lg border border-gray-300 dark:border-[#374151] overflow-hidden mb-[20px]">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px] text-left">
                                        <thead className="bg-gray-100 dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6]">
                                            <tr>
                                                <th className="px-[10px] py-[10px]">
                                                    <input type="checkbox" checked={pageAllSelected} onChange={togglePage} />
                                                </th>
                                                <th className="px-[10px] py-[10px]">Назва</th>
                                                <th className="px-[10px] py-[10px]">Тип</th>
                                                <th className="px-[10px] py-[10px]">Код</th>
                                                <th className="px-[10px] py-[10px]">Широта</th>
                                                <th className="px-[10px] py-[10px]">Довгота</th>
                                                {GROUP_LEVELS.map(level => (
                                                    <th key={level} className="px-[10px] py-[10px]">{LEVEL_LABELS[level]}</th>
                                                ))}
                                                <th className="px-[10px] py-[10px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-700 dark:text-[#D1D5DB]">
                                            {pageItems.map(point => (
                                                <tr
                                                    key={point.id}
                                                    className={`border-t border-gray-200 dark:border-[#374151] ${
                                                        blockingIds.has(point.id)
                                                            ? 'bg-red-50 dark:bg-[#7F1D1D]/25'
                                                            : inheritedIds.has(point.id)
                                                                ? 'bg-[#FEF3C7] dark:bg-[#EAB308]/10'
                                                                : ''
                                                    }`}
                                                >
                                                    <td className="px-[10px] py-[8px]">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.has(point.id)}
                                                            onChange={() => toggleOne(point.id)}
                                                        />
                                                    </td>
                                                    <td className="px-[10px] py-[8px] text-gray-900 dark:text-[#F3F4F6] font-medium">{point.name}</td>
                                                    <td className="px-[10px] py-[8px]">{point.type}</td>
                                                    <td className="px-[10px] py-[8px] font-mono text-[12px]">{point.code}</td>
                                                    {hasNoCoords(point) ? (
                                                        <td className="px-[10px] py-[8px]" colSpan={2}>
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditor(point)}
                                                                className="flex items-center gap-[6px] px-[10px] py-[5px] rounded bg-red-600 hover:bg-red-700 text-white text-[12px] font-medium"
                                                            >
                                                                <MapPin className="w-3.5 h-3.5" strokeWidth={1.8} />
                                                                Вказати на карті
                                                            </button>
                                                        </td>
                                                    ) : (
                                                        <>
                                                            <td className="px-[10px] py-[8px]">{point.lat}</td>
                                                            <td className="px-[10px] py-[8px]">{point.lon}</td>
                                                        </>
                                                    )}
                                                    {GROUP_LEVELS.map(level => (
                                                        <td key={level} className="px-[10px] py-[8px]">
                                                            {point[level] || <span className="text-red-600">—</span>}
                                                        </td>
                                                    ))}
                                                    <td className="px-[10px] py-[8px]">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditor(point)}
                                                            title="Редагувати"
                                                            className="p-[6px] rounded hover:bg-gray-200 dark:hover:bg-[#374151]"
                                                        >
                                                            <Pencil className="w-4 h-4" strokeWidth={1.6} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {pageItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={11} className="px-[10px] py-[20px] text-center">
                                                        Нічого не знайдено
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex items-center justify-between gap-[10px] px-[10px] py-[10px] bg-gray-100 dark:bg-[#1F2937]">
                                    <button
                                        type="button"
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                        className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px] disabled:opacity-40"
                                    >
                                        ← Назад
                                    </button>
                                    <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px]">
                                        Сторінка {page + 1} з {pageCount}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                                        disabled={page >= pageCount - 1}
                                        className="px-[12px] py-[6px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px] disabled:opacity-40"
                                    >
                                        Далі →
                                    </button>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>

            {/* Редагування однієї точки */}
            {editDraft && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] p-[20px]">
                        <div className="flex items-center justify-between mb-[15px]">
                            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[20px] font-semibold">
                                Редагування точки
                            </h2>
                            <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditDraft(null); }}
                                className="p-[6px] rounded hover:bg-gray-200 dark:hover:bg-[#374151] text-gray-900 dark:text-[#F3F4F6]"
                            >
                                <X className="w-5 h-5" strokeWidth={1.6} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px]">
                            <label className="flex flex-col gap-[5px]">
                                <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">Назва</span>
                                <input
                                    type="text"
                                    value={editDraft.name}
                                    onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                                    className={inputClass}
                                />
                            </label>

                            <label className="flex flex-col gap-[5px]">
                                <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">Код</span>
                                <input
                                    type="text"
                                    value={editDraft.code}
                                    onChange={e => setEditDraft({ ...editDraft, code: e.target.value })}
                                    className={inputClass}
                                />
                            </label>

                            <ComboSelect
                                label="Тип"
                                value={editDraft.type}
                                options={typeOptions}
                                onChange={value => setEditDraft({ ...editDraft, type: value })}
                            />

                            <div className="grid grid-cols-2 gap-[15px]">
                                <label className="flex flex-col gap-[5px]">
                                    <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">Широта</span>
                                    <input
                                        type="text"
                                        value={editDraft.lat}
                                        onChange={e => setEditDraft({ ...editDraft, lat: e.target.value })}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="flex flex-col gap-[5px]">
                                    <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">Довгота</span>
                                    <input
                                        type="text"
                                        value={editDraft.lon}
                                        onChange={e => setEditDraft({ ...editDraft, lon: e.target.value })}
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            {GROUP_LEVELS.map(level => (
                                <ComboSelect
                                    key={level}
                                    label={LEVEL_LABELS[level]}
                                    value={editDraft[level]}
                                    options={editOptions[level]}
                                    onChange={value => setEditDraft({ ...editDraft, [level]: value })}
                                />
                            ))}
                        </div>

                        <div className="mt-[15px]">
                            <span className="text-gray-700 dark:text-[#D1D5DB] text-[13px] font-medium">
                                Позначте точку на карті
                            </span>
                            <div className="mt-[5px]">
                                <MapSelector
                                    latitude={editDraft.lat}
                                    longitude={editDraft.lon}
                                    center={mapCenter}
                                    height="h-[320px]"
                                    onPositionChange={(lat, lon) => setEditDraft(prev => (prev ? { ...prev, lat, lon } : prev))}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-[10px] mt-[20px]">
                            <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditDraft(null); }}
                                className="px-[16px] py-[10px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[14px]"
                            >
                                Скасувати
                            </button>
                            <button
                                type="button"
                                onClick={saveEditor}
                                className="px-[16px] py-[10px] rounded bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-medium"
                            >
                                Зберегти
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
            )}
        </>
    );
}
