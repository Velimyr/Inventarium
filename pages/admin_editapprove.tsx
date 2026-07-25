import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications';
import { FileText, Check, X, ChevronLeft, ChevronRight, ExternalLink, Mail } from 'lucide-react';
import { isAdminUser } from '../lib/adminUsers';
import {
    SIGNATURE_FIELDS,
    buildCaseSignature,
    formatSignatureList,
    fromSignatureList,
    hasAllArchiveParts,
    isSignatureField,
    resolveIsUkrainianArchive,
    sameSignatureList,
    validateCaseSignature,
    validateSignatureFormats,
} from '../lib/caseSignature';

const ADDITIONAL_SIGNATURE_FIELD = 'additional_case_signature';

// Значення поля в таблиці. Дод. сигнатури — масив, і його треба зібрати в рядок:
// React вивів би елементи масиву впритул один до одного.
const displayValue = (field: string, value: any) => {
    if (field === ADDITIONAL_SIGNATURE_FIELD) return formatSignatureList(value) || '—';
    return value === null || value === undefined || value === '' ? '—' : String(value);
};

// Чи змінилося поле. Для масиву `!==` завжди істинний — порівнюємо вміст,
// інакше дод. сигнатура потрапляла б у список змін у кожному записі.
const fieldChanged = (field: string, edited: any, original: any) => {
    if (field === ADDITIONAL_SIGNATURE_FIELD) return !sameSignatureList(edited, original);
    return edited !== original;
};

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
        is_ukrainian_archive: 'Справа в українському архіві',
        case_signature: 'Шифр справи',
        archive: 'Архів',
        fonds: 'Фонд',
        series: 'Опис',
        record: 'Справа',
        additional_case_signature: 'Шифри дод. справ',
        case_date: 'Дати справи',
        inventory_year: 'Рік складання інвентаря',
        pages_count: 'К-ть сторінок',
        inventory_start_page: 'Сторінка поч. інвентаря',
        scans_url: 'Посилання на скани',
        case_title: 'Назва справи',
        notes: 'Примітки',
    };

    // Fields excluded from display and updates
    const EXCLUDED_FIELDS = ['id', 'approved', 'email', 'created_by', 'created_at', 'comment', 'json_full_data', 'cobook_link'];

    // Поля шифру підтверджуються одним чекбоксом: підтвердити, скажімо, фонд
    // окремо від case_signature означає лишити запис із шифром від однієї
    // справи і координатами від іншої.
    const SIGNATURE_BLOCK_KEY = '__signature_block';

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setLoading(false);
            return;
        }

        const checkAdmin = async () => {
            const hasAdminAccess = await isAdminUser(supabase, user.id);

            if (!hasAdminAccess) {
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
                initialConfirmFields[rec.id] = { [SIGNATURE_BLOCK_KEY]: true };
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

        const recordOriginal = recordsOriginal[recordEdit.id] || {};
        const value = (field: string) => {
            if (field === ADDITIONAL_SIGNATURE_FIELD) return fromSignatureList(recordEdit[field]);
            return recordEdit[field] === '' ? null : recordEdit[field];
        };

        const updateData: Record<string, any> = { id: recordEdit.id };
        Object.entries(fieldsToUpdate).forEach(([field, checked]) => {
            // поля шифру обробляємо нижче, одним блоком
            if (field === SIGNATURE_BLOCK_KEY || isSignatureField(field)) return;
            if (checked && !EXCLUDED_FIELDS.includes(field)) {
                updateData[field] = value(field);
            }
        });

        // Блок шифру: або всі п'ять полів разом, або жодного
        const signatureChanged = SIGNATURE_FIELDS.some((field) => recordEdit[field] !== recordOriginal[field]);
        if (signatureChanged && fieldsToUpdate[SIGNATURE_BLOCK_KEY]) {
            for (const field of SIGNATURE_FIELDS) updateData[field] = value(field);
            updateData.is_ukrainian_archive = resolveIsUkrainianArchive(recordEdit);

            // Шифр збираємо зі складових, а не довіряємо тому, що прийшло у формі
            if (updateData.is_ukrainian_archive === 'Так' && hasAllArchiveParts(updateData)) {
                updateData.case_signature = buildCaseSignature(updateData);
            }

            const signatureError = validateCaseSignature(updateData);
            if (signatureError) {
                setToast({ message: `❌ ${signatureError}`, type: 'error' });
                return;
            }
        }

        if (Object.keys(updateData).length <= 1) {
            setToast({ message: 'ℹ️ Оберіть хоча б одне поле для підтвердження', type: 'error' });
            return;
        }

        // Формат шифру/додаткових сигнатур серед підтверджених полів. Блок шифру
        // вже пройшов validateCaseSignature вище; тут ловимо випадок, коли
        // змінилась лише additional_case_signature (вона не в SIGNATURE_FIELDS).
        const formatError = validateSignatureFormats(updateData);
        if (formatError) {
            setToast({ message: `❌ ${formatError}`, type: 'error' });
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
            if (EXCLUDED_FIELDS.includes(key)) return false;
            return fieldChanged(key, value, recordOriginal[key]);
        });

    // Поля шифру виносимо в окремий блок з одним чекбоксом і показуємо всі п'ять,
    // навіть незмінені — вони застосуються разом
    const otherEditFields = editFields.filter(([key]) => !isSignatureField(key));
    const signatureChanged = SIGNATURE_FIELDS.some((field) => recordEdit[field] !== recordOriginal[field]);
    const signatureBlockFields: string[] = signatureChanged ? [...SIGNATURE_FIELDS] : [];

    const originalFields = [...otherEditFields.map(([field]) => field), ...signatureBlockFields]
        .filter((key) => key !== 'email')
        .map((field) => [field, recordOriginal[field]]);

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
                                                    {displayValue(field as string, val)}
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
                                        {otherEditFields.map(([field, val]) => (
                                            <tr key={field} className="border-b border-gray-200 dark:border-[#374151]">
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-medium">
                                                    {fieldLabels[field] || field}
                                                </td>
                                                <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                                                    {displayValue(field as string, val)}
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

                                        {signatureBlockFields.length > 0 && (
                                            <>
                                                <tr className="bg-gray-100 dark:bg-[#111827]">
                                                    <td
                                                        colSpan={3}
                                                        className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-semibold"
                                                    >
                                                        Шифр справи — підтверджується цілком
                                                    </td>
                                                </tr>
                                                {signatureBlockFields.map((field, i) => (
                                                    <tr key={field} className="border-b border-gray-200 dark:border-[#374151]">
                                                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-medium">
                                                            {fieldLabels[field] || field}
                                                            {recordEdit[field] !== recordOriginal[field] && (
                                                                <span className="ml-[6px] text-[#2563EB]">●</span>
                                                            )}
                                                        </td>
                                                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                                                            {recordEdit[field]?.toString() || '—'}
                                                        </td>
                                                        {i === 0 && (
                                                            <td
                                                                rowSpan={signatureBlockFields.length}
                                                                className="border border-gray-300 dark:border-[#374151] p-[10px] text-center align-middle"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={confirmFields[recordEdit.id]?.[SIGNATURE_BLOCK_KEY] ?? true}
                                                                    onChange={() => handleCheckboxChange(recordEdit.id, SIGNATURE_BLOCK_KEY)}
                                                                    className="w-4 h-4 rounded border-gray-300 dark:border-[#374151] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                                                                    aria-label="Підтвердити шифр справи цілком"
                                                                />
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </>
                                        )}
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
