import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications';
import { FileText, Check, X, ChevronLeft, ChevronRight, ExternalLink, Mail } from 'lucide-react';

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

        if (Object.keys(updateData).length <= 1) {
            setToast({ message: 'ℹ️ Оберіть хоча б одне поле для підтвердження', type: 'error' });
            return;
        }

        try {
            const { error: updateError } = await supabase
                .from('records')
                .upsert([updateData], { onConflict: 'id' });

            if (updateError) {
                console.error(updateError);
                setToast({ message: '❌ Помилка при оновленні запису', type: 'error' });
                return;
            }

            const { data: editorProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', recordEdit.email)
                .single();

            if (profileError || !editorProfile) {
                console.error('Не вдалося знайти профіль редактора:', profileError);
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

            if (editorProfile) {
                const recordUrl = `${window.location.origin}/record/${recordEdit.id}`;
                const messageText =
                    `Ваше редагування інвентарю успішно підтверджено адміністратором.\n\n` +
                    `[Переглянути інвентар можна тут](${recordUrl})`;

                await sendNotification({
                    fromUserId: user.id,
                    toUserId: editorProfile.user_id,
                    messageType: 'edit_approve',
                    messageText
                });
            }

            setToast({ message: '✅ Запис успішно підтверджено', type: 'success' });

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
            const { data: editorProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', recordEdit.email)
                .single();

            if (profileError || !editorProfile) {
                console.error('Не вдалося знайти профіль редактора:', profileError);
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

            if (editorProfile) {
                let messageText = 'Ваше редагування інвентарю відхилено адміністратором.';

                if (reason && reason.trim().length > 0) {
                    messageText += `\n\nПричина:\n${reason.trim()}`;
                }

                await sendNotification({
                    fromUserId: user.id,
                    toUserId: editorProfile.user_id,
                    messageType: 'edit_reject',
                    messageText
                });
            }

            setToast({ message: '❌ Запис змін відхилено і видалено', type: 'success' });

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
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                </div>
            </>
        );
    }

    if (!user) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">⛔ Ви не авторизовані</p>
                </div>
            </>
        );
    }

    if (!isAdmin) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">⛔ У вас немає доступу до цієї сторінки</p>
                </div>
            </>
        );
    }

    if (recordsEdit.length === 0) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">Немає змін для перевірки</p>
                </div>
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
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
                        Перегляд редагованих записів
                    </h1>

                    {/* Two Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px] mb-[20px]">
                        {/* Left Column - Original */}
                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] max-h-[70vh] overflow-auto">
                            <div className="flex items-center gap-[10px] mb-[15px]">
                                <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                    Оригінальний запис
                                </h2>
                            </div>

                            <div className="overflow-x-auto mb-[15px]">
                                <table className="w-full border-collapse border border-gray-300 dark:border-[#374151]">
                                    <thead>
                                        <tr className="bg-gray-100 dark:bg-[#111827]">
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Поле
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Значення
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {originalFields.map(([field, val]) => (
                                            <tr key={field} className="border-b border-gray-200 dark:border-[#374151]">
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-medium">
                                                    {fieldLabels[field] || field}
                                                </td>
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                                                    {val ?? '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <a
                                href={`/record/${recordEdit.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-[8px] text-[#2563EB] hover:text-[#1D4ED8] text-[14px] underline"
                            >
                                <ExternalLink className="w-4 h-4" strokeWidth={2} />
                                Відкрити запис у новому вікні
                            </a>
                        </section>

                        {/* Right Column - Changes */}
                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] max-h-[70vh] overflow-auto">
                            <div className="flex items-center gap-[10px] mb-[15px]">
                                <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                    Запис із змінами
                                </h2>
                            </div>

                            <div className="overflow-x-auto mb-[15px]">
                                <table className="w-full border-collapse border border-gray-300 dark:border-[#374151]">
                                    <thead>
                                        <tr className="bg-gray-100 dark:bg-[#111827]">
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Поле
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Значення
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-center text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Підтвердити
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editFields.map(([field, val]) => (
                                            <tr key={field} className="border-b border-gray-200 dark:border-[#374151]">
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-medium">
                                                    {fieldLabels[field] || field}
                                                </td>
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                                                    {val?.toString() ?? '—'}
                                                </td>
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={confirmFields[recordEdit.id]?.[field] ?? true}
                                                        onChange={() => handleCheckboxChange(recordEdit.id, field)}
                                                        className="w-4 h-4 rounded border-gray-300 dark:border-[#374151] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                                                        aria-label={`Підтвердити поле ${field}`}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center gap-[8px] text-[14px]">
                                <Mail className="w-4 h-4 text-gray-700 dark:text-white" strokeWidth={2} />
                                <span className="text-gray-700 dark:text-white font-semibold">Email редактора:</span>
                                {recordEdit?.email ? (
                                    <a
                                        href={`mailto:${recordEdit.email}`}
                                        className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                                    >
                                        {recordEdit.email}
                                    </a>
                                ) : (
                                    <span className="text-gray-500">—</span>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Comment Section */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
                        <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold mb-[10px]">
                            Коментар редактора інвентарю
                        </h3>
                        <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] whitespace-pre-wrap">
                            {recordEdit?.comment ? recordEdit.comment : '—'}
                        </p>
                    </section>

                    {/* Navigation and Actions */}
                    <div className="flex flex-col lg:flex-row gap-[15px] lg:items-center lg:justify-between">
                        {/* Navigation Buttons */}
                        <div className="flex gap-[10px]">
                            <button
                                type="button"
                                onClick={() => goToRecord(index - 1)}
                                disabled={index === 0}
                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">Попередній</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => goToRecord(index + 1)}
                                disabled={index === recordsEdit.length - 1}
                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">Наступний</span>
                                <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                            </button>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-[10px]">
                            <button
                                type="button"
                                onClick={saveRecord}
                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                            >
                                <Check className="w-5 h-5 text-white" strokeWidth={2} />
                                <span className="text-white text-[14px] lg:text-[16px] font-medium">Підтвердити</span>
                            </button>
                            <button
                                type="button"
                                onClick={rejectRecord}
                                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded bg-red-600 hover:bg-red-700 transition-colors"
                            >
                                <X className="w-5 h-5 text-white" strokeWidth={2} />
                                <span className="text-white text-[14px] lg:text-[16px] font-medium">Відхилити</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </>
    );
}