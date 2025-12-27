import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import Toast from '../../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../../contexts/UserContext';
import { Save } from 'lucide-react';
import Link from 'next/link';

const EditableInventoryForm = dynamic(() => import('../../components/EditableInventoryForm'), {
    ssr: false,
});

// Простий валідатор email
function isValidEmail(email: string | undefined | null) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function EditSingleRecordPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const { id } = router.query;

    const [record, setRecord] = useState<any>(null);
    const [originalData, setOriginalData] = useState<any>({});
    const [formData, setFormData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [comment, setComment] = useState<string>("");

    // Зберігаємо останній завантажений ID, щоб не перезавантажувати при перемиканні вкладок
    const [lastLoadedId, setLastLoadedId] = useState<string | null>(null);

    useEffect(() => {
        if (!id || userLoading) return;

        // Перезавантажуємо дані ТІЛЬКИ якщо змінився ID
        if (id === lastLoadedId) return;

        // Скидаємо весь стан при зміні id
        setLoading(true);
        setRecord(null);
        setFormData({});
        setOriginalData({});
        setComment("");
        setToast(null);

        const fetchRecord = async () => {
            const { data, error } = await supabase.from('records').select('*').eq('id', id).single();
            if (error || !data) {
                console.error(error);
                setToast({ message: '❌ Запис не знайдено', type: 'error' });
                setLoading(false);
                return;
            }

            setRecord(data);

            // НЕ підтягувати email зі старого запису:
            const { email: _emailFromRecord, ...rest } = data;

            // ** Рядок "Так" або "Ні" для селекту **
            const isUkrainianArchive = rest.archive && rest.fonds && rest.series && rest.record ? "Так" : "Ні";

            const baseData = {
                ...rest,
                is_ukrainian_archive: isUkrainianArchive,
            };

            // Якщо користувач залогінений і має валідний email — підставити його у форму (це НЕ з DB запису)
            const initialForm = { ...baseData };
            if (isValidEmail(user?.email)) {
                initialForm.email = user!.email!.trim();
            }

            setFormData(initialForm);
            setOriginalData(initialForm);
            setLastLoadedId(id as string);
            setLoading(false);
        };

        fetchRecord();
    }, [id, userLoading, user, lastLoadedId]);

    const saveRecord = async () => {
        if (!id || !formData) return;

        const normalize = (val: any) => {
            if (val === null || val === undefined) return "";
            return String(val).trim();
        };

        if (!comment.trim()) {
            setToast({ message: '❌ Потрібно заповнити поле з поясненням змін', type: 'error' });
            return;
        }

        // --- Email ---
        const emailFromForm = typeof formData.email === 'string' ? formData.email.trim() : null;
        const emailFromUser = typeof user?.email === 'string' ? user.email.trim() : null;
        const emailToSave = emailFromForm || emailFromUser || null;

        if (!isValidEmail(emailToSave)) {
            setToast({ message: '❌ Потрібен валідний email (введіть коректну адресу)', type: 'error' });
            return;
        }

        formData['email'] = emailToSave;
        formData['comment'] = comment.trim();

        // Перевірка унікальності — тільки якщо змінились ключові поля
        const keyFields = [
            'current_region',
            'current_district',
            'current_community',
            'current_settlement_type',
            'current_settlement_name',
            'case_signature',
            'inventory_year',
        ];

        const matchQuery: any = {};
        for (const field of keyFields) {
            let value = formData[field];
            if (value === "") value = null;
            if (value !== null && value !== undefined) {
                matchQuery[field] = value;
            }
        }
        if (Object.keys(matchQuery).length > 0) {
            const { data: duplicate, error: dupError } = await supabase
                .from('records')
                .select('id')
                .match(matchQuery)
                .neq('id', id)
                .maybeSingle();

            if (dupError) {
                console.error(dupError);
                setToast({ message: '❌ Помилка при перевірці унікальності', type: 'error' });
                return;
            }

            if (duplicate) {
                setToast({
                    message: '❗ Такий запис уже існує в реєстрі Інвентаріум',
                    type: 'error',
                });
                return;
            }
        }
        // Виконуємо upsert у таблицю records_edit
        const sanitizedFormData: any = {};
        for (const key in formData) {
            let value = formData[key];
            if (value === "") value = null; // заміна порожніх рядків на null
            sanitizedFormData[key] = value;
        }
        try {
            const { error } = await supabase
                .from('records_edit')
                .upsert(
                    {
                        id,
                        ...sanitizedFormData,          // тільки змінені поля
                        json_full_data: formData,            // повний стан форми у json
                    },
                    { onConflict: "id" }
                );

            if (error) throw error;

            setToast({ message: '✅ Зміни збережено, вони будуть перевірені і підтверджені адміністратором', type: 'success' });
        } catch (err) {
            console.error(err);
            setToast({ message: '❌ Помилка при збереженні', type: 'error' });
        }
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                        ✏️ Редагування запису
                    </h1>
                    
                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                        Внесіть зміни до запису про інвентар
                    </p>

                    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                    {loading ? (
                        <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                            <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px]">Завантаження...</p>
                        </div>
                    ) : !record ? (
                        <div className="p-[20px] rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                            <p className="text-red-600 dark:text-red-400 text-[14px]">⛔ Запис не знайдено</p>
                        </div>
                    ) : (
                        <>
                            <EditableInventoryForm 
                                key={id as string}
                                data={formData} 
                                onChange={setFormData} 
                                onSubmit={saveRecord} 
                            />

                            {/* Comment Section */}
                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    Пояснення змін
                                </h2>

                                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
                                    Опишіть детально чому ви вважаєте що саме такі зміни потрібно внести в інвентар
                                </p>

                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Наприклад: Виправлення помилки в назві населеного пункту, оновлення шифру справи..."
                                    rows={4}
                                    required
                                    className="w-full p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
                                />
                            </section>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-[15px]">
                                <button 
                                    onClick={saveRecord}
                                    className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                                >
                                    <Save className="w-4 h-4 text-white" strokeWidth={1.6} />
                                    <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                        Зберегти зміни
                                    </span>
                                </button>
                                <Link href={`/record/${id}`}>
                                    <button className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors">
                                        <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                                            Скасувати редагування
                                        </span>
                                    </button>
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}