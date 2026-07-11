import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/header';
import Toast from '../components/Toast';
import { Send } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';
import { getAdminUserIds } from '../lib/adminUsers';
import { sendNotification } from '../components/notifications';
import { DEFAULT_POLYGON_VARIANT, POLYGON_VARIANT_LABELS } from '../components/keys/geometry';
import type { KeyGeometry, PolygonVariant } from '../components/keys/geometry';

const KeyBuilderMap = dynamic(() => import('../components/keys/KeyBuilderMap'), { ssr: false });

const EMPTY_GEOMETRY: KeyGeometry = { center: null, points: [] };

export default function AddKeyPage() {
    const { user, loading: userLoading } = useUser();
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        source: '',
        description: '',
        email: '',
    });
    const [geometry, setGeometry] = useState<KeyGeometry>(EMPTY_GEOMETRY);
    const [variant, setVariant] = useState<PolygonVariant>(DEFAULT_POLYGON_VARIANT);

    // Для залогіненого користувача email підтягується автоматично
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
        if (geometry.points.length < 3) return 'Додайте щонайменше 3 населені пункти ключа';

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
        if (submitting) return;

        const validationError = validate();
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            const { error: insertError } = await supabase.from('map_keys').insert({
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
                console.error('Помилка збереження ключа:', insertError);
                setToast({ message: 'Помилка збереження ключа: ' + insertError.message, type: 'error' });
                return;
            }

            // Сповіщення адмінам про новий ключ на модерацію
            const adminIds = await getAdminUserIds(supabase);
            const messageText =
                `Новий ключ "${formData.name.trim()}" очікує на перевірку.\n\n` +
                `Центр: ${geometry.center!.type} ${geometry.center!.name}\n` +
                `Населених пунктів: ${geometry.points.length}\n` +
                `Email автора: ${formData.email.trim()}`;

            for (const adminId of adminIds) {
                try {
                    await sendNotification({
                        fromUserId: user?.id || 'system',
                        toUserId: adminId,
                        messageType: 'key_new',
                        messageText,
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення адміну:', err);
                }
            }

            setToast({ message: 'Ключ відправлено на перевірку адміністратору.', type: 'success' });
            setFormData(prev => ({ name: '', source: '', description: '', email: user?.email || prev.email }));
            setGeometry(EMPTY_GEOMETRY);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                        Додати ключ
                    </h1>

                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[10px]">
                        Ключ — адміністративно-територіальна одиниця в Речі Посполитій, економічно обʼєднана група маєтків.
                    </p>

                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                        Щоб додати ключ: спочатку поставте на карті центральну точку, яка була центром ключа,
                        далі додайте населені пункти ключа — вони автоматично з'єднаються в полігон,
                        заповніть додаткову інформацію про ключ. Відправте на перевірку внесені дані.
                        Після перевірки адміністратором ключ з'явиться на карті.
                    </p>

                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                            Дані ключа
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
                            <FormInput
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Назва ключа (обов'язково)"
                            />
                            <FormInput
                                name="source"
                                value={formData.source}
                                onChange={handleChange}
                                placeholder="Джерело інформації"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
                            <div>
                                <FormInput
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Email для зв'язку (обов'язково)"
                                />
                                {user?.email && (
                                    <p className="mt-[5px] text-gray-600 dark:text-gray-400 text-[12px]">
                                        Підтягнуто з вашого акаунта
                                    </p>
                                )}
                            </div>
                        </div>

                        <FormTextarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Опис ключа"
                        />
                    </section>

                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                            Ключ на карті
                        </h2>

                        {/* Вибір способу відображення території ключа */}
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
                                {submitting ? 'Відправлення...' : 'Відправити на перевірку'}
                            </span>
                        </button>
                    </div>
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
