import { useState, useEffect } from 'react';
import Header from '../components/header';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';

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
        case_title: '',
        case_date: '',
        pages_count: '',
        inventory_year: '',
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
                const label = fieldLabels[field] || field;
                return `Поле "${label}" обов’язкове.`;
            }
        }

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

        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validationError = await validate(); // асинхронна валідація
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            return;
        }

        // Формуємо case_signature якщо архів український
        if (
            formData.is_ukrainian_archive === 'Так' &&
            formData.archive &&
            formData.fonds &&
            formData.series &&
            formData.record
        ) {
            formData.case_signature = `${formData.archive} ${formData.fonds}-${formData.series}-${formData.record}`;
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
                return;
            }
        }

        // Не зберігаємо is_ukrainian_archive у базу
        const { is_ukrainian_archive, ...dataToSave } = formData;

        const { error } = await supabase.from('records_notidentify').insert([
            {
                ...dataToSave,
                pages_count: formData.pages_count ? parseInt(formData.pages_count) : null,
                inventory_year: formData.inventory_year ? parseInt(formData.inventory_year) : null,
                status: 'new',
                created_by: user?.id || null,
            },
        ]);

        if (error) {
            setToast({ message: 'Помилка збереження інвентарю', type: 'error' });
        } else {
            setToast({ message: 'Інвентар успішно додано до перевірки.', type: 'success' });            
        }
    };


    return (
        <>
            <Header />
            <main className="p-6 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
                <div className="max-w-2xl w-full">
                    <h1 className="text-2xl font-bold mb-6">Додати новий неідентифікований інвентар</h1>

                    <UnidentifiedInventoryForm
                        data={formData}
                        onChange={setFormData}
                    />

                    <div className="flex gap-4 mt-4">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded mt-4"
                        >
                            Зберегти
                        </button>
                    </div>
                </div>
            </main>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}
