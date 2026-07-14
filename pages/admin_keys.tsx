import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { isAdminUser } from '../lib/adminUsers';
import { sendNotification } from '../components/notifications';
import { KeyRound, Check, X, User, FileText, BookOpen, MapPin, Pencil, Save } from 'lucide-react';
import { toPair, convexHull, bufferedHull, POLYGON_VARIANT_LABELS, DEFAULT_POLYGON_VARIANT } from '../components/keys/geometry';
import type { KeyGeometry, KeyPoint, PolygonVariant, PolygonRings } from '../components/keys/geometry';
import { voronoiTerritory } from '../components/keys/voronoi';
import { fetchRegionStructure, flattenStructure } from '../components/keys/regionData';
import type { FlatSettlement } from '../components/keys/regionData';

const KeyShapePreview = dynamic(() => import('../components/keys/KeyShapePreview'), { ssr: false });
const KeyBuilderMap = dynamic(() => import('../components/keys/KeyBuilderMap'), { ssr: false });

interface PendingKey {
    id: string;
    name: string;
    source: string | null;
    description: string | null;
    center: KeyPoint;
    points: KeyPoint[];
    email: string;
    created_by: string | null;
    created_at: string;
    polygon_variant: PolygonVariant | null;
}

// Пропозиція змін до підтвердженого ключа (map_keys_edit)
interface ProposedEdit {
    id: string;
    key_id: string;
    name: string;
    source: string | null;
    description: string | null;
    center: KeyPoint;
    points: KeyPoint[];
    polygon_variant: PolygonVariant;
    email: string;
    created_by: string | null;
    created_at: string;
}

// Мінімум, потрібний для обчислення контуру (і ключі, і пропозиції)
interface ShapeEntity {
    id: string;
    center: KeyPoint;
    points: KeyPoint[];
}

const VARIANT_ORDER: PolygonVariant[] = ['hull', 'buffer', 'voronoi'];

