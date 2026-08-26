import { useState, useEffect } from 'react';
import Header from '../components/header';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';
import { Save, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import {
    buildCaseSignature,
    fromSignatureList,
    hasAllArchiveParts,
    validateCaseSignature,
} from '../lib/caseSignature';
import { reportAddProblem as reportProblemToAdmins } from '../lib/reportProblem';
import { fieldLabel } from '../lib/recordFields';

const UnidentifiedInventoryForm = dynamic(
    () => import('../components/UnidentifiedInventoryForm'),
    { ssr: false }
);

export default function AddUnidentifiedInventoryPage() {
    const { user, loading } = useUser();
    const [formData, setFormData] = useState<any>({
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
        inventory_type: '',
        scans_url: '',
        notes: '',
        email: '',
    });

    const fieldLabels: { [key: string]: string } = {
        email: 'Email',
        case_signature: 'Шифр справи',
        archive: 'Назва архіву',
        fonds: 'Номер фонду',
        series: 'Номер опису',
        record: 'Номер справи',
        case_title: 'Назва справи',
        case_date: 'Дати справи',
        pages_count: 'Кількість сторінок справи',
        inventory_year: 'Рік складання інвентарю',
        inventory_type: 'Тип документа',
        scans_url: 'Посилання на скани',
        notes: 'Примітки',
    };

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Підставляємо email користувача
    useEffect(() => {
        if (!loading && user?.email && !formData.email) {
            setFormData(fd => ({ ...fd, email: user.email }));
        }
    }, [user, loading]);

    const validate = () => {
        const requiredFields = [
            'is_ukrainian_archive',
            'case_title',
            'email',
        ];
        
        requiredFields.push('case_title');
        if (formData.is_ukrainian_archive === 'Так') {
            requiredFields.push('archive', 'fonds', 'series', 'record');
        } else {
            requiredFields.push('case_signature');
        }

        for (const field of requiredFields) {
            if (!formData[field]) {
                const label = fieldLabels[field] || fieldLabel(field);
                return `Поле "${label}" обов'язкове.`;
            }
        }

        const year = parseInt(formData.inventory_year);
        if (formData.inventory_year && (isNaN(year) || year < 1400 || year > 2000)) {
            return 'Поле "Рік складання інвентаря" має бути числом від 1400 до 2000';
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            return 'Поле "Email" має містити дійсну електронну адресу.';
        }

        if (formData.scans_url) {
            const urlRegex = /^https?:\/\/[^\s]+$/;
            if (!urlRegex.test(formData.scans_url)) {
                return 'Поле "Посилання на скани" має містити одне коректне посилання або бути порожнім.';
            }
        }

        if (formData.pages_count) {
            const pages = parseInt(formData.pages_count);
            if (isNaN(pages) || pages <= 0) {
                return 'Поле "Кількість сторінок справи" має бути числом більшим за 0.';
            }
        }

        if (formData.inventory_start_page) {
            const page = parseInt(formData.inventory_start_page);
            if (isNaN(page) || page <= 0) {
                return 'Поле "Сторінка початку інвентарю" має бути числом більшим за 0.';
            }
        }

        const cyrillicRegex = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґʼ'"0-9\s.,:!?()\/«»\-—]+$/u;
        if (formData.case_title && !cyrillicRegex.test(formData.case_title.trim())) {
            return 'Поле "Назва справи" може містити лише кириличні символи, апостроф та пробіли.';
        }

        // Шифр і його складові мають описувати одну справу
        const signatureError = validateCaseSignature(formData);
        if (signatureError) return signatureError;

        return null;
    };

    // Звіт адмінам про будь-яку невдачу (Telegram-файл + /messages) під
    // прапорцем report_add_problems. Fire-and-forget.
    const reportAddProblem = (reason: string) => {
        reportProblemToAdmins({
            supabase,
            source: 'add_unidentified',
            reason,
            email: formData.email || user?.email || null,
            userId: user?.id || null,
            formData,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Формуємо case_signature якщо архів український — до валідації,
        // щоб вона перевіряла вже остаточний шифр
        if (formData.is_ukrainian_archive === 'Так' && hasAllArchiveParts(formData)) {
            formData.case_signature = buildCaseSignature(formData);
        }

        const validationError = await validate();
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            reportAddProblem(validationError);
            return;
        }

        // Перевірка унікальності case_signature
        if (formData.case_signature) {
            const { data: existingNotIdentify } = await supabase
                .from('records_notidentify')
                .select('id')
                .eq('case_signature', formData.case_signature)
                .limit(1);

            const { data: existingRecords } = await supabase
                .from('records')
                .select('id')
                .eq('case_signature', formData.case_signature)
                .limit(1);

            if ((existingNotIdentify && existingNotIdentify.length > 0) ||
                (existingRecords && existingRecords.length > 0)) {
                setToast({ message: 'Запис з таким шифром справи вже існує в реєстрі.', type: 'error' });
                reportAddProblem('Дубль: шифр справи вже існує в реєстрі');
                return;
            }
        }

        // Не зберігаємо is_ukrainian_archive у базу
        const { is_ukrainian_archive, ...dataToSave } = formData;

        const { error } = await supabase.from('records_notidentify').insert([
            {
                ...dataToSave,
                additional_case_signature: fromSignatureList(formData.additional_case_signature),
                pages_count: formData.pages_count ? parseInt(formData.pages_count) : null,
                inventory_year: formData.inventory_year ? parseInt(formData.inventory_year) : null,
                status: 'new',
                created_by: user?.id || null,
            },
        ]);

        if (error) {
            setToast({ message: 'Помилка збереження інвентарю', type: 'error' });
            reportAddProblem('Помилка збереження в БД: ' + (error.message || String(error)));
        } else {
            setToast({ message: 'Інвентар успішно додано до перевірки.', type: 'success' });
        }
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
                        Додати новий неідентифікований інвентар
                    </h1>

                    <UnidentifiedInventoryForm
                        data={formData}
                        onChange={setFormData}
                    />

                    {/* Action Buttons Section */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827]">
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
                            <Link href="/unidentified">
                                <button className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors">
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                                        Скасувати додавання
                                    </span>
                                </button>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}