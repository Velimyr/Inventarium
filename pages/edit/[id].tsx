import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import Toast from '../../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../../contexts/UserContext';
import { Save, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { sendNotification } from '../../components/notifications';
import { getAdminUserIds } from '../../lib/adminUsers';
import {
    fromSignatureList,
    resolveIsUkrainianArchive,
    sameSignatureList,
    toSignatureList,
    validateCaseSignature,
} from '../../lib/caseSignature';
import DuplicateWarnings from '../../components/DuplicateWarnings';

const EditableInventoryForm = dynamic(() => import('../../components/EditableInventoryForm'), {
    ssr: false,
});

// Поля рівня СПРАВИ — вони однакові для всіх записів з тим самим шифром. Якщо
// користувач змінює якесь із них, пропонуємо застосувати зміну й до інших
// населених пунктів тієї самої справи.
const SHARED_CASE_FIELDS = [
    'case_signature',
    'archive',
    'fonds',
    'series',
    'record',
    'case_title',
    'case_date',
    'pages_count',
    'scans_url',
    'additional_case_signature',
];

const normCmp = (v: any) => (v === null || v === undefined ? '' : String(v).trim());

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
    // Поп-ап пропозиції поширити зміни на інші н.п. тієї самої справи
    const [siblingPrompt, setSiblingPrompt] = useState<{ siblings: any[]; propagate: string[]; skipped: number } | null>(null);
    const [saving, setSaving] = useState(false);

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
            // Беремо збережене значення; для старих записів, де колонки ще не було,
            // виводимо його з даних (див. resolveIsUkrainianArchive)
            const isUkrainianArchive = resolveIsUkrainianArchive(rest);

            const baseData = {
                ...rest,
                is_ukrainian_archive: isUkrainianArchive,
                // Записи, збережені до міграції поля в text[], лишилися рядком
                additional_case_signature: toSignatureList(rest.additional_case_signature),
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

        // Шифр і його складові мають описувати одну справу
        const signatureError = validateCaseSignature(formData);
        if (signatureError) {
            setToast({ message: `❌ ${signatureError}`, type: 'error' });
            return;
        }

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
        // Які поля рівня справи змінились?
        const changed = SHARED_CASE_FIELDS.filter((f) =>
            f === 'additional_case_signature'
                ? !sameSignatureList(formData[f], originalData[f])
                : normCmp(formData[f]) !== normCmp(originalData[f])
        );

        // Якщо змінились — шукаємо інші н.п. з тим самим шифром і питаємо в поп-апі
        if (changed.length > 0 && normCmp(originalData.case_signature) !== '') {
            const propagate = [...changed];

            const { data: siblings, error: sibErr } = await supabase
                .from('records')
                .select('*')
                .eq('approved', true)
                .eq('case_signature', originalData.case_signature)
                .neq('id', id);

            if (sibErr) {
                console.error(sibErr);
            } else if (siblings && siblings.length > 0) {
                // Сусідів, у яких уже є неопрацьована пропозиція редагування, не чіпаємо
                const { data: pending } = await supabase
                    .from('records_edit')
                    .select('id')
                    .in('id', siblings.map((s) => s.id));
                const pendingIds = new Set((pending || []).map((p) => p.id));
                const available = siblings.filter((s) => !pendingIds.has(s.id));

                if (available.length > 0) {
                    setSiblingPrompt({
                        siblings: available,
                        propagate,
                        skipped: siblings.length - available.length,
                    });
                    return; // чекаємо на вибір у поп-апі
                }
            }
        }

        await commitEdits([], []);
    };

    // Створює пропозиції редагування: цей запис + (за вибором) інші н.п. тієї
    // самої справи, у які підставляються ті самі зміни рівня справи.
    const commitEdits = async (siblings: any[], propagate: string[]) => {
        if (!id) return;
        setSaving(true);

        // form-стан → рядок для records_edit (як у одиночному збереженні)
        const toEditRow = (formLike: any, rowId: string) => {
            const s: any = {};
            for (const key in formLike) {
                let value = formLike[key];
                if (key === 'additional_case_signature') value = fromSignatureList(value);
                else if (value === '') value = null;
                s[key] = value;
            }
            return { ...s, id: rowId, json_full_data: formLike };
        };

        try {
            const emailToSave = formData.email;
            const commentText = comment.trim();

            const rows: any[] = [toEditRow(formData, id as string)];

            for (const sib of siblings) {
                // Повний стан сусіда + наші зміни рівня справи згори
                const sibForm: any = {
                    ...sib,
                    is_ukrainian_archive: resolveIsUkrainianArchive(sib),
                    additional_case_signature: toSignatureList(sib.additional_case_signature),
                    email: emailToSave,
                    comment: commentText,
                };
                for (const f of propagate) sibForm[f] = formData[f];
                rows.push(toEditRow(sibForm, sib.id));
            }

            // Поточний запис — оновлюємо (це власна пропозиція користувача)
            const { error: curErr } = await supabase
                .from('records_edit')
                .upsert([rows[0]], { onConflict: 'id' });
            if (curErr) throw curErr;

            // Сусіди — лише СТВОРЮЄМО нові; наявні пропозиції не перезаписуємо
            // (ignoreDuplicates → ON CONFLICT DO NOTHING) — захист і від гонки
            const sibRows = rows.slice(1);
            if (sibRows.length > 0) {
                const { error: sibErr } = await supabase
                    .from('records_edit')
                    .upsert(sibRows, { onConflict: 'id', ignoreDuplicates: true });
                if (sibErr) throw sibErr;
            }

            const adminIds = await getAdminUserIds(supabase);
            if (adminIds.length > 0) {
                const extra = siblings.length > 0 ? ` та ще ${siblings.length} записів тієї самої справи` : '';
                const messageText =
                    `Інвентар відредаговано ${id}${extra}, очікує на перевірку.\n\n` +
                    `Email автора редагування: ${emailToSave}`;
                for (const adminId of adminIds) {
                    try {
                        await sendNotification({
                            fromUserId: user?.id || 'system',
                            toUserId: adminId,
                            messageType: 'new_edit',
                            messageText,
                        });
                    } catch (err) {
                        console.error('Помилка відправки повідомлення адміну:', err);
                    }
                }
            }

            setToast({
                message:
                    siblings.length > 0
                        ? `✅ Створено ${rows.length} пропозицій редагування (цей запис і ще ${siblings.length}). Їх перевірить адміністратор.`
                        : '✅ Зміни збережено, вони будуть перевірені і підтверджені адміністратором',
                type: 'success',
            });
        } catch (err) {
            console.error(err);
            setToast({ message: '❌ Помилка при збереженні', type: 'error' });
        } finally {
            setSaving(false);
            setSiblingPrompt(null);
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

                    {siblingPrompt && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                            onClick={() => !saving && setSiblingPrompt(null)}
                        >
                            <div
                                className="w-full max-w-[600px] max-h-[85vh] overflow-auto rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] p-[24px]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 className="text-gray-900 dark:text-white text-[18px] lg:text-[20px] font-semibold mb-[10px]">
                                    Застосувати зміни до інших населених пунктів?
                                </h2>
                                <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[15px] mb-[8px]">
                                    Ви змінили дані справи (шифр{' '}
                                    <span className="font-mono">{originalData.case_signature}</span>).
                                </p>
                                <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[15px] mb-[14px]">
                                    Ця справа є ще в <b>{siblingPrompt.siblings.length}</b> населених пунктах.
                                    Створити для кожного пропозицію редагування з тими самими змінами?
                                </p>

                                {siblingPrompt.skipped > 0 && (
                                    <p className="text-gray-500 dark:text-gray-400 text-[13px] mb-[10px]">
                                        Ще {siblingPrompt.skipped} запис(ів) уже мають неопрацьовану пропозицію
                                        редагування — їх пропущено.
                                    </p>
                                )}

                                <div className="max-h-[240px] overflow-auto rounded border border-gray-200 dark:border-[#374151] mb-[18px]">
                                    <ul className="divide-y divide-gray-200 dark:divide-[#374151]">
                                        {siblingPrompt.siblings.map((s) => (
                                            <li key={s.id}>
                                                <a
                                                    href={`/record/${s.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center justify-between gap-[10px] px-[12px] py-[8px] text-[13px] text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                                                >
                                                    <span>
                                                        {[
                                                            s.current_region,
                                                            s.current_district,
                                                            s.current_community,
                                                            [s.current_settlement_type, s.current_settlement_name]
                                                                .filter(Boolean)
                                                                .join(' '),
                                                        ]
                                                            .filter(Boolean)
                                                            .join(', ')}
                                                        {s.inventory_year ? ` · ${s.inventory_year}` : ''}
                                                    </span>
                                                    <ExternalLink
                                                        className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0"
                                                        strokeWidth={2}
                                                    />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="flex flex-wrap gap-[10px] justify-end">
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => commitEdits([], [])}
                                        className="px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#111827] hover:bg-gray-200 dark:hover:bg-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium disabled:opacity-60 transition-colors"
                                    >
                                        Ні, лише цей запис
                                    </button>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => commitEdits(siblingPrompt.siblings, siblingPrompt.propagate)}
                                        className="px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-medium disabled:opacity-60 transition-colors"
                                    >
                                        {saving ? 'Збереження...' : `Так, для всіх (${siblingPrompt.siblings.length})`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

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

                            <DuplicateWarnings record={formData} />

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