export default function AdminKeysPage() {
    const { user, loading: userLoading } = useUser();

    const [isAdmin, setIsAdmin] = useState(false);
    const [keys, setKeys] = useState<PendingKey[]>([]);
    const [edits, setEdits] = useState<ProposedEdit[]>([]);
    const [originals, setOriginals] = useState<Record<string, PendingKey>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Режим редагування ключа перед підтвердженням
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', source: '', description: '' });
    const [editGeometry, setEditGeometry] = useState<KeyGeometry>({ center: null, points: [] });

    // Вибір варіанта контуру: 'hull'/'buffer' рахуються синхронно,
    // 'voronoi' — асинхронно (потребує довідника населених пунктів)
    const [variants, setVariants] = useState<Record<string, PolygonVariant>>({});
    const [ringsCache, setRingsCache] = useState<Record<string, PolygonRings>>({});
    const [computingVoronoiId, setComputingVoronoiId] = useState<string | null>(null);
    const flatSettlementsRef = useRef<FlatSettlement[] | null>(null);

    const getVariant = (key: PendingKey): PolygonVariant =>
        variants[key.id] ?? key.polygon_variant ?? DEFAULT_POLYGON_VARIANT;

    const keySites = (entity: ShapeEntity) => [toPair(entity.center), ...entity.points.map(toPair)];

    const computeSyncRings = (entity: ShapeEntity, variant: PolygonVariant): PolygonRings | null => {
        if (variant === 'hull') return [convexHull(keySites(entity))];
        if (variant === 'buffer') return [bufferedHull(keySites(entity))];
        return null;
    };

    const ringsFor = (key: PendingKey): PolygonRings | undefined => {
        const variant = getVariant(key);
        return ringsCache[`${key.id}:${variant}`] ?? computeSyncRings(key, variant) ?? undefined;
    };

    const ringsForEdit = (edit: ProposedEdit): PolygonRings | undefined =>
        ringsCache[`${edit.id}:${edit.polygon_variant}`] ?? computeSyncRings(edit, edit.polygon_variant) ?? undefined;

    const computeVoronoi = async (entity: ShapeEntity) => {
        const cacheKey = `${entity.id}:voronoi`;
        if (ringsCache[cacheKey]) return;
        setComputingVoronoiId(entity.id);
        try {
            if (!flatSettlementsRef.current) {
                flatSettlementsRef.current = flattenStructure(await fetchRegionStructure());
            }
            const keyCodes = new Set([entity.center.code, ...entity.points.map(p => p.code)]);
            const neighbors = flatSettlementsRef.current.filter(s => !keyCodes.has(s.code));
            const rings = voronoiTerritory(keySites(entity), neighbors);
            setRingsCache(prev => ({ ...prev, [cacheKey]: rings }));
        } catch (err) {
            console.error('Помилка обчислення території за Вороним:', err);
            setToast({ message: '❌ Не вдалося обчислити варіант «Діаграми Вороного»', type: 'error' });
        } finally {
            setComputingVoronoiId(null);
        }
    };

    const selectVariant = (key: PendingKey, variant: PolygonVariant) => {
        setVariants(prev => ({ ...prev, [key.id]: variant }));
        if (variant === 'voronoi') computeVoronoi(key);
    };

    // Синхронні варіанти рахуємо одразу в кеш — стабільні об'єкти не смикають прев'ю
    useEffect(() => {
        if (keys.length === 0 && edits.length === 0) return;
        setRingsCache(prev => {
            const next = { ...prev };
            for (const key of keys) {
                if (!next[`${key.id}:hull`]) next[`${key.id}:hull`] = [convexHull(keySites(key))];
                if (!next[`${key.id}:buffer`]) next[`${key.id}:buffer`] = [bufferedHull(keySites(key))];
            }
            for (const edit of edits) {
                const sync = computeSyncRings(edit, edit.polygon_variant);
                if (sync && !next[`${edit.id}:${edit.polygon_variant}`]) {
                    next[`${edit.id}:${edit.polygon_variant}`] = sync;
                }
            }
            return next;
        });
        // Вороний для пропозицій рахуємо одразу — щоб до апруву контур був готовий
        for (const edit of edits) {
            if (edit.polygon_variant === 'voronoi') computeVoronoi(edit);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys, edits]);

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setError('⛔ Ви не авторизовані');
            setLoading(false);
            return;
        }

        const fetchAdminAndKeys = async () => {
            const hasAdminAccess = await isAdminUser(supabase, user.id);

            if (!hasAdminAccess) {
                setError('⛔ У вас немає доступу до цієї сторінки');
                setLoading(false);
                return;
            }

            setIsAdmin(true);

            const { data: keysData, error: keysError } = await supabase
                .from('map_keys')
                .select('id, name, source, description, center, points, email, created_by, created_at, polygon_variant')
                .eq('status', 'new')
                .order('created_at', { ascending: true });

            if (keysError) {
                setError('❌ Помилка завантаження ключів');
                setLoading(false);
                console.error('Keys error:', keysError);
                return;
            }

            setKeys((keysData || []) as PendingKey[]);

            // Запропоновані зміни до підтверджених ключів + їхні поточні версії (для порівняння)
            const { data: editsData, error: editsError } = await supabase
                .from('map_keys_edit')
                .select('id, key_id, name, source, description, center, points, polygon_variant, email, created_by, created_at')
                .order('created_at', { ascending: true });

            if (editsError) {
                console.error('Edits error:', editsError);
            } else {
                const proposed = (editsData || []) as ProposedEdit[];
                setEdits(proposed);

                const keyIds = Array.from(new Set(proposed.map(e => e.key_id)));
                if (keyIds.length > 0) {
                    const { data: origData } = await supabase
                        .from('map_keys')
                        .select('id, name, source, description, center, points, email, created_by, created_at, polygon_variant')
                        .in('id', keyIds);
                    const map: Record<string, PendingKey> = {};
                    (origData || []).forEach((k: PendingKey) => { map[k.id] = k; });
                    setOriginals(map);
                }
            }

            setLoading(false);
        };

        fetchAdminAndKeys();
    }, [user, userLoading]);

    const startEdit = (key: PendingKey) => {
        setEditingId(key.id);
        setEditForm({ name: key.name, source: key.source || '', description: key.description || '' });
        setEditGeometry({ center: key.center, points: key.points });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = async (key: PendingKey) => {
        if (processingId) return;

        if (!editForm.name.trim()) {
            setToast({ message: 'Вкажіть назву ключа', type: 'error' });
            return;
        }
        if (!editGeometry.center || editGeometry.points.length < 2) {
            setToast({ message: 'Ключ має мати центр і щонайменше 2 населені пункти', type: 'error' });
            return;
        }
        const allPoints = [editGeometry.center, ...editGeometry.points];
        if (allPoints.some(p => !p.code)) {
            setToast({ message: 'Для кожної точки оберіть населений пункт зі списку', type: 'error' });
            return;
        }
        if (new Set(allPoints.map(p => p.code)).size !== allPoints.length) {
            setToast({ message: 'Населені пункти не повинні повторюватись', type: 'error' });
            return;
        }

        setProcessingId(key.id);
        try {
            const updated = {
                name: editForm.name.trim(),
                source: editForm.source.trim() || null,
                description: editForm.description.trim() || null,
                center: editGeometry.center,
                points: editGeometry.points,
            };

            const { error: updateError } = await supabase
                .from('map_keys')
                .update(updated)
                .eq('id', key.id);

            if (updateError) {
                setToast({ message: `❌ Помилка збереження змін: ${updateError.message}`, type: 'error' });
                return;
            }

            setKeys(prev => prev.map(k => (k.id === key.id ? { ...k, ...updated } : k)));
            // Геометрія змінилась — скидаємо обчислені контури цього ключа
            setRingsCache(prev => {
                const next = { ...prev };
                for (const cacheKey of Object.keys(next)) {
                    if (cacheKey.startsWith(`${key.id}:`)) delete next[cacheKey];
                }
                return next;
            });
            setEditingId(null);
            setToast({ message: '✅ Зміни збережено', type: 'success' });
        } finally {
            setProcessingId(null);
        }
    };

    const approveKey = async (key: PendingKey) => {
        if (!user || processingId) return;

        const variant = getVariant(key);
        const rings = ringsFor(key);
        if (!rings) {
            setToast({ message: 'Контур ще обчислюється — зачекайте кілька секунд', type: 'error' });
            return;
        }

        setProcessingId(key.id);

        try {
            const { error: updateError } = await supabase
                .from('map_keys')
                .update({
                    status: 'approved',
                    polygon_variant: variant,
                    polygon: rings,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', key.id);

            if (updateError) {
                setToast({ message: `❌ Помилка при підтвердженні: ${updateError.message}`, type: 'error' });
                return;
            }

            // Сповіщення в системі можливе лише для залогіненого автора
            if (key.created_by) {
                try {
                    await sendNotification({
                        fromUserId: user.id,
                        toUserId: key.created_by,
                        messageType: 'key_approved',
                        messageText: `Ваш ключ "${key.name}" підтверджено і опубліковано на карті.`,
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення автору:', err);
                }
            }

            setToast({ message: '✅ Ключ підтверджено', type: 'success' });
            setKeys(prev => prev.filter(k => k.id !== key.id));
        } finally {
            setProcessingId(null);
        }
    };

    const rejectKey = async (key: PendingKey) => {
        if (!user || processingId) return;

        const reason = window.prompt('Вкажіть причину відхилення (необов\'язково):') ?? '';
        setProcessingId(key.id);

        try {
            const { error: updateError } = await supabase
                .from('map_keys')
                .update({
                    status: 'rejected',
                    reject_reason: reason.trim() || null,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', key.id);

            if (updateError) {
                setToast({ message: `❌ Помилка при відхиленні: ${updateError.message}`, type: 'error' });
                return;
            }

            // Сповіщення в системі можливе лише для залогіненого автора
            if (key.created_by) {
                try {
                    await sendNotification({
                        fromUserId: user.id,
                        toUserId: key.created_by,
                        messageType: 'key_rejected',
                        messageText:
                            `Ваш ключ "${key.name}" відхилено.` +
                            (reason.trim() ? `\n\nПричина: ${reason.trim()}` : ''),
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення автору:', err);
                }
            }

            setToast({ message: '❌ Ключ відхилено', type: 'success' });
            setKeys(prev => prev.filter(k => k.id !== key.id));
        } finally {
            setProcessingId(null);
        }
    };

    const approveEdit = async (edit: ProposedEdit) => {
        if (!user || processingId) return;

        const rings = ringsForEdit(edit);
        if (!rings) {
            setToast({ message: 'Контур ще обчислюється — зачекайте кілька секунд', type: 'error' });
            return;
        }

        setProcessingId(edit.id);
        try {
            const { error: updateError } = await supabase
                .from('map_keys')
                .update({
                    name: edit.name,
                    source: edit.source,
                    description: edit.description,
                    center: edit.center,
                    points: edit.points,
                    polygon_variant: edit.polygon_variant,
                    polygon: rings,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', edit.key_id);

            if (updateError) {
                setToast({ message: `❌ Помилка застосування змін: ${updateError.message}`, type: 'error' });
                return;
            }

            const { error: deleteError } = await supabase.from('map_keys_edit').delete().eq('id', edit.id);
            if (deleteError) console.error('Помилка видалення пропозиції:', deleteError);

            if (edit.created_by) {
                try {
                    await sendNotification({
                        fromUserId: user.id,
                        toUserId: edit.created_by,
                        messageType: 'key_edit_approved',
                        messageText: `Ваші зміни до ключа "${edit.name}" підтверджено і опубліковано на карті.`,
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення автору:', err);
                }
            }

            setToast({ message: '✅ Зміни застосовано до ключа', type: 'success' });
            setEdits(prev => prev.filter(e => e.id !== edit.id));
        } finally {
            setProcessingId(null);
        }
    };

    const rejectEdit = async (edit: ProposedEdit) => {
        if (!user || processingId) return;

        const reason = window.prompt('Вкажіть причину відхилення (необов\'язково):') ?? '';
        setProcessingId(edit.id);

        try {
            const { error: deleteError } = await supabase.from('map_keys_edit').delete().eq('id', edit.id);
            if (deleteError) {
                setToast({ message: `❌ Помилка відхилення: ${deleteError.message}`, type: 'error' });
                return;
            }

            if (edit.created_by) {
                try {
                    await sendNotification({
                        fromUserId: user.id,
                        toUserId: edit.created_by,
                        messageType: 'key_edit_rejected',
                        messageText:
                            `Ваші зміни до ключа "${edit.name}" відхилено.` +
                            (reason.trim() ? `\n\nПричина: ${reason.trim()}` : ''),
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення автору:', err);
                }
            }

            setToast({ message: '❌ Пропозицію відхилено', type: 'success' });
            setEdits(prev => prev.filter(e => e.id !== edit.id));
        } finally {
            setProcessingId(null);
        }
    };

    // Порівняння пропозиції з поточною версією ключа
    const editDiff = (edit: ProposedEdit): string[] => {
        const orig = originals[edit.key_id];
        if (!orig) return [];
        const changes: string[] = [];
        if (orig.name !== edit.name) changes.push(`назва («${orig.name}» → «${edit.name}»)`);
        if ((orig.source || '') !== (edit.source || '')) changes.push('джерело');
        if ((orig.description || '') !== (edit.description || '')) changes.push('опис');
        if ((orig.polygon_variant ?? DEFAULT_POLYGON_VARIANT) !== edit.polygon_variant) changes.push('відображення території');
        const origCodes = [orig.center.code, ...orig.points.map(p => p.code)].sort().join(',');
        const newCodes = [edit.center.code, ...edit.points.map(p => p.code)].sort().join(',');
        if (origCodes !== newCodes) changes.push(`склад (${orig.points.length + 1} → ${edit.points.length + 1} пунктів)`);
        return changes;
    };

    if (loading) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-red-600 dark:text-red-400 text-[16px] text-center">{error}</p>
                </div>
            </>
        );
    }

    if (!isAdmin) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-red-600 dark:text-red-400 text-[16px] text-center">⛔ У вас немає доступу до цієї сторінки</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <div className="flex items-center gap-[10px] mb-[20px] lg:mb-[30px]">
                        <KeyRound className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                        <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                            Ключі для підтвердження
                        </h1>
                    </div>

                    {keys.length === 0 ? (
                        <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] text-center">
                            <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px]">
                                Немає нових ключів для підтвердження
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-[20px]">
                            {keys.map((key) => (
                                <div
                                    key={key.id}
                                    className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]"
                                >
                                    {editingId === key.id ? (
                                    <div className="space-y-[15px]">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                                            <input
                                                type="text"
                                                value={editForm.name}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="Назва ключа"
                                                className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
                                            />
                                            <input
                                                type="text"
                                                value={editForm.source}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, source: e.target.value }))}
                                                placeholder="Джерело інформації"
                                                className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
                                            />
                                        </div>
                                        <textarea
                                            value={editForm.description}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Опис ключа"
                                            rows={3}
                                            className="w-full p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
                                        />

                                        <KeyBuilderMap value={editGeometry} onChange={setEditGeometry} variant={getVariant(key)} />

                                        <div className="flex flex-wrap gap-[10px]">
                                            <button
                                                onClick={() => saveEdit(key)}
                                                disabled={processingId !== null}
                                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Save className="w-4 h-4 text-white" strokeWidth={2} />
                                                <span className="text-white text-[14px] font-medium">Зберегти зміни</span>
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                disabled={processingId !== null}
                                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <X className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={2} />
                                                <span className="text-gray-900 dark:text-white text-[14px] font-medium">Скасувати</span>
                                            </button>
                                        </div>
                                    </div>
                                    ) : (
                                    <div className="flex flex-col lg:flex-row gap-[20px]">
                                        {/* Прев'ю полігона */}
                                        <div className="flex-shrink-0 w-full lg:w-[320px]">
                                            {/* Вибір варіанта контуру території */}
                                            <div className="flex flex-wrap gap-[5px] mb-[8px]">
                                                {VARIANT_ORDER.map((variant) => (
                                                    <button
                                                        key={variant}
                                                        onClick={() => selectVariant(key, variant)}
                                                        className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                                                            getVariant(key) === variant
                                                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                                                : 'bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-[#374151] hover:border-[#2563EB]'
                                                        }`}
                                                    >
                                                        {POLYGON_VARIANT_LABELS[variant]}
                                                    </button>
                                                ))}
                                            </div>
                                            <KeyShapePreview
                                                center={toPair(key.center)}
                                                points={key.points.map(toPair)}
                                                rings={ringsFor(key)}
                                            />
                                            {computingVoronoiId === key.id && (
                                                <p className="mt-[5px] text-gray-600 dark:text-gray-400 text-[12px]">
                                                    Обчислення території за Вороним...
                                                </p>
                                            )}
                                        </div>

                                        {/* Інформація */}
                                        <div className="flex-1 space-y-[10px]">
                                            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                                {key.name}
                                            </h2>

                                            <div className="flex items-start gap-[10px]">
                                                <MapPin className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                <div>
                                                    <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[3px]">
                                                        Склад ключа:
                                                    </div>
                                                    <div className="text-gray-900 dark:text-white text-[14px] break-words">
                                                        Центр: {key.center.type} {key.center.name}
                                                        {key.center.region ? ` (${key.center.region})` : ''}
                                                        <br />
                                                        {key.points.map(p => `${p.type} ${p.name}`).join(', ')}
                                                    </div>
                                                </div>
                                            </div>

                                            {key.source && (
                                                <div className="flex items-start gap-[10px]">
                                                    <BookOpen className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <div>
                                                        <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[3px]">
                                                            Джерело інформації:
                                                        </div>
                                                        <div className="text-gray-900 dark:text-white text-[14px] break-words">
                                                            {key.source}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {key.description && (
                                                <div className="flex items-start gap-[10px]">
                                                    <FileText className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <div>
                                                        <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[3px]">
                                                            Опис:
                                                        </div>
                                                        <div className="text-gray-900 dark:text-white text-[14px] break-words whitespace-pre-wrap">
                                                            {key.description}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-start gap-[10px]">
                                                <User className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                <div>
                                                    <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[3px]">
                                                        Автор:
                                                    </div>
                                                    <div className="text-gray-900 dark:text-white text-[14px] font-mono break-all">
                                                        {key.email}
                                                        {!key.created_by && (
                                                            <span className="ml-2 font-sans text-gray-500 dark:text-gray-400 text-[12px]">(без акаунта)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <p className="text-gray-600 dark:text-gray-400 text-[13px]">
                                                Населених пунктів: {key.points.length} · Додано: {new Date(key.created_at).toLocaleDateString('uk-UA')}
                                            </p>
                                        </div>

                                        {/* Дії */}
                                        <div className="flex lg:flex-col gap-[10px] lg:justify-center">
                                            <button
                                                onClick={() => approveKey(key)}
                                                disabled={processingId !== null}
                                                className="flex-1 lg:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Check className="w-5 h-5 text-white" strokeWidth={2} />
                                                <span className="text-white text-[14px] lg:text-[16px] font-medium">Підтвердити</span>
                                            </button>
                                            <button
                                                onClick={() => startEdit(key)}
                                                disabled={processingId !== null}
                                                className="flex-1 lg:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Pencil className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium">Редагувати</span>
                                            </button>
                                            <button
                                                onClick={() => rejectKey(key)}
                                                disabled={processingId !== null}
                                                className="flex-1 lg:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <X className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium">Відхилити</span>
                                            </button>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Запропоновані зміни до підтверджених ключів */}
                    <div className="flex items-center gap-[10px] mt-[40px] mb-[20px]">
                        <Pencil className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[20px] md:text-[24px] font-bold">
                            Запропоновані зміни ({edits.length})
                        </h2>
                    </div>

                    {edits.length === 0 ? (
                        <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] text-center">
                            <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px]">
                                Немає запропонованих змін
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-[20px]">
                            {edits.map((edit) => (
                                <div
                                    key={edit.id}
                                    className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]"
                                >
                                    <div className="flex flex-col lg:flex-row gap-[20px]">
                                        <div className="flex-shrink-0 w-full lg:w-[320px]">
                                            <p className="mb-[8px] text-gray-600 dark:text-gray-400 text-[12px]">
                                                Нова версія · {POLYGON_VARIANT_LABELS[edit.polygon_variant]}
                                            </p>
                                            <KeyShapePreview
                                                center={toPair(edit.center)}
                                                points={edit.points.map(toPair)}
                                                rings={ringsForEdit(edit)}
                                            />
                                            {computingVoronoiId === edit.id && (
                                                <p className="mt-[5px] text-gray-600 dark:text-gray-400 text-[12px]">
                                                    Обчислення території за Вороним...
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex-1 space-y-[10px]">
                                            <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                                {edit.name}
                                                <a
                                                    href={`/key/${edit.key_id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-3 text-[#2563EB] underline text-[13px] font-normal hover:text-[#1D4ED8]"
                                                >
                                                    поточна версія
                                                </a>
                                            </h3>

                                            {editDiff(edit).length > 0 && (
                                                <p className="text-[13px] text-[#92400E] dark:text-[#EAB308]">
                                                    Змінено: {editDiff(edit).join('; ')}
                                                </p>
                                            )}

                                            {edit.source && (
                                                <div className="flex items-start gap-[10px]">
                                                    <BookOpen className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <div className="text-gray-900 dark:text-white text-[14px] break-words">{edit.source}</div>
                                                </div>
                                            )}

                                            {edit.description && (
                                                <div className="flex items-start gap-[10px]">
                                                    <FileText className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                    <div className="text-gray-900 dark:text-white text-[14px] break-words whitespace-pre-wrap">{edit.description}</div>
                                                </div>
                                            )}

                                            <div className="flex items-start gap-[10px]">
                                                <User className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                                                <div className="text-gray-900 dark:text-white text-[14px] font-mono break-all">
                                                    {edit.email}
                                                    {!edit.created_by && (
                                                        <span className="ml-2 font-sans text-gray-500 dark:text-gray-400 text-[12px]">(без акаунта)</span>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-gray-600 dark:text-gray-400 text-[13px]">
                                                Населених пунктів: {edit.points.length + 1} · Подано: {new Date(edit.created_at).toLocaleDateString('uk-UA')}
                                            </p>
                                        </div>

                                        <div className="flex lg:flex-col gap-[10px] lg:justify-center">
                                            <button
                                                onClick={() => approveEdit(edit)}
                                                disabled={processingId !== null}
                                                className="flex-1 lg:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Check className="w-5 h-5 text-white" strokeWidth={2} />
                                                <span className="text-white text-[14px] lg:text-[16px] font-medium">Застосувати</span>
                                            </button>
                                            <button
                                                onClick={() => rejectEdit(edit)}
                                                disabled={processingId !== null}
                                                className="flex-1 lg:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <X className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium">Відхилити</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}
