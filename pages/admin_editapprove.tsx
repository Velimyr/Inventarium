import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import AdminSectionTabs, { EDIT_SECTION_TITLE, EDIT_TABS, withCount } from '../components/AdminSectionTabs';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications';
import { FileText, Check, X, ChevronLeft, ChevronRight, ExternalLink, Mail, RotateCcw } from 'lucide-react';
import { isAdminUser } from '../lib/adminUsers';
import DuplicateWarnings from '../components/DuplicateWarnings';
import InventoryTypeWarning from '../components/InventoryTypeWarning';
import SignatureListInput from '../components/SignatureListInput';
import { SIGNATURE_FIELDS, isSignatureField } from '../lib/caseSignature';
import { INVENTORY_TYPES } from '../lib/inventoryType';
import {
    ADDITIONAL_SIGNATURE_FIELD,
    SIGNATURE_BLOCK_KEY,
    UKRAINIAN_ARCHIVE_FIELD,
    buildEditUpdate,
    computeChanges,
    displayValue,
    fieldChanged,
    fieldLabel,
    signatureBlockChanged,
} from '../lib/editApprove';

// Поля, які не влазять в один рядок: показуємо їх textarea.
const LONG_TEXT_FIELDS = ['case_title', 'notes', 'scans_url'];

const inputClass =
    'w-full px-[8px] py-[6px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px] outline-none focus:border-[#2563EB] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Поле «Стало» — редаговане: адмін може виправити значення автора, а не лише
 * прийняти чи відхилити його. Тип віджета підбираємо за полем, щоб адмін не
 * вводив руками те, що всюди інде обирається зі списку.
 */
