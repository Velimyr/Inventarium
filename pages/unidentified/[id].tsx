// pages/notidentify/[id].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Toast from '../../components/Toast';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import { useUser } from '../../contexts/UserContext';
import Link from 'next/link';

const MapSelector = dynamic(() => import('../../components/MapSelector'), { ssr: false });

interface Settlement {
    name: string;
    code: string;
    type: string;
    lat: number | null;
    lon: number | null;
}

interface NestedStructure {
    [region: string]: {
        [district: string]: {
            [community: string]: Settlement[];
        };
    };
}

export default function NotIdentifyDetails() {
    const { user } = useUser();
    const router = useRouter();
    const { id } = router.query;

    const [record, setRecord] = useState<any>(null);
    const [points, setPoints] = useState<any[]>([]);
    const [editingPointId, setEditingPointId] = useState<string | null>(null);
    const [formData, setFormData] = useState<any>({
        current_region: '',
        current_district: '',
        current_community: '',
        current_settlement_type: '',
        current_settlement_name: '',
        latitude: '',
        longitude: '',
        mark_type: '',
        old_province: '',
        old_district: '',
        old_community: '',
        old_settlement_type: '',
        old_settlement_name: '',
        inventory_start_page: '',
        notes: '',
        email: '',
    });

    const [nestedData, setNestedData] = useState<NestedStructure | null>(null);
    const [districts, setDistricts] = useState<string[]>([]);
    const [communities, setCommunities] = useState<string[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [settlementTypes, setSettlementTypes] = useState<string[]>([]);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Завантаження інвентаря
    useEffect(() => {
        if (!id) return;
        supabase
            .from('records_notidentify')
            .select('*')
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
                if (error) console.error(error);
                else setRecord(data);
            });
    }, [id]);

    // Завантаження точок
    const loadPoints = () => {
        if (!id) return;
        supabase
            .from('records_notidentify_points')
            .select('*')
            .eq('notidentify_record_id', id)
            .then(({ data, error }) => {
                if (error) console.error(error);
                else setPoints(data || []);
            });
    };

    useEffect(() => {
        if (!record || !user) return;
        setFormData(fd => ({
            ...fd,
            notes: record.notes || '',
            email: user.email || '',
        }));
    }, [record, user]);

    useEffect(() => {
        loadPoints();
    }, [id]);

    // Завантаження JSON з областями/районами/громадами
    useEffect(() => {
        fetch('/data/region_structure.json')
            .then((res) => res.json())
            .then((json: NestedStructure) => setNestedData(json))
            .catch((err) => console.error(err));
    }, []);

    // Каскадні селекти
    useEffect(() => {
        if (!nestedData) return;
        setDistricts(formData.current_region ? Object.keys(nestedData[formData.current_region] || {}) : []);
    }, [formData.current_region, nestedData]);

    useEffect(() => {
        if (!nestedData) return;
        setCommunities(
            formData.current_region && formData.current_district
                ? Object.keys(nestedData[formData.current_region][formData.current_district] || {})
                : []
        );
    }, [formData.current_district, formData.current_region, nestedData]);

    useEffect(() => {
        if (!nestedData) return;
        const settlementsData =
            formData.current_region &&
                formData.current_district &&
                formData.current_community
                ? nestedData[formData.current_region][formData.current_district][formData.current_community] || []
                : [];
        setSettlements(settlementsData);
        setSettlementTypes(Array.from(new Set(settlementsData.map((s) => s.type))));
    }, [formData.current_community, formData.current_district, formData.current_region, nestedData]);

    useEffect(() => {
        if (formData.current_settlement_name && formData.current_settlement_type) {
            const s = settlements.find(
                (s) => s.name === formData.current_settlement_name && s.type === formData.current_settlement_type
            );
            if (s) setFormData((fd) => ({ ...fd, latitude: s.lat || '', longitude: s.lon || '' }));
        }
    }, [formData.current_settlement_name, formData.current_settlement_type, settlements]);

    // Обробка зміни полів
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    // Обробка кліку на рядок таблиці для редагування
    const handleRowClick = (point: any) => {
        setEditingPointId(point.id);
        setFormData({
            current_region: point.current_region || '',
            current_district: point.current_district || '',
            current_community: point.current_community || '',
            current_settlement_type: point.current_settlement_type || '',
            current_settlement_name: point.current_settlement_name || '',
            latitude: point.latitude?.toString() || '',
            longitude: point.longitude?.toString() || '',
            mark_type: point.mark_type?.toString() || '',
            old_province: point.old_province || '',
            old_district: point.old_district || '',
            old_community: point.old_community || '',
            old_settlement_type: point.old_settlement_type || '',
            old_settlement_name: point.old_settlement_name || '',
            inventory_start_page: point.inventory_start_page || '',
            notes: point.notes || record?.notes || '',
            email: point.email || user?.email || '',
        });

        // Прокрутити до форми
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Скасування редагування
    const cancelEdit = () => {
        setEditingPointId(null);
        setFormData({
            current_region: '',
            current_district: '',
            current_community: '',
            current_settlement_type: '',
            current_settlement_name: '',
            latitude: '',
            longitude: '',
            mark_type: '',
            old_province: '',
            old_district: '',
            old_community: '',
            old_settlement_type: '',
            old_settlement_name: '',
            inventory_start_page: '',
            notes: record?.notes || '',
            email: user?.email || '',
        });
    };

    // Валідація форми
    const validate = () => {
        const requiredFields = [
            //'current_region',
            //'current_district',
            //'current_community',
            //'current_settlement_type',
            //'current_settlement_name',
            'old_settlement_type',
            'old_settlement_name',
            //'latitude',
            //'longitude',
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
            old_settlement_type: 'Тип населеного пункту (на момент складання інвентаря)',
            old_settlement_name: 'Назва населеного пункту (на момент складання інвентаря)'
        };

        // Перевірка обов'язкових полів
        for (const field of requiredFields) {
            if (!formData[field]) {
                const label = fieldLabels[field] || field;
                return `Поле "${label}" обов'язкове.`;
            }
        }

        // Валідація: якщо заповнені старі адмін. поля — мають містити мінімум два слова
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

        // Валідація email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            return 'Поле "Email" має містити дійсну електронну адресу.';
        }

        // Валідація сторінки початку інвентаря
        if (formData.inventory_start_page) {
            const page = parseInt(formData.inventory_start_page);
            if (isNaN(page) || page <= 0) {
                return 'Поле "Сторінка початку інвентарю" має бути числом більшим за 0.';
            }
        }
        //Валідація старої назви населеного пункту
        const cyrillicRegex = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґʼ'"0-9\s.,:!?()\/«»\-—]+$/u;
        if (formData.old_settlement_name && !cyrillicRegex.test(formData.old_settlement_name.trim())) {
            return 'Поле "Назва населеного пункту" може містити лише кириличні символи, дефіс, апостроф та пробіли.';
        }

        return null;
    };

    // Додавання або оновлення точки
    const handleSubmit = async () => {

        //if (!id || !user || !record) return;

        // Перевірка статусу інвентаря
        if (record.status !== 'new') {
            console.log('Неможливо додати населений пункт до цього інвентаря. Status: ', record.status);
            setToast({ message: 'Неможливо додати населений пункт до цього інвентаря', type: 'error' });
            return;
        }

        // Валідація перед збереженням
        const validationError = validate();
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            return;
        }

        console.log ('Validation ended ');
        const recordId = Array.isArray(id) ? id[0] : id;

        console.log ('record_id '+recordId);

        // Перевірка на дублікат при додаванні нового запису
        if (!editingPointId) {
            const { data: existingPoints, error: checkError } = await supabase
                .from('records_notidentify_points')
                .select('id')
                .eq('notidentify_record_id', recordId)
                .eq('current_region', formData.current_region)
                .eq('current_district', formData.current_district)
                .eq('current_community', formData.current_community)
                .eq('current_settlement_type', formData.current_settlement_type)
                .eq('current_settlement_name', formData.current_settlement_name);

            if (checkError) {
                console.error('Помилка при перевірці дублікатів:', checkError);
                setToast({ message: 'Помилка при перевірці дублікатів', type: 'error' });
                return;
            }

            if (existingPoints && existingPoints.length > 0) {
                setToast({ message: 'Цей населений пункт вже додано до інвентаря', type: 'error' });
                return;
            }
        }

        const payload = {
            // Дані з records_notidentify
            case_signature: record.case_signature || null,
            archive: record.archive || null,
            fonds: record.fonds || null,
            series: record.series || null,
            record: record.record || null,
            case_title: record.case_title || null,
            case_date: record.case_date || null,
            pages_count: record.pages_count || null,
            additional_case_signature: record.additional_case_signature || null,
            inventory_year: record.inventory_year ? parseInt(record.inventory_year, 10) : null,
            scans_url: record.scans_url || null,
            is_ukrainian_archive: record.is_ukrainian_archive || null,

            // Дані від користувача
            current_region: formData.current_region || null,
            current_district: formData.current_district || null,
            current_community: formData.current_community || null,
            current_settlement_type: formData.current_settlement_type || null,
            current_settlement_name: formData.current_settlement_name || null,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            mark_type: formData.mark_type ? parseInt(formData.mark_type, 10) : null,
            old_province: formData.old_province || null,
            old_district: formData.old_district || null,
            old_community: formData.old_community || null,
            old_settlement_type: formData.old_settlement_type || null,
            old_settlement_name: formData.old_settlement_name || null,
            inventory_start_page: formData.inventory_start_page || null,
            notes: formData.notes || null,
            email: formData.email || user.email,
            approved: false,
        };

        if (editingPointId) {
            // Оновлення існуючого запису
            const { error } = await supabase
                .from('records_notidentify_points')
                .update(payload)
                .eq('id', editingPointId);

            if (error) {
                console.error('Помилка при оновленні точки:', error);
                setToast({ message: 'Помилка при оновленні точки', type: 'error' });
                return;
            }

            setToast({ message: 'Точку оновлено', type: 'success' });
            setEditingPointId(null);
        } else {
            // Додавання нового запису
            console.log ('start add point');
            const { error } = await supabase
                .from('records_notidentify_points')
                .insert([{
                    ...payload,
                    notidentify_record_id: recordId,
                    created_by: (user?.id || null),
                }]);

            if (error) {
                console.error('Помилка при додаванні точки:', error);
                setToast({ message: 'Помилка при додаванні точки', type: 'error' });
                return;
            }

            setToast({ message: 'Точка додана', type: 'success' });
        }

        loadPoints();
        setFormData({
            current_region: '',
            current_district: '',
            current_community: '',
            current_settlement_type: '',
            current_settlement_name: '',
            latitude: '',
            longitude: '',
            mark_type: '',
            old_province: '',
            old_district: '',
            old_community: '',
            old_settlement_type: '',
            old_settlement_name: '',
            inventory_start_page: '',
            notes: record?.notes || '',
            email: user?.email || '',
        });
    };

    // Завершення ідентифікації
    // Завершення ідентифікації
    const completeIdentification = async () => {
        if (!id || !record) return;

        // Перевірка статусу інвентаря
        if (record.status !== 'new') {
            setToast({ message: 'Неможливо завершити ідентифікацію цього інвентаря', type: 'error' });
            return;
        }

        // Перевірка чи є хоча б одна точка
        if (points.length === 0) {
            setToast({ message: 'Додайте хоча б один населений пункт перед завершенням ідентифікації', type: 'error' });
            return;
        }

        // Перевірка заповнення всіх обов'язкових полів для кожної точки
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
            old_settlement_type: 'Тип населеного пункту (на момент складання інвентаря)',
            old_settlement_name: 'Назва населеного пункту (на момент складання інвентаря)',
        };

        // Перевіряємо кожну точку
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const pointNumber = i + 1;

            for (const field of requiredFields) {
                const value = point[field];
                
                if (value === null || value === undefined || value === '') {
                    const label = fieldLabels[field] || field;
                    const locationInfo = point.current_settlement_name 
                        ? ` (${point.current_settlement_name})`
                        : ` (точка №${pointNumber})`;
                    
                    setToast({ 
                        message: `У точки${locationInfo} не заповнено обов'язкове поле "${label}". Відредагуйте запис перед завершенням ідентифікації.`, 
                        type: 'error' 
                    });
                    return;
                }
            }
        }

        const recordId = Array.isArray(id) ? id[0] : id;

        const { data, error } = await supabase
            .from('records_notidentify')
            .update({ status: 'review' })
            .eq('id', recordId);

        if (error) {
            console.error('Повна помилка:', error);
            setToast({ message: `Помилка: ${error.message || 'Невідома помилка'}`, type: 'error' });
            return;
        }

        // Оновлюємо локальний стан
        setRecord({ ...record, status: 'review' });
        setToast({ message: 'Ідентифікацію завершено. Очікуйте підтвердження адміністратором', type: 'success' });
    };

    if (!record) return <p className="p-6">Завантаження...</p>;

    return (
        <>
            <Header />
            <main className="p-6 w-full bg-white dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
                <div className="flex flex-col lg:flex-row gap-6">

                    {/* Блок 1: Інформація про інвентар */}
                    <section className="flex-1 border p-4 rounded dark:border-gray-700">
                        <h2 className="text-xl font-semibold mb-4">Неідентифікований інвентар</h2>

                        <table className="w-full border-collapse">
                            <tbody>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Шифр справи</td>
                                    <td className="p-2">{record.case_signature || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Архів</td>
                                    <td className="p-2">{record.archive || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Номер фонд</td>
                                    <td className="p-2">{record.fonds || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Номер опису</td>
                                    <td className="p-2">{record.series || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Номер справи</td>
                                    <td className="p-2">{record.record || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2 w-1/3">Назва справи</td>
                                    <td className="p-2">{record.case_title || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Рік складання</td>
                                    <td className="p-2">{record.inventory_year || '—'}</td>
                                </tr>
                                <tr className="border-b dark:border-gray-600">
                                    <td className="font-semibold p-2">Примітки</td>
                                    <td className="p-2">{record.notes || '—'}</td>
                                </tr>
                                <tr>
                                    <td className="font-semibold p-2">Посилання на скани</td>
                                    <td className="p-2">
                                        {record.scans_url ? (
                                            <a
                                                href={record.scans_url}
                                                className="text-blue-600 underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {record.scans_url}
                                            </a>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="font-semibold p-2">Статус інвентарю</td>
                                    <td className="p-2">
                                        {record.status === 'new' && 'Очікує ідентифікації'}
                                        {record.status === 'review' && 'Обробляється адміністратором'}
                                        {record.status === 'done' && 'Оброблено'}
                                        {!['new', 'review', 'done'].includes(record.status) && '—'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {/* Блок 2: Ідентифікація */}
                    <section className="flex-1 border p-4 rounded dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">
                                {editingPointId ? 'Редагування точки' : 'Ідентифікація населених пунктів'}
                            </h2>
                            {editingPointId && (
                                <button
                                    onClick={cancelEdit}
                                    className="text-sm bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                                >
                                    Скасувати
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* Сучасний адміністративний поділ */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Сучасний адміністративний поділ</h3>
                                <select
                                    name="current_region"
                                    value={formData.current_region}
                                    onChange={handleChange}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                >
                                    <option value="">Оберіть область</option>
                                    {nestedData && Object.keys(nestedData).map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>

                                <select
                                    name="current_district"
                                    value={formData.current_district}
                                    onChange={handleChange}
                                    disabled={!districts.length}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                >
                                    <option value="">Оберіть район</option>
                                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>

                                <select
                                    name="current_community"
                                    value={formData.current_community}
                                    onChange={handleChange}
                                    disabled={!communities.length}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                >
                                    <option value="">Оберіть громаду</option>
                                    {communities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>

                                <div className="flex flex-wrap gap-2 mb-2">
                                    <select
                                        name="current_settlement_type"
                                        value={formData.current_settlement_type}
                                        onChange={handleChange}
                                        disabled={!settlementTypes.length}
                                        className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    >
                                        <option value="">Оберіть тип населеного пункту</option>
                                        {settlementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>

                                    <select
                                        name="current_settlement_name"
                                        value={formData.current_settlement_name}
                                        onChange={handleChange}
                                        disabled={!formData.current_settlement_type}
                                        className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    >
                                        <option value="">Оберіть населений пункт</option>
                                        {settlements
                                            .filter(s => s.type === formData.current_settlement_type)
                                            .map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>

                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                    Якщо потрібного населеного пункту немає, ви можете{' '}
                                    <Link href="/add_settlement" className="underline hover:text-blue-600 dark:hover:text-blue-400">
                                        надіслати запит на його додавання
                                    </Link>.
                                </p>

                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                    Оберіть точку на карті, що стосується потрібного населеного пункту (Обов'язково)
                                </p>

                                <MapSelector
                                    latitude={formData.latitude}
                                    longitude={formData.longitude}
                                    onPositionChange={(lat, lng) =>
                                        setFormData(fd => ({ ...fd, latitude: lat.toString(), longitude: lng.toString() }))
                                    }
                                />

                                <select
                                    name="mark_type"
                                    value={formData.mark_type}
                                    onChange={handleChange}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mt-2"
                                >
                                    <option value="">Тип позначки</option>
                                    <option value="1">Місце</option>
                                    <option value="0">Регіон</option>
                                </select>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Обирайте "Місце" якщо точно знаєте, що інвентар стосується цього населеного пункту.
                                    Обирайте "Регіон" якщо не впевнені які села зустрічаються в інвентарі.
                                </p>
                            </div>

                            {/* Адміністративний поділ час складання */}
                            <div className="mt-4">
                                <h3 className="text-lg font-semibold mb-2">Адміністративний поділ станом на час складання інвентарю</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                    Заповнюйте лише ті значення, в яких точно впевнені. Вказуйте повну назву, наприклад "Київське воєводство" замість "Київське"
                                </p>

                                <div className="flex flex-col gap-2 mb-2">
                                    <input
                                        name="old_province"
                                        value={formData.old_province}
                                        onChange={handleChange}
                                        placeholder="Воєводство (Губернія)"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                    <input
                                        name="old_district"
                                        value={formData.old_district}
                                        onChange={handleChange}
                                        placeholder="Повіт"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                    <input
                                        name="old_community"
                                        value={formData.old_community}
                                        onChange={handleChange}
                                        placeholder="Ключ (Староство)"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                </div>

                                <div className="flex gap-2 flex-wrap mb-2">
                                    <select
                                        name="old_settlement_type"
                                        value={formData.old_settlement_type}
                                        onChange={handleChange}
                                        className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    >
                                        <option value="">Тип населеного пункту</option>
                                        <option value="Місто">Місто</option>
                                        <option value="Містечко">Містечко</option>
                                        <option value="Село">Село</option>
                                    </select>
                                    <input
                                        name="old_settlement_name"
                                        value={formData.old_settlement_name}
                                        onChange={handleChange}
                                        placeholder="Назва населеного пункту"
                                        className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                </div>

                                <input
                                    name="inventory_start_page"
                                    value={formData.inventory_start_page}
                                    onChange={handleChange}
                                    placeholder="Сторінка початку інвентарю"
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                />

                                <textarea
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    placeholder="Примітки"
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                    rows={3}
                                />

                                <input
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Email для зв'язку"
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                className={`mt-2 text-white p-2 rounded w-full ${editingPointId
                                        ? 'bg-orange-600 hover:bg-orange-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                            >
                                {editingPointId ? 'Оновити' : 'Додати точку'}
                            </button>
                        </div>
                    </section>
                </div>

                {/* Блок 3: Таблиця населених пунктів */}
                <section className="mt-6 border p-4 rounded dark:border-gray-700">
                    <h2 className="text-xl font-semibold mb-2">Населені пункти інвентарю</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Натисніть на рядок/картку, щоб відредагувати запис
                    </p>

                    {/* Десктопна версія: таблиця */}
                    <table className="hidden sm:table w-full border-collapse border border-gray-300 dark:border-gray-600">
                        <thead>
                            <tr>
                                <th className="border p-2">Сучасний адміністративний поділ</th>
                                <th className="border p-2">Давній адміністративний поділ</th>
                                <th className="border p-2">Координати</th>
                                <th className="border p-2">Сторінка початку інвентарю</th>
                            </tr>
                        </thead>
                        <tbody>
                            {points.map(p => {
                                const fullLocationCurrent = [
                                    p.current_region ? `${p.current_region} область` : null,
                                    p.current_district ? `${p.current_district} район` : null,
                                    p.current_community ? `${p.current_community} громада` : null,
                                    p.current_settlement_type && p.current_settlement_name
                                        ? `${p.current_settlement_type} ${p.current_settlement_name}`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(', ');

                                const fullLocationOld = [
                                    p.old_province,
                                    p.old_district,
                                    p.old_community,
                                    p.old_settlement_type && p.old_settlement_name
                                        ? `${p.old_settlement_type} ${p.old_settlement_name}`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(', ');

                                const isEditing = editingPointId === p.id;

                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => handleRowClick(p)}
                                        className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${isEditing ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                            }`}
                                    >
                                        <td className="border p-2">{fullLocationCurrent || '-'}</td>
                                        <td className="border p-2">{fullLocationOld || '-'}</td>
                                        <td className="border p-2">
                                            {p.latitude && p.longitude ? (
                                                <a
                                                    href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-600 underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Відкрити на мапі
                                                </a>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="border p-2">{p.inventory_start_page || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Мобільна версія: картки */}
                    <div className="block sm:hidden space-y-4 mt-4">
                        {points.map(p => {
                            const fullLocationCurrent = [
                                p.current_region ? `${p.current_region} область` : null,
                                p.current_district ? `${p.current_district} район` : null,
                                p.current_community ? `${p.current_community} громада` : null,
                            ].filter(Boolean).join(', ');

                            const fullLocationOld = [
                                p.old_province,
                                p.old_district,
                                p.old_community,
                            ].filter(Boolean).join(', ');

                            const isEditing = editingPointId === p.id;

                            return (
                                <div
                                    key={p.id}
                                    onClick={() => handleRowClick(p)}
                                    className={`border rounded p-3 shadow-sm cursor-pointer transition ${isEditing
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="mb-3">
                                        <div className="text-xs font-semibold mb-1">Сучасний адміністративний поділ:</div>
                                        <div className="text-xs">
                                            {fullLocationCurrent || '-'}
                                        </div>
                                        {(p.current_settlement_type || p.current_settlement_name) && (
                                            <div className="text-xs mt-1">
                                                {[p.current_settlement_type, p.current_settlement_name].filter(Boolean).join(' ')}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-3">
                                        <div className="text-xs font-semibold mb-1">Давній адміністративний поділ:</div>
                                        <div className="text-xs">
                                            {fullLocationOld || '-'}
                                        </div>
                                        {(p.old_settlement_type || p.old_settlement_name) && (
                                            <div className="text-xs mt-1">
                                                {[p.old_settlement_type, p.old_settlement_name].filter(Boolean).join(' ')}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-2">
                                        <div className="text-xs font-semibold mb-1">Координати:</div>
                                        <div className="text-xs">
                                            {p.latitude && p.longitude ? (
                                                <a
                                                    href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-600 underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Відкрити на мапі
                                                </a>
                                            ) : (
                                                '-'
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs font-semibold mb-1">Сторінка початку інвентарю:</div>
                                        <div className="text-xs">{p.inventory_start_page || '-'}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={completeIdentification}
                            className="mt-4 bg-green-600 text-white p-2 rounded hover:bg-green-700"
                        >
                            Завершити ідентифікацію
                        </button>
                    </div>
                </section>

                {toast && (
                    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
                )}
            </main>
        </>
    );
}