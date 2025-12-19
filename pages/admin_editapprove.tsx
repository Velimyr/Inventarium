import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications'

export default function ReviewEditedRecordsPage() {
    const { user, loading: userLoading } = useUser();

    const [isAdmin, setIsAdmin] = useState(false);
    const [recordsEdit, setRecordsEdit] = useState<any[]>([]);
    const [recordsOriginal, setRecordsOriginal] = useState<Record<string, any>>({});
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmFields, setConfirmFields] = useState<Record<string, Record<string, boolean>>>({});

    const fieldLabels: Record<string, string> = {
        old_province: 'Воєводство (Губернія)',
        old_district: 'Повіт (Район)',
        old_community: 'Ключ (Староство)',
        old_settlement_type: 'Тип н.п. (давній)',
        old_settlement_name: 'Назва н.п. (давня)',
        current_region: 'Сучасна область',
        current_district: 'Сучасний район',
        current_community: 'Сучасна громада',
        current_settlement_type: 'Тип н.п. (сучасний)',
        current_settlement_name: 'Назва н.п. (сучасна)',
        latitude: 'Широта',
        longitude: 'Довгота',
        mark_type: 'Тип позначки',
        case_signature: 'Шифр справи',
        archive: 'Архів',
        fonds: 'Фонд',
        series: 'Опис',
        record: 'Справа',
        additional_case_signature: 'Шифр дод. справи',
        case_date: 'Дати справи',
        inventory_year: 'Рік складання інвентаря',
        pages_count: 'К-ть сторінок',
        inventory_start_page: 'Сторінка поч. інвентаря',
        scans_url: 'Посилання на скани',
        case_title: 'Назва справи',
        notes: 'Примітки',
    };

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setLoading(false);
            return;
        }

        const checkAdmin = async () => {
            const { data: adminData, error } = await supabase
                .from('admin_users')
                .select('id')
                .eq('id', user.id)
                .single();

            if (error || !adminData) {
                setIsAdmin(false);
                setLoading(false);
                return;
            }
            setIsAdmin(true);
            setLoading(false);
        };

        checkAdmin();
    }, [user, userLoading]);

    useEffect(() => {
        if (!isAdmin) return;

        async function fetchData() {
            setLoading(true);
            const { data: edits, error: editErr } = await supabase.from('records_edit').select('*');
            if (editErr) {
                setToast({ message: 'Помилка завантаження змін', type: 'error' });
                setLoading(false);
                return;
            }

            // Фільтруємо записи, які мають хоч одне поле, окрім id, не null/undefined
            const filteredEdits = (edits || []).filter((rec) =>
                Object.entries(rec).some(([key, val]) => key !== 'id' && val !== null && val !== undefined && key !== 'email')
            );

            setRecordsEdit(filteredEdits);

            const ids = filteredEdits.map((r) => r.id);
            if (ids.length === 0) {
                setLoading(false);
                return;
            }

            const { data: originals, error: origErr } = await supabase
                .from('records')
                .select('*')
                .in('id', ids);

            if (origErr) {
                setToast({ message: 'Помилка завантаження оригіналів', type: 'error' });
                setLoading(false);
                return;
            }

            const originalsMap: Record<string, any> = {};
            (originals || []).forEach((rec) => {
                originalsMap[rec.id] = rec;
            });
            setRecordsOriginal(originalsMap);

            // Ініціалізуємо стан чекбоксів — всі поля по замовчуванню true
            const initialConfirmFields: Record<string, Record<string, boolean>> = {};
            filteredEdits.forEach((rec) => {
                initialConfirmFields[rec.id] = {};
                Object.entries(rec).forEach(([field, val]) => {
                    if (field === 'id') return;
                    if (val !== undefined) {
                        initialConfirmFields[rec.id][field] = true;
                    }
                });
            });
            setConfirmFields(initialConfirmFields);

            setLoading(false);
        }

        fetchData();
    }, [isAdmin]);

    // приховуємо поля якщо вони не мінялися
    const filteredRecordsEdit = recordsEdit
        .map(edit => {
            const original = recordsOriginal[edit.id] || {};
            const diffFields: Record<string, any> = {};
            Object.keys(edit).forEach((key) => {
                if (key === 'id' || key === 'email') return;
                if (edit[key] !== original[key]) {
                    diffFields[key] = edit[key];
                }
            });
            if (Object.keys(diffFields).length === 0) return null; // якщо нічого не змінилося
            return { ...edit, diffFields };
        })
        .filter(Boolean); // видаляємо null

    const handleCheckboxChange = (recordId: string, field: string) => {
        setConfirmFields((prev) => ({
            ...prev,
            [recordId]: {
                ...prev[recordId],
                [field]: !prev[recordId][field],
            },
        }));
    };

    const goToRecord = (newIndex: number) => {
        if (newIndex >= 0 && newIndex < recordsEdit.length) {
            setIndex(newIndex);
        }
    };

    const saveRecord = async () => {
        const recordEdit = recordsEdit[index];
        if (!recordEdit) return;

        const fieldsToUpdate = confirmFields[recordEdit.id];
        if (!fieldsToUpdate) return;

        const updateData: Record<string, any> = { id: recordEdit.id };
        Object.entries(fieldsToUpdate).forEach(([field, checked]) => {
            if (checked && field !== 'approved' && field !== 'email' && field !== 'is_ukrainian_archive' && field !== 'comment' && field !== 'json_full_data') {
                const value = recordEdit[field];
                updateData[field] = value === '' ? null : value;
            }
        });

        // Якщо нічого не вибрано
        if (Object.keys(updateData).length <= 1) { // тільки id
            setToast({ message: 'ℹ️ Оберіть хоча б одне поле для підтвердження', type: 'error' });
            return;
        }

        try {
            // Оновлюємо record в records (реальний)
            console.log(updateData);
            const { error: updateError } = await supabase
                .from('records')
                .upsert([updateData], { onConflict: 'id' });

            if (updateError) {
                console.error(updateError);
                setToast({ message: '❌ Помилка при оновленні запису', type: 'error' });
                return;
            }

            // Отримуємо user_id редактора за email
            const { data: editorProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', recordEdit.email)
                .single();

            if (profileError || !editorProfile) {
                console.error('Не вдалося знайти профіль редактора:', profileError);
                // Продовжуємо видалення навіть якщо не знайшли профіль
            }

            // Видаляємо цей запис з records_edit
            const { error: deleteError } = await supabase
                .from('records_edit')
                .delete()
                .eq('id', recordEdit.id);

            if (deleteError) {
                console.error(deleteError);
                setToast({ message: '❌ Помилка при видаленні запису змін', type: 'error' });
                return;
            }

            // Відправка повідомлення користувачеві про успішне підтвердження редагування інвентаря
            if (editorProfile) {
                const recordUrl = `${window.location.origin}/record/${recordEdit.id}`;
                const messageText =
                    `Ваше редагування інвентарю успішно підтверджено адміністратором.\n\n` +
                    `[Переглянути інвентар можна тут](${recordUrl})`;
                
                await sendNotification({
                    fromUserId: user.id, // адмін (хто підтверджує)
                    toUserId: editorProfile.user_id, // редактор (кому відправляємо)
                    messageType: 'edit_approve',
                    messageText
                });
            }

            setToast({ message: '✅ Запис успішно підтверджено', type: 'success' });

            // Оновлюємо локальний стан — видаляємо цей запис
            const newRecordsEdit = recordsEdit.filter((r) => r.id !== recordEdit.id);
            setRecordsEdit(newRecordsEdit);
            setIndex((idx) => (idx >= newRecordsEdit.length ? newRecordsEdit.length - 1 : idx));

        } catch (err) {
            console.error(err);
            setToast({ message: '❌ Невідома помилка', type: 'error' });
        }
    };

    const rejectRecord = async () => {
        const recordEdit = recordsEdit[index];
        if (!recordEdit) return;

        if (!window.confirm('Ви впевнені, що хочете відхилити цей запис? Він буде видалений з таблиці змін.')) {
            return;
        }

        const reason = window.prompt('Вкажіть причину відхилення (необов\'язково):');

        try {
            // Отримуємо user_id редактора за email
            const { data: editorProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', recordEdit.email)
                .single();

            if (profileError || !editorProfile) {
                console.error('Не вдалося знайти профіль редактора:', profileError);
                // Продовжуємо видалення навіть якщо не знайшли профіль
            }

            const { error: deleteError } = await supabase
                .from('records_edit')
                .delete()
                .eq('id', recordEdit.id);

            if (deleteError) {
                console.error(deleteError);
                setToast({ message: '❌ Помилка при видаленні запису змін', type: 'error' });
                return;
            }

            // Відправка повідомлення користувачеві про відхилення редагування
            if (editorProfile) {
                let messageText = 'Ваше редагування інвентарю відхилено адміністратором.';

                if (reason && reason.trim().length > 0) {
                    messageText += `\n\nПричина:\n${reason.trim()}`;
                }

                await sendNotification({
                    fromUserId: user.id, // адмін (хто відхиляє)
                    toUserId: editorProfile.user_id, // редактор (кому відправляємо)
                    messageType: 'edit_reject',
                    messageText
                });
            }

            setToast({ message: '❌ Запис змін відхилено і видалено', type: 'success' });

            // Оновлюємо локальний стан — видаляємо цей запис
            const newRecordsEdit = recordsEdit.filter((r) => r.id !== recordEdit.id);
            setRecordsEdit(newRecordsEdit);
            setIndex((idx) => (idx >= newRecordsEdit.length ? newRecordsEdit.length - 1 : idx));
        } catch (err) {
            console.error(err);
            setToast({ message: '❌ Невідома помилка', type: 'error' });
        }
    };

    if (userLoading || loading) {
        return (
            <>
                <Header />
                <main className="min-h-screen flex justify-center items-center p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                    <p>Завантаження...</p>
                </main>
            </>
        );
    }

    if (!user) {
        return (
            <>
                <Header />
                <main className="min-h-screen flex justify-center items-center p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                    <p>⛔ Ви не авторизовані</p>
                </main>
            </>
        );
    }

    if (!isAdmin) {
        return (
            <>
                <Header />
                <main className="min-h-screen flex justify-center items-center p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                    <p>⛔ У вас немає доступу до цієї сторінки</p>
                </main>
            </>
        );
    }

    if (recordsEdit.length === 0) {
        return (
            <>
                <Header />
                <main className="min-h-screen flex justify-center items-center p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                    <p>Немає змін для перевірки</p>
                </main>
            </>
        );
    }

    const recordEdit = recordsEdit[index];
    const recordOriginal = recordsOriginal[recordEdit.id] || {};

    const editFields = Object.entries(recordEdit)
        .filter(([key, value]) => {
            if (['id', 'approved', 'email', 'created_by', 'created_at', 'comment', 'json_full_data', 'is_ukrainian_archive'].includes(key)) return false;
            return value !== recordOriginal[key];
        });

    const originalFields = editFields
        .map(([field]) => [field, recordOriginal[field]])
        .filter(([key]) => key !== 'email');



    return (
        <>
            <Header />
            <main className="min-h-screen p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6">
                    {/* Ліва таблиця - Оригінал */}
                    <section className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 rounded shadow overflow-auto max-h-[80vh]">
                        <h2 className="text-xl font-semibold mb-4">Оригінальний запис</h2>
                        <table className="w-full border-collapse border border-gray-300 dark:border-gray-700">
                            <thead>
                                <tr className="bg-gray-200 dark:bg-gray-700">
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-left">Поле</th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-left">Значення</th>
                                </tr>
                            </thead>
                            <tbody>
                                {originalFields.map(([field, val]) => (
                                    <tr key={field} className="border border-gray-300 dark:border-gray-700">
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-1 font-medium">{fieldLabels[field] || field}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-1">{val ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <a
                            href={`/record/${recordEdit.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline mb-4 inline-block"
                        >
                            🔗 Відкрити запис у новому вікні
                        </a>
                    </section>

                    {/* Права таблиця - Зміни */}
                    <section className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 rounded shadow overflow-auto max-h-[80vh]">
                        <h2 className="text-xl font-semibold mb-4">Запис із змінами</h2>
                        <table className="w-full border-collapse border border-gray-300 dark:border-gray-700">
                            <thead>
                                <tr className="bg-gray-200 dark:bg-gray-700">
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-left">Поле</th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-left">Значення</th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-center">Підтвердити</th>
                                </tr>
                            </thead>
                            <tbody>
                                {editFields.map(([field, val]) => (
                                    <tr key={field} className="border border-gray-300 dark:border-gray-700">
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-1 font-medium">{fieldLabels[field] || field}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-1">{val?.toString() ?? '—'}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-center">
                                            <input
                                                type="checkbox"
                                                checked={confirmFields[recordEdit.id]?.[field] ?? true}
                                                onChange={() => handleCheckboxChange(recordEdit.id, field)}
                                                aria-label={`Підтвердити поле ${field}`}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">Email редактора:</span>{' '}
                            {recordEdit?.email ? (
                                <a
                                    href={`mailto:${recordEdit.email}`}
                                    className="text-blue-600 dark:text-blue-400 underline"
                                >
                                    {recordEdit.email}
                                </a>
                            ) : (
                                <span className="text-gray-500">—</span>
                            )}
                        </div>
                    </section>
                </div>

                {/* Коментар редактора інвентарю */}
                <div className="max-w-7xl mx-auto mt-6 bg-gray-50 dark:bg-gray-800 p-4 rounded shadow">
                    <h3 className="text-lg font-semibold mb-2">Коментар редактора інвентарю</h3>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {recordEdit?.comment ? recordEdit.comment : '—'}
                    </p>
                </div>

                {/* Навігація */}
                <div className="flex flex-col sm:flex-row sm:justify-between max-w-7xl mx-auto mt-6 gap-2 sm:gap-4">
                    {/* Кнопки навігації */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            onClick={() => goToRecord(index - 1)}
                            disabled={index === 0}
                            className="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ⬅ Попередній
                        </button>
                        <button
                            type="button"
                            onClick={() => goToRecord(index + 1)}
                            disabled={index === recordsEdit.length - 1}
                            className="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Наступний ➡
                        </button>
                    </div>

                    {/* Кнопки підтвердження/відхилення */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                        <button
                            type="button"
                            onClick={saveRecord}
                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            ✅ Підтвердити
                        </button>
                        <button
                            type="button"
                            onClick={rejectRecord}
                            className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            ❌ Відхилити
                        </button>
                    </div>
                </div>


                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </main>
        </>
    );
}