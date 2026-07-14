import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../../../components/header';
import Toast from '../../../components/Toast';
import { Send } from 'lucide-react';
import { useUser } from '../../../contexts/UserContext';
import { supabase } from '../../../lib/supabaseClient';
import { getAdminUserIds } from '../../../lib/adminUsers';
import { sendNotification } from '../../../components/notifications';
import { DEFAULT_POLYGON_VARIANT, POLYGON_VARIANT_LABELS } from '../../../components/keys/geometry';
import type { KeyGeometry, KeyPoint, PolygonVariant } from '../../../components/keys/geometry';

const KeyBuilderMap = dynamic(() => import('../../../components/keys/KeyBuilderMap'), { ssr: false });

interface OriginalKey {
    id: string;
    name: string;
    source: string | null;
    description: string | null;
    center: KeyPoint;
    points: KeyPoint[];
    polygon_variant: PolygonVariant | null;
}

export default function EditKeyPage() {
    const router = useRouter();
    const { id } = router.query;
    const { user, loading: userLoading } = useUser();

    const [original, setOriginal] = useState<OriginalKey | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [formData, setFormData] = useState({ name: '', source: '', description: '', email: '' });
    const [geometry, setGeometry] = useState<KeyGeometry>({ center: null, points: [] });
    const [variant, setVariant] = useState<PolygonVariant>(DEFAULT_POLYGON_VARIANT);

    // Поточна версія ключа як стартовий стан форми
    useEffect(() => {
        if (!router.isReady || typeof id !== 'string') return;

        let cancelled = false;
        supabase
            .from('map_keys')
            .select('id, name, source, description, center, points, polygon_variant')
            .eq('id', id)
            .eq('status', 'approved')
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) console.error('Помилка завантаження ключа:', error);
                if (data) {
                    const key = data as OriginalKey;
                    setOriginal(key);
                    setFormData(prev => ({
                        ...prev,
                        name: key.name,
                        source: key.source || '',
                        description: key.description || '',
                    }));
                    setGeometry({ center: key.center, points: key.points });
                    setVariant(key.polygon_variant ?? DEFAULT_POLYGON_VARIANT);
                } else {
                    setNotFound(true);
                }
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [router.isReady, id]);

    // Email автора пропозиції: для залогіненого підтягується автоматично
    useEffect(() => {
        if (!userLoading && user?.email) {
            setFormData(prev => (prev.email ? prev : { ...prev, email: user.email }));
        }
    }, [user, userLoading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validate = (): string | null => {
        if (!formData.name.trim()) return 'Вкажіть назву ключа';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) return 'Вкажіть коректний email';
        if (!geometry.center) return 'Поставте центральну точку ключа на карті';
        if (geometry.points.length < 2) return 'Додайте щонайменше 2 населені пункти ключа';

        const allPoints = [geometry.center, ...geometry.points];
        if (allPoints.some(p => !p.code)) {
            return 'Для кожної точки ключа оберіть населений пункт з випадаючого списку';
        }
        if (new Set(allPoints.map(p => p.code)).size !== allPoints.length) {
            return 'Населені пункти ключа не повинні повторюватись';
        }
        return null;
    };

    const handleSubmit = async () => {
        if (!original || submitting) return;

        const validationError = validate();
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            const { error: insertError } = await supabase.from('map_keys_edit').insert({
                key_id: original.id,
                name: formData.name.trim(),
                source: formData.source.trim() || null,
                description: formData.description.trim() || null,
                center: geometry.center,
                points: geometry.points,
                polygon_variant: variant,
                email: formData.email.trim(),
                created_by: user?.id ?? null,
            });

            if (insertError) {
                console.error('Помилка збереження пропозиції:', insertError);
                setToast({ message: 'Помилка збереження пропозиції: ' + insertError.message, type: 'error' });
                return;
            }

            const adminIds = await getAdminUserIds(supabase);
            const messageText =
                `Запропоновано зміни до ключа "${original.name}".\n\n` +
                `Нова назва: ${formData.name.trim()}\n` +
                `Населених пунктів: ${geometry.points.length + 1}\n` +
                `Email автора пропозиції: ${formData.email.trim()}`;

            for (const adminId of adminIds) {
                try {
                    await sendNotification({
                        fromUserId: user?.id || 'system',
                        toUserId: adminId,
                        messageType: 'key_edit_new',
                        messageText,
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення адміну:', err);
                }
            }

            setSubmitted(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Head>
                <title>{original ? `Зміни до «${original.name}» — Інвентаріум` : 'Редагування ключа — Інвентаріум'}</title>
            </Head>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {loading ? (
                        <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                    ) : notFound || !original ? (
                        <div className="text-center py-[60px]">
                            <p className="text-gray-900 dark:text-white text-[18px] mb-[10px]">Ключ не знайдено</p>
                            <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                                <Link href="/map" className="text-[#2563EB] underline hover:text-[#1D4ED8]">
                                    Повернутися до карти
                                </Link>
                            </p>
                        </div>
                    ) : submitted ? (
                        <div className="text-center py-[60px]">
                            <p className="text-gray-900 dark:text-white text-[18px] mb-[10px]">
                                Пропозицію змін відправлено на перевірку
                            </p>
                            <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                                Після підтвердження адміністратором оновлений ключ з&apos;явиться на карті.{' '}
                                <Link href={`/key/${original.id}`} className="text-[#2563EB] underline hover:text-[#1D4ED8]">
                                    Повернутися до ключа
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                                Запропонувати зміни: {original.name}
                            </h1>

                            <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                                Відредагуйте дані або склад ключа — зміни з&apos;являться на карті після перевірки
                                адміністратором. Поточна версія ключа залишиться видимою до підтвердження.
                            </p>

                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    Дані ключа
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
                                    <FormInput name="name" value={formData.name} onChange={handleChange} placeholder="Назва ключа (обов'язково)" />
                                    <FormInput name="source" value={formData.source} onChange={handleChange} placeholder="Джерело інформації" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
                                    <div>
                                        <FormInput name="email" value={formData.email} onChange={handleChange} placeholder="Email для зв'язку (обов'язково)" />
                                        {user?.email && (
                                            <p className="mt-[5px] text-gray-600 dark:text-gray-400 text-[12px]">
                                                Підтягнуто з вашого акаунта
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <FormTextarea name="description" value={formData.description} onChange={handleChange} placeholder="Опис ключа" />
                            </section>

                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    Ключ на карті
                                </h2>

                                <div className="flex flex-wrap items-center gap-[8px] mb-[15px]">
                                    <span className="text-gray-700 dark:text-gray-300 text-[13px] lg:text-[14px]">
                                        Відображення території:
                                    </span>
                                    {(Object.keys(POLYGON_VARIANT_LABELS) as PolygonVariant[]).map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setVariant(v)}
                                            className={`px-3 py-1.5 text-[12px] lg:text-[13px] rounded border transition-colors ${
                                                variant === v
                                                    ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                                    : 'bg-white dark:bg-[#1F2937] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-[#374151] hover:border-[#2563EB]'
                                            }`}
                                        >
                                            {POLYGON_VARIANT_LABELS[v]}
                                        </button>
                                    ))}
                                </div>

                                <KeyBuilderMap value={geometry} onChange={setGeometry} variant={variant} />
                            </section>

                            <div className="flex flex-wrap items-center gap-[15px]">
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4 text-white" strokeWidth={1.6} />
                                    <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                        {submitting ? 'Відправлення...' : 'Відправити зміни на перевірку'}
                                    </span>
                                </button>
                                <Link
                                    href={`/key/${original.id}`}
                                    className="text-gray-700 dark:text-gray-300 underline text-[14px] hover:text-gray-900 dark:hover:text-white"
                                >
                                    Скасувати
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} duration={4000} />}
        </>
    );
}

// Form Components
function FormInput({
    name,
    value,
    onChange,
    placeholder
}: {
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
}) {
    return (
        <input
            type="text"
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
        />
    );
}

function FormTextarea({
    name,
    value,
    onChange,
    placeholder
}: {
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder: string;
}) {
    return (
        <textarea
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={3}
            className="w-full p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
        />
    );
}
