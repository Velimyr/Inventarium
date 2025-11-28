import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import Toast from '../../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../../contexts/UserContext';
import isEqual from 'lodash.isequal';

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

    useEffect(() => {
        if (!id || userLoading) return;

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
            setLoading(false);
        };

        fetchRecord();
    }, [id, userLoading, user]);

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

        /*
        const updatedFields: any = {};

         for (const key in formData) {
            if (key === 'email') continue;

            const original = normalize(originalData[key]);
            const current = normalize(formData[key]);

            if (original === "" && current === "") {
                continue; // обидва пусті → пропускаємо
            }

            if (original === current) {
                continue; // однакові → пропускаємо
            }

            // якщо користувач стер значення → зберігаємо як ""
            updatedFields[key] = current;
        } 

        // Якщо змінили archive / fonds / series / record — додаємо case_signature (з форми)
        const importantFields = ['archive', 'fonds', 'series', 'record'];
        const changedImportantField = importantFields.some((field) => field in updatedFields);
        if (changedImportantField) {
            updatedFields['case_signature'] = formData['case_signature'];
        }
        */

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


        //console.log(updatedFields)
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
            <main className="p-6 min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">✏️ Редагування запису</h1>

                    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                    {loading ? (
                        <p>Завантаження...</p>
                    ) : !record ? (
                        <p className="text-red-600">⛔ Запис не знайдено</p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Внесіть зміни до запису про інвентар</p>
                            <EditableInventoryForm data={formData} onChange={setFormData} onSubmit={saveRecord} />
                            <div className="mt-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Опишіть детально чому ви вважаєте що саме такі зміни потрібно внести в інвентар
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                                    rows={4}
                                    required
                                />
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={saveRecord}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    💾 Зберегти зміни
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </>
    );
}
