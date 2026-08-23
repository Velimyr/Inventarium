import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useUser } from '../contexts/UserContext';
import { Save, ChevronLeft, ChevronRight, Pencil, ExternalLink, ArrowRight } from 'lucide-react';
import { validateCaseSignature } from '../lib/caseSignature';
import { computeChanges, displayValue } from '../lib/editApprove';
import {
    buildEditRow,
    fetchMyEdits,
    findRecordDuplicate,
    settlementLabel,
    toEditForm,
    type MyEdit,
} from '../lib/recordEdits';
import DuplicateWarnings from '../components/DuplicateWarnings';

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
    ssr: false,
});

// Той самий валідатор, що й на сторінці створення пропозиції (/edit/[id])
function isValidEmail(email: string | undefined | null) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * «Мої редагування» — власні пропозиції змін до чинних записів, які ще не
 * опрацював адміністратор. Дзеркало /edit_drafts (там — свої ще не підтверджені
 * НОВІ інвентарі), тільки чергою тут є records_edit, і поруч із формою видно,
 * що саме пропозиція змінює у записі.
 */
export default function MyEditsPage() {
    const { user, loading: userLoading } = useUser();

    const [items, setItems] = useState<MyEdit[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<any>({});
    const [comment, setComment] = useState('');

    const current = items[index];

    // Перелік змін рахуємо від поточного стану форми, а не від збереженого
    // рядка: так автор одразу бачить, що піде адміну після збереження.
    const changes = useMemo(
        () => (current ? computeChanges(formData, current.original) : []),
        [formData, current]
    );

    const openItem = (list: MyEdit[], newIndex: number) => {
        const item = list[newIndex];
        setIndex(newIndex);
        setFormData(item ? toEditForm(item.edit) : {});
        setComment(item?.edit?.comment || '');
    };

    const goToItem = (newIndex: number) => {
        if (newIndex >= 0 && newIndex < items.length) openItem(items, newIndex);
    };

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setLoading(false);
            return;
        }

        const load = async () => {
            try {
                const data = await fetchMyEdits(supabase, user.email);
                setItems(data);
                openItem(data, 0);
            } catch (error) {
                console.error(error);
                setToast({ message: '❌ Помилка завантаження редагувань', type: 'error' });
            } finally {
                setLoading(false);
            }
        };

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, userLoading]);

    const saveEdit = async () => {
        if (!current || saving) return;

        if (!comment.trim()) {
            setToast({ message: '❌ Потрібно заповнити поле з поясненням змін', type: 'error' });
            return;
        }

        const emailFromForm = typeof formData.email === 'string' ? formData.email.trim() : null;
        const emailFromUser = typeof user?.email === 'string' ? user.email.trim() : null;
        const emailToSave = emailFromForm || emailFromUser || null;

        if (!isValidEmail(emailToSave)) {
            setToast({ message: '❌ Потрібен валідний email (введіть коректну адресу)', type: 'error' });
            return;
        }

        const payload = { ...formData, email: emailToSave, comment: comment.trim() };

        // Шифр і його складові мають описувати одну справу
        const signatureError = validateCaseSignature(payload);
        if (signatureError) {
            setToast({ message: `❌ ${signatureError}`, type: 'error' });
            return;
        }

        if (changes.length === 0) {
            setToast({ message: '❗ Пропозиція нічого не змінює у записі', type: 'error' });
            return;
        }

        setSaving(true);

        try {
            const { duplicate, error: dupError } = await findRecordDuplicate(supabase, payload, current.id);
            if (dupError) throw dupError;

            if (duplicate) {
                setToast({ message: '❗ Такий запис уже існує в реєстрі Інвентаріум', type: 'error' });
                return;
            }

            // Саме update, а не upsert: якщо адмін уже опрацював пропозицію,
            // рядка в черзі немає — і відтворювати його не можна.
            const { data: updated, error } = await supabase
                .from('records_edit')
                .update(buildEditRow(payload, current.id))
                .eq('id', current.id)
                .select('id');

            if (error) throw error;

            if (!updated || updated.length === 0) {
                setToast({
                    message: '❗ Цю пропозицію вже опрацював адміністратор — змін не збережено',
                    type: 'error',
                });
                const rest = items.filter((item) => item.id !== current.id);
                setItems(rest);
                openItem(rest, Math.min(index, rest.length - 1));
                return;
            }

            // Перечитуємо чергу: після збереження треба показати новий діапазон
            // змін, а рядок міг зникнути з неї, якщо змінили email автора.
            const reloaded = await fetchMyEdits(supabase, emailToSave);
            setItems(reloaded);

            const sameIndex = reloaded.findIndex((item) => item.id === current.id);
            openItem(reloaded, sameIndex === -1 ? Math.min(index, reloaded.length - 1) : sameIndex);

            setToast(
                sameIndex === -1
                    ? {
                          message:
                              '✅ Збережено. Пропозиція більше не показується тут: у ній вказано інший email автора',
                          type: 'success',
                      }
                    : { message: '✅ Зміни збережено, їх перевірить адміністратор', type: 'success' }
            );
        } catch (error) {
            console.error(error);
            setToast({ message: '❌ Помилка при збереженні', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (userLoading || loading) {
        return (
            <>
                <Header />
                <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px]">Завантаження...</p>
                </main>
            </>
        );
    }

    if (!user) {
        return (
            <>
                <Header />
                <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-red-600 dark:text-red-400 text-[16px]">⛔ Лише для авторизованих користувачів</p>
                </main>
            </>
        );
    }

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <div className="flex items-center gap-[10px] mb-[10px]">
                        <Pencil className="w-6 h-6 lg:w-7 lg:h-7 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                        <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                            Мої редагування
                        </h1>
                    </div>

                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[20px] lg:mb-[29px]">
                        Запропоновані вами зміни до інвентарів, які ще не підтвердив адміністратор. Доки цього не
                        сталося, їх можна виправити.
                    </p>

                    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                    {items.length === 0 || !current ? (
                        <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] text-center">
                                У вас немає редагувань, що очікують підтвердження
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Navigation Buttons */}
                            <div className="flex flex-wrap items-center gap-[10px] lg:gap-[15px] mb-[20px]">
                                <button
                                    onClick={() => goToItem(index - 1)}
                                    disabled={index === 0}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">
                                        Попереднє
                                    </span>
                                </button>
                                <span className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                                    {index + 1} з {items.length}
                                </span>
                                <button
                                    onClick={() => goToItem(index + 1)}
                                    disabled={index === items.length - 1}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">
                                        Наступне
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                </button>
                            </div>

                            {/* Which record this proposal belongs to */}
                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <div className="flex flex-wrap items-center justify-between gap-[10px]">
                                    <div className="flex flex-col gap-[5px]">
                                        <span className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                                            Запис, який ви редагуєте
                                        </span>
                                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] font-semibold">
                                            {settlementLabel(current.original ?? current.edit)}
                                        </h2>
                                        <span className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-70">
                                            {(current.original ?? current.edit)?.case_signature || '—'}
                                            {(current.original ?? current.edit)?.inventory_year
                                                ? ` · ${(current.original ?? current.edit).inventory_year}`
                                                : ''}
                                        </span>
                                    </div>
                                    <Link
                                        href={`/record/${current.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                                    >
                                        <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium whitespace-nowrap">
                                            Чинний запис
                                        </span>
                                        <ExternalLink className="w-4 h-4 text-[#2563EB] flex-shrink-0" strokeWidth={2} />
                                    </Link>
                                </div>
                            </section>

                            {/* What this proposal changes */}
                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    Що змінює ця пропозиція
                                </h2>

                                {!current.original ? (
                                    <p className="text-red-600 dark:text-red-400 text-[13px] lg:text-[14px]">
                                        ⚠️ Чинного запису вже немає в реєстрі — порівняти зміни неможливо.
                                    </p>
                                ) : changes.length === 0 ? (
                                    <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
                                        Зараз форма не відрізняється від чинного запису.
                                    </p>
                                ) : (
                                    <ul className="flex flex-col gap-[10px]">
                                        {changes.map((change) => (
                                            <li
                                                key={change.field}
                                                className="flex flex-col gap-[5px] pb-[10px] border-b border-gray-200 dark:border-[#374151] last:border-b-0 last:pb-0"
                                            >
                                                <span className="text-gray-700 dark:text-white text-[13px] opacity-80">
                                                    {change.label}
                                                </span>
                                                <div className="flex flex-wrap items-center gap-[8px]">
                                                    <span className="text-gray-500 dark:text-gray-400 text-[14px] line-through break-all">
                                                        {displayValue(change.field, change.oldValue)}
                                                    </span>
                                                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.6} />
                                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium break-all">
                                                        {displayValue(change.field, change.newValue)}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {/* Form */}
                            <EditableInventoryForm key={current.id} data={formData} onChange={setFormData} />

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

                            {/* Save Button */}
                            <div className="mt-[20px] flex justify-end">
                                <button
                                    onClick={saveEdit}
                                    disabled={saving}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[15px] lg:px-[20px] h-[40px] lg:h-[44px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Save className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                                    <span className="text-white text-[15px] lg:text-[16px] font-semibold whitespace-nowrap">
                                        {saving ? 'Збереження...' : 'Зберегти зміни'}
                                    </span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