function ValueEditor({
    field,
    value,
    disabled,
    onChange,
}: {
    field: string;
    value: any;
    disabled?: boolean;
    onChange: (next: any) => void;
}) {
    if (field === ADDITIONAL_SIGNATURE_FIELD) {
        return (
            <SignatureListInput
                value={value}
                onChange={onChange}
                placeholder="Шифр додаткової справи"
                addLabel="Додати шифр"
            />
        );
    }

    if (field === UKRAINIAN_ARCHIVE_FIELD) {
        return (
            <select className={inputClass} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                <option value="Так">Так</option>
                <option value="Ні">Ні</option>
            </select>
        );
    }

    if (field === 'inventory_type') {
        return (
            <select className={inputClass} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                <option value="">—</option>
                {INVENTORY_TYPES.map((type) => (
                    <option key={type} value={type}>
                        {type}
                    </option>
                ))}
            </select>
        );
    }

    if (field === 'mark_type') {
        return (
            <select className={inputClass} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                <option value="1">Місце</option>
                <option value="0">Регіон</option>
            </select>
        );
    }

    if (LONG_TEXT_FIELDS.includes(field)) {
        return (
            <textarea
                className={`${inputClass} resize-y`}
                rows={3}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }

    return (
        <input
            type="text"
            className={inputClass}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

/**
 * Рядок порівняння: поле, чинне значення, редаговане нове й галочка.
 *
 * «Було» і «Стало» стоять поруч у одному рядку — раніше це були дві окремі
 * таблиці в двох окремих скролах, і зіставляти значення доводилось на око.
 */
function ComparisonRow({
    field,
    label,
    oldValue,
    proposedValue,
    currentValue,
    readOnly,
    onChange,
    onReset,
    checkbox,
    checkboxRowSpan = 1,
}: {
    field: string;
    label: string;
    oldValue: any;
    proposedValue: any;
    currentValue: any;
    readOnly?: boolean;
    onChange: (next: any) => void;
    onReset: () => void;
    checkbox: React.ReactNode;
    checkboxRowSpan?: number;
}) {
    const proposesChange = fieldChanged(field, proposedValue, oldValue);
    const corrected = fieldChanged(field, currentValue, proposedValue);
    // Позначку «нічого не змінює» має сенс писати лише там, де автор щось
    // пропонував: у блоці шифру решта полів показана просто для контексту.
    const neutral = proposesChange && !fieldChanged(field, currentValue, oldValue);

    return (
        <tr className="border-b border-gray-200 dark:border-[#374151] align-top">
            <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-medium">
                {label}
                {proposesChange && (
                    <span className="ml-[6px] text-[#2563EB]" title="Автор змінив це поле">
                        ●
                    </span>
                )}
            </td>
            <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-700 dark:text-gray-300 text-[13px] break-words">
                {displayValue(field, oldValue)}
            </td>
            <td className="border border-gray-300 dark:border-[#374151] p-[10px]">
                <ValueEditor field={field} value={currentValue} disabled={readOnly} onChange={onChange} />

                {corrected && (
                    <div className="flex flex-wrap items-center gap-[6px] mt-[6px]">
                        <span className="text-gray-500 dark:text-gray-400 text-[12px] break-words">
                            Автор пропонував: {displayValue(field, proposedValue)}
                        </span>
                        <button
                            type="button"
                            onClick={onReset}
                            title="Повернути значення автора"
                            className="inline-flex items-center gap-[4px] px-[6px] h-[22px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#111827] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                        >
                            <RotateCcw className="w-3 h-3 text-gray-700 dark:text-[#F3F4F6]" strokeWidth={1.6} />
                            <span className="text-gray-700 dark:text-[#F3F4F6] text-[11px]">повернути</span>
                        </button>
                    </div>
                )}

                {neutral && (
                    <p className="text-gray-500 dark:text-gray-400 text-[12px] mt-[6px]">
                        Збігається з чинним значенням — запис не зміниться.
                    </p>
                )}
            </td>
            {checkboxRowSpan > 0 && (
                <td
                    rowSpan={checkboxRowSpan}
                    className="border border-gray-300 dark:border-[#374151] p-[10px] text-center align-middle"
                >
                    {checkbox}
                </td>
            )}
        </tr>
    );
}

export default function ReviewEditedRecordsPage() {
    const { user, loading: userLoading } = useUser();

    const [isAdmin, setIsAdmin] = useState(false);
    const [recordsEdit, setRecordsEdit] = useState<any[]>([]);
    const [recordsOriginal, setRecordsOriginal] = useState<Record<string, any>>({});
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmFields, setConfirmFields] = useState<Record<string, Record<string, boolean>>>({});
    // Виправлення адміна поверх пропозиції автора: { [id редагування]: { [поле]: значення } }
    const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({});

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

            // Підтверджуємо лише те, що адмін бачить у таблиці змін.
            //
            // Раніше сюди потрапляли ВСІ колонки редагування, і підтвердження
            // трьох видимих правок мовчки переписувало ще два десятки полів
            // значеннями, якими вони були на момент подання пропозиції — тобто
            // відкочувало все, що встигло змінитись у записі відтоді.
            const initialConfirmFields: Record<string, Record<string, boolean>> = {};
            filteredEdits.forEach((rec) => {
                const fields: Record<string, boolean> = { [SIGNATURE_BLOCK_KEY]: true };
                for (const change of computeChanges(rec, originalsMap[rec.id] || {})) {
                    fields[change.field] = true;
                }
                initialConfirmFields[rec.id] = fields;
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

    /** Пропозиція автора з накладеними виправленнями адміна. */
    const withDrafts = (rec: any) => ({ ...rec, ...(drafts[rec.id] || {}) });

    const setDraftValue = (recordId: string, field: string, next: any) => {
        setDrafts((prev) => ({ ...prev, [recordId]: { ...prev[recordId], [field]: next } }));
    };

    /** Повернути полю те значення, яке запропонував автор. */
    const resetDraftField = (recordId: string, field: string) => {
        setDrafts((prev) => {
            const { [field]: _dropped, ...rest } = prev[recordId] || {};
            return { ...prev, [recordId]: rest };
        });
    };

    /** Поля, які адмін виправив відносно пропозиції автора. */
    const correctedFields = (rec: any) =>
        Object.keys(drafts[rec.id] || {}).filter((field) =>
            fieldChanged(field, drafts[rec.id][field], rec[field])
        );

    const saveRecord = async () => {
        const recordEdit = recordsEdit[index];
        if (!recordEdit) return;

        const fieldsToUpdate = confirmFields[recordEdit.id];
        if (!fieldsToUpdate) return;

        const recordOriginal = recordsOriginal[recordEdit.id] || {};
        const corrected = correctedFields(recordEdit);

        const { updateData, error: buildError } = buildEditUpdate(
            withDrafts(recordEdit),
            recordOriginal,
            (field) => !!fieldsToUpdate[field]
        );

        if (buildError || !updateData) {
            setToast({ message: `❌ ${buildError}`, type: 'error' });
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
                // Автор має знати, що в базу лягло не рівно те, що він подав
                const correctionNote =
                    corrected.length > 0
                        ? `\n\nАдміністратор уточнив значення: ${corrected.map(fieldLabel).join(', ')}.`
                        : '';
                const messageText =
                    `Ваше редагування інвентарю успішно підтверджено адміністратором.` +
                    `${correctionNote}\n\n` +
                    `[Переглянути інвентар можна тут](${recordUrl})`;

                await sendNotification({
                    fromUserId: user.id,
                    toUserId: editorProfile.user_id,
                    messageType: 'edit_approve',
                    messageText
                });
            }

            setToast({
                message:
                    corrected.length > 0
                        ? `✅ Запис підтверджено з виправленнями (${corrected.length})`
                        : '✅ Запис успішно підтверджено',
                type: 'success',
            });

            const newRecordsEdit = recordsEdit.filter((r) => r.id !== recordEdit.id);
            setRecordsEdit(newRecordsEdit);
            setIndex((idx) => (idx >= newRecordsEdit.length ? newRecordsEdit.length - 1 : idx));
            setDrafts((prev) => {
                const { [recordEdit.id]: _done, ...rest } = prev;
                return rest;
            });

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
            setDrafts((prev) => {
                const { [recordEdit.id]: _dropped, ...rest } = prev;
                return rest;
            });
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
                <div className="min-h-screen bg-white dark:bg-[#111827]">
                    <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                        <AdminSectionTabs
                            title={EDIT_SECTION_TITLE}
                            tabs={withCount(EDIT_TABS, '/admin_editapprove', 0)}
                            activeHref="/admin_editapprove"
                        />
                        <p className="text-gray-700 dark:text-gray-300 text-[16px]">Немає змін для перевірки</p>
                    </div>
                </div>
            </>
        );
    }

    const recordEdit = recordsEdit[index];
    const recordOriginal = recordsOriginal[recordEdit.id] || {};
    // Поточний стан пропозиції: те, що подав автор, плюс виправлення адміна
    const effectiveEdit = withDrafts(recordEdit);
    const adminCorrected = correctedFields(recordEdit);

    // Набір рядків рахуємо від ПРОПОЗИЦІЇ, а не від поточного стану: інакше
    // рядок зникав би просто тому, що адмін довів значення до оригінального —
    // і повернути його вже не було б звідки.
    const proposedChanges = computeChanges(recordEdit, recordOriginal);

    // Поля шифру виносимо в окремий блок з одним чекбоксом і показуємо всі п'ять,
    // навіть незмінені — вони застосуються разом
    const otherChanges = proposedChanges.filter((change) => !isSignatureField(change.field));
    const signatureBlockFields: string[] = signatureBlockChanged(recordEdit, recordOriginal)
        ? [...SIGNATURE_FIELDS]
        : [];

    // Шифр українського архіву збирається зі складових (див. buildEditUpdate),
    // тож правити його руками немає сенсу — поле лишається лише для читання.
    const signatureAutoBuilt = effectiveEdit[UKRAINIAN_ARCHIVE_FIELD] === 'Так';

    // Кандидат для перевірок збігів — підсумковий стан запису після редагування.
    // json_full_data містить повний стан форми; інакше накладаємо на оригінал
    // лише НЕпорожні змінені поля (null у records_edit — це незмінене поле,
    // ним не можна затирати значення оригіналу).
    // Виправлення адміна лягають згори, щоб попередження про збіги й тип
    // документа стосувалися того, що він справді збирається зберегти.
    const editCandidate = {
        ...(recordEdit.json_full_data
            ? { ...recordEdit.json_full_data, id: recordEdit.id }
            : (() => {
                const merged: any = { ...recordOriginal };
                for (const [k, v] of Object.entries(recordEdit)) {
                    if (v !== null && v !== undefined) merged[k] = v;
                }
                return merged;
            })()),
        ...(drafts[recordEdit.id] || {}),
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <AdminSectionTabs
                        title={EDIT_SECTION_TITLE}
                        tabs={withCount(EDIT_TABS, '/admin_editapprove', recordsEdit.length)}
                        activeHref="/admin_editapprove"
                    />

                    <DuplicateWarnings record={editCandidate} />

                    <div className="mb-[20px]">
                        <InventoryTypeWarning record={editCandidate} />
                    </div>

                    {/* Порівняння змін */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
                        <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[15px]">
                            <div className="flex items-center gap-[10px]">
                                <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                    Порівняння змін
                                </h2>
                                {adminCorrected.length > 0 && (
                                    <span className="px-[8px] py-[2px] rounded-full bg-[#2563EB]/10 text-[#2563EB] text-[12px] font-medium">
                                        виправлено адміном: {adminCorrected.length}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-[15px]">
                                <div className="flex items-center gap-[8px] text-[14px]">
                                    <Mail className="w-4 h-4 text-gray-700 dark:text-white" strokeWidth={2} />
                                    <span className="text-gray-700 dark:text-white font-semibold">Автор:</span>
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
                                <a
                                    href={`/record/${recordEdit.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-[8px] text-[#2563EB] hover:text-[#1D4ED8] text-[14px] underline"
                                >
                                    <ExternalLink className="w-4 h-4" strokeWidth={2} />
                                    Чинний запис
                                </a>
                            </div>
                        </div>

                        <p className="text-gray-700 dark:text-white text-[13px] opacity-80 mb-[15px]">
                            Колонку «Стало» можна виправити — у запис піде саме те, що зараз у полі.
                            Знімайте галочку з рядків, які підтверджувати не треба.
                        </p>

                        {otherChanges.length === 0 && signatureBlockFields.length === 0 ? (
                            <p className="text-gray-700 dark:text-gray-300 text-[14px]">
                                Це редагування нічого не змінює у чинному записі.
                            </p>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                <table className="w-full border-collapse border border-gray-300 dark:border-[#374151]">
                                    <thead className="sticky top-0">
                                        <tr className="bg-gray-100 dark:bg-[#111827]">
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold w-[18%]">
                                                Поле
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold w-[32%]">
                                                Було
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[14px] font-semibold">
                                                Стало
                                            </th>
                                            <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-center text-gray-900 dark:text-white text-[14px] font-semibold w-[110px]">
                                                Підтвердити
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {otherChanges.map((change) => (
                                            <ComparisonRow
                                                key={change.field}
                                                field={change.field}
                                                label={change.label}
                                                oldValue={change.oldValue}
                                                proposedValue={change.newValue}
                                                currentValue={effectiveEdit[change.field]}
                                                onChange={(next) => setDraftValue(recordEdit.id, change.field, next)}
                                                onReset={() => resetDraftField(recordEdit.id, change.field)}
                                                checkbox={
                                                    <input
                                                        type="checkbox"
                                                        checked={confirmFields[recordEdit.id]?.[change.field] ?? true}
                                                        onChange={() => handleCheckboxChange(recordEdit.id, change.field)}
                                                        className="w-4 h-4 rounded border-gray-300 dark:border-[#374151] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                                                        aria-label={`Підтвердити поле ${change.field}`}
                                                    />
                                                }
                                            />
                                        ))}

                                        {signatureBlockFields.length > 0 && (
                                            <>
                                                <tr className="bg-gray-100 dark:bg-[#111827]">
                                                    <td
                                                        colSpan={4}
                                                        className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] font-semibold"
                                                    >
                                                        Шифр справи — підтверджується цілком
                                                        {signatureAutoBuilt && (
                                                            <span className="ml-[8px] font-normal opacity-80">
                                                                (шифр збирається з архіву, фонду, опису й справи)
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {signatureBlockFields.map((field, i) => (
                                                    <ComparisonRow
                                                        key={field}
                                                        field={field}
                                                        label={fieldLabel(field)}
                                                        oldValue={recordOriginal[field]}
                                                        proposedValue={recordEdit[field]}
                                                        currentValue={effectiveEdit[field]}
                                                        readOnly={signatureAutoBuilt && field === 'case_signature'}
                                                        onChange={(next) => setDraftValue(recordEdit.id, field, next)}
                                                        onReset={() => resetDraftField(recordEdit.id, field)}
                                                        checkbox={
                                                            i === 0 ? (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={confirmFields[recordEdit.id]?.[SIGNATURE_BLOCK_KEY] ?? true}
                                                                    onChange={() => handleCheckboxChange(recordEdit.id, SIGNATURE_BLOCK_KEY)}
                                                                    className="w-4 h-4 rounded border-gray-300 dark:border-[#374151] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                                                                    aria-label="Підтвердити шифр справи цілком"
                                                                />
                                                            ) : null
                                                        }
                                                        checkboxRowSpan={i === 0 ? signatureBlockFields.length : 0}
                                                    />
                                                ))}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

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
