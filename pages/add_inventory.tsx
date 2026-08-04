import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import { supabase } from '../lib/supabaseClient';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications';
import { getAdminUserIds } from '../lib/adminUsers';
import { Save, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { fromSignatureList, validateCaseSignature } from '../lib/caseSignature';
import { reportAddProblem as reportProblemToAdmins } from '../lib/reportProblem';
import { findRecordWithAdditionalSignature } from '../lib/duplicateCheck';
import DuplicateWarnings from '../components/DuplicateWarnings';

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
    ssr: false,
});

export default function AddInventoryPage() {
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();
    const { user, loading } = useUser();

    const [formData, setFormData] = useState<any>({
        current_country: '',
        current_region: '',
        current_district: '',
        current_community: '',
        current_settlement_type: '',
        current_settlement_name: '',
        latitude: '',
        longitude: '',
        old_province: '',
        old_district: '',
        old_community: '',
        old_settlement_type: '',
        old_settlement_name: '',
        is_ukrainian_archive: 'Так',
        archive: '',
        fonds: '',
        series: '',
        record: '',
        case_signature: '',
        additional_case_signature: [] as string[],
        case_title: '',
        case_date: '',
        pages_count: '',
        inventory_year: '',
        inventory_start_page: '',
        inventory_type: '',
        mark_type: '',
        scans_url: '',
        notes: '',
        email: '',
    });

    const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const checkDuplicateYear = async () => {
            if (
                formData.inventory_year &&
                formData.current_region &&
                formData.current_district &&
                formData.current_community &&
                formData.current_settlement_type &&
                formData.current_settlement_name
            ) {
                const yearInt = parseInt(formData.inventory_year);

                const { data, error } = await supabase
                    .from('records')
                    .select('id, archive')
                    .match({
                        current_region: formData.current_region,
                        current_district: formData.current_district,
                        current_community: formData.current_community,
                        current_settlement_type: formData.current_settlement_type,
                        current_settlement_name: formData.current_settlement_name,
                        inventory_year: yearInt
                    });

                if (!error && data && data.length > 0) {
                    const sameArchive = data.some(r => r.archive === formData.archive);
                    if (!sameArchive) {
                        setDuplicateWarning(
                            'В реєстрі уже є інвентар за цей рік, але в іншому архіві, перевірте чи це не один і той самий інвентар'
                        );
                    } else {
                        setDuplicateWarning(null);
                    }
                } else {
                    setDuplicateWarning(null);
                }
            } else {
                setDuplicateWarning(null);
            }
        };

        checkDuplicateYear();
    }, [
        formData.inventory_year,
        formData.current_region,
        formData.current_district,
        formData.current_community,
        formData.current_settlement_type,
        formData.current_settlement_name,
        formData.archive
    ]);

    useEffect(() => {
        if (!loading && user?.email) {
            setFormData((prev: any) => {
                if (!prev.email) {
                    return { ...prev, email: user.email };
                }
                return prev;
            });
        }
    }, [user, loading]);

    const validate = () => {
        const requiredFields = [
            'current_region',
            'current_district',
            'current_community',
            'current_settlement_type',
            'current_settlement_name',
            'old_settlement_type',
            'old_settlement_name',
            'latitude',
            'longitude',
            'mark_type',
            'email',
        ];

        const fieldLabels: { [key: string]: string } = {
            current_region: 'Область',
            current_district: 'Район',
            current_community: 'ОТГ',
            current_settlement_type: 'Тип населеного пункту',
            current_settlement_name: 'Назва населеного пункту',
            latitude: 'Широта',
            longitude: 'Довгота',
            mark_type: 'Тип позначки',
            email: 'Email',
            case_signature: 'Шифр справи',
            old_settlement_type: 'Тип населеного пункту (на момент складання інвентаря)',
            old_settlement_name: 'Назва населеного пункту (на момент складання інвентаря)'
        };

        const twoWordsRegex = /^\S+\s+\S+/;

        if (formData.old_province && !twoWordsRegex.test(formData.old_province.trim())) {
            return 'Поле "Воєводство (губернія)" має містити мінімум два слова. Вказуйте повну назву, наприклад "Київське воєводство" замість "Київське"';
        }

        if (formData.old_district && !twoWordsRegex.test(formData.old_district.trim())) {
            return 'Поле "Повіт" має містити мінімум два слова. Вказуйте повну назву, наприклад "Махнівський повіт" замість "Махнівський"';
        }

        if (formData.old_community && !twoWordsRegex.test(formData.old_community.trim())) {
            return 'Поле "Ключ (Староство)" має містити мінімум два слова. Вказуйте повну назву, наприклад "Махнівський ключ" замість "Махнівський"';
        }

        if (formData.is_ukrainian_archive === 'Так') {
            requiredFields.push('archive', 'fonds', 'series', 'record');
        } else {
            requiredFields.push('case_signature');
        }

        for (const field of requiredFields) {
            if (!formData[field]) {
                const label = fieldLabels[field] || field;
                return `Поле "${label}" обов'язкове.`;
            }
        }

        // Шифр і його складові мають описувати одну справу
        const signatureError = validateCaseSignature(formData);
        if (signatureError) return signatureError;

        const year = parseInt(formData.inventory_year);
        if (formData.inventory_year && (isNaN(year) || year < 1400 || year > 2000)) {
            return 'Поле "Рік складання інвентаря" має бути числом від 1400 до 2000';
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            return 'Поле "email" має містити дійсну електронну адресу.';
        }

        if (formData.scans_url) {
            const urlRegex = /^https?:\/\/[^\s]+$/;
            if (!urlRegex.test(formData.scans_url)) {
                return 'Поле "Посилання на скани" має містити одне коректне посилання або бути порожнім.';
            }
        }

        // ВИПРАВЛЕНО: використовуємо Number() замість parseInt() для суворої перевірки
        // parseInt("5abc") === 5, але Number("5abc") === NaN — текст з цифрами більше не пройде
        if (formData.pages_count) {
            const pages = Number(formData.pages_count);
            if (isNaN(pages) || !Number.isInteger(pages) || pages <= 0) {
                return 'Поле "Кількість сторінок справи" має бути цілим числом більшим за 0.';
            }
        }

        const cyrillicRegex = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґʼ'"0-9\s.,:!?()\/«»\-—]+$/u;
        if (formData.case_title && !cyrillicRegex.test(formData.case_title.trim())) {
            return 'Поле "Назва справи" може містити лише кириличні символи, дефіс, апостроф та пробіли.';
        }
        if (formData.old_settlement_name && !cyrillicRegex.test(formData.old_settlement_name.trim())) {
            return 'Поле "Назва населеного пункту" може містити лише кириличні символи, дефіс, апостроф та пробіли.';
        }

        return null;
    };

    // Звіт адмінам про будь-яку невдачу додавання (Telegram-файл + /messages),
    // під прапорцем report_add_problems. Fire-and-forget: UX не блокує.
    const reportAddProblem = (reason: string) => {
        reportProblemToAdmins({
            supabase,
            source: 'add_inventory',
            reason,
            email: formData.email || user?.email || null,
            userId: user?.id || null,
            formData,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setDuplicateUrl(null);
        setSuccess(false);

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            setToast({ message: validationError, type: 'error' });
            reportAddProblem(validationError);
            return;
        }

        const matchQuery: Record<string, any> = {
            current_region: formData.current_region,
            current_district: formData.current_district,
            current_community: formData.current_community,
            current_settlement_type: formData.current_settlement_type,
            current_settlement_name: formData.current_settlement_name,
            old_settlement_type: formData.old_settlement_type,
            old_settlement_name: formData.old_settlement_name,
            case_signature: formData.case_signature,
        };

        let existing;
        if (formData.inventory_year) {
            ({ data: existing } = await supabase
                .from('records')
                .select('id')
                .match({ ...matchQuery, inventory_year: formData.inventory_year.trim() })
                .maybeSingle());
        } else {
            ({ data: existing } = await supabase
                .from('records')
                .select('id')
                .match(matchQuery)
                .is('inventory_year', null)
                .maybeSingle());
        }

        if (existing) {
            setDuplicateUrl(`/records/${existing.id}`);
            setToast({
                message: `Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів`,
                type: 'error',
            });
            reportAddProblem('Дубль: інвентар уже існує в реєстрі');
            return;
        }

        let unverifiedExisting;
        if (formData.inventory_year) {
            ({ data: unverifiedExisting } = await supabase
                .from('records_unverified')
                .select('id')
                .match({ ...matchQuery, inventory_year: formData.inventory_year.trim() })
                .maybeSingle());
        } else {
            ({ data: unverifiedExisting } = await supabase
                .from('records_unverified')
                .select('id')
                .match(matchQuery)
                .is('inventory_year', null)
                .maybeSingle());
        }

        if (unverifiedExisting) {
            setToast({
                message: `Такий інвентар уже надіслано на перевірку. Зачекайте, доки адміністратор Inventarium його опрацює.`,
                type: 'error',
            });
            reportAddProblem('Дубль: інвентар уже в черзі на перевірку');
            return;
        }

        // Той самий шифр уже вказано як додатковий шифр справи в іншому записі
        // цього населеного пункту — це та сама справа.
        const crossMatch = await findRecordWithAdditionalSignature(formData.case_signature, formData);
        if (crossMatch) {
            setDuplicateUrl(`/records/${crossMatch.id}`);
            const msg = `Шифр справи «${formData.case_signature}» вже вказано як додатковий шифр справи в іншому записі цього населеного пункту.`;
            setToast({ message: msg, type: 'error' });
            reportAddProblem(msg);
            return;
        }

        const toInsert = {
            ...formData,
            additional_case_signature: fromSignatureList(formData.additional_case_signature),
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            mark_type: formData.mark_type ? parseInt(formData.mark_type) : null,
            pages_count: formData.pages_count ? Number(formData.pages_count) : null,
            inventory_start_page: formData.inventory_start_page || null,
            inventory_year: formData.inventory_year ? parseInt(formData.inventory_year) : null,
            created_by: user?.id || null,
        };

        const { error: insertError } = await supabase.from('records_unverified').insert([toInsert]);

        if (insertError) {
            setError('Помилка збереження даних');
            setToast({ message: 'Помилка збереження даних: ' + insertError, type: 'error' });
            reportAddProblem('Помилка збереження в БД: ' + (insertError.message || String(insertError)));
        } else {
            setSuccess(true);

            //Відправка повідомлення адмінам по новий доданий інвентар
            const adminIds = await getAdminUserIds(supabase);

            if (adminIds.length > 0) {
                const messageText =
                    `Новий інвентар очікує на перевірку.\n\n` +
                    `**Дані інвентаря:**\n\n` +
                    `Область: ${formData.current_region}\n` +
                    `Район: ${formData.current_district}\n` +
                    `Громада: ${formData.current_community}\n` +
                    `Населений пункт: ${formData.current_settlement_type} ${formData.current_settlement_name}\n\n` +
                    `Email автора: ${formData.email}`;

                for (const adminId of adminIds) {
                    try {
                        await sendNotification({
                            fromUserId: user?.id || 'system',
                            toUserId: adminId,
                            messageType: 'new',
                            messageText
                        });
                    } catch (err) {
                        console.error('Помилка відправки повідомлення адміну:', err);
                    }
                }
            }

            setToast({ message: 'Інвентар успішно додано до перевірки.', type: 'success' });
        }
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                        Додати новий інвентар до реєстру
                    </h1>

                    {/* Instruction Link */}
                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                        Перед додаванням, будь ласка,{' '}
                        <a
                            href="https://telegra.ph/%D0%86nstrukc%D1%96ya-po-robot%D1%96-z-%D0%86nventar%D1%96um-06-27"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:opacity-100"
                        >
                            ознайомтесь з інструкцією
                        </a>
                    </p>

                    <EditableInventoryForm
                        data={formData}
                        onChange={setFormData}
                        duplicateWarning={duplicateWarning}
                    />

                    {/* Warning Banner */}
                    <div className="flex items-center gap-[10px] p-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308] mb-[20px]">
                        <AlertTriangle className="w-4 h-4 text-[#92400E] dark:text-[#451A03] flex-shrink-0" strokeWidth={1.6} />
                        <p className="text-[#92400E] dark:text-[#451A03] text-[14px] lg:text-[16px] font-medium">
                            Зверніть увагу, що доданий вами інвентар буде опубліковано в реєстрі лише після перевірки адміністратором
                        </p>
                    </div>

                    <DuplicateWarnings record={formData} />

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-[15px]">
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                        >
                            <Save className="w-4 h-4 text-white" strokeWidth={1.6} />
                            <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                Зберегти інвентар
                            </span>
                        </button>
                        <Link href="/">
                            <button className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors">
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                                    Скасувати додавання
                                </span>
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}
