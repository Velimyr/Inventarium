// pages/notidentify/[id].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Toast from '../../components/Toast';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import { useUser } from '../../contexts/UserContext';
import Link from 'next/link';
import { sendNotification } from '../../components/notifications';
import { getAdminUserIds } from '../../lib/adminUsers';
import { MapPin, FileText, Save, X, Check, ChevronDown } from 'lucide-react';

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
            'old_settlement_type',
            'old_settlement_name',
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

        for (const field of requiredFields) {
            if (!formData[field]) {
                const label = fieldLabels[field] || field;
                return `Поле "${label}" обов'язкове.`;
            }
        }

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

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            return 'Поле "Email" має містити дійсну електронну адресу.';
        }

        if (formData.inventory_start_page) {
            const page = parseInt(formData.inventory_start_page);
            if (isNaN(page) || page <= 0) {
                return 'Поле "Сторінка початку інвентарю" має бути числом більшим за 0.';
            }
        }

        const cyrillicRegex = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґʼ'"0-9\s.,:!?()\/«»\-—]+$/u;
        if (formData.old_settlement_name && !cyrillicRegex.test(formData.old_settlement_name.trim())) {
            return 'Поле "Назва населеного пункту" може містити лише кириличні символи, дефіс, апостроф та пробіли.';
        }

        return null;
    };

    // Додавання або оновлення точки
    const handleSubmit = async () => {
        if (record.status !== 'new') {
            console.log('Неможливо додати населений пункт до цього інвентаря. Status: ', record.status);
            setToast({ message: 'Неможливо додати населений пункт до цього інвентаря', type: 'error' });
            return;
        }

        const validationError = validate();
        if (validationError) {
            setToast({ message: validationError, type: 'error' });
            return;
        }

        const recordId = Array.isArray(id) ? id[0] : id;

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
    const completeIdentification = async () => {
        if (!id || !record) return;

        if (record.status !== 'new') {
            setToast({ message: 'Неможливо завершити ідентифікацію цього інвентаря', type: 'error' });
            return;
        }

        if (points.length === 0) {
            setToast({ message: 'Додайте хоча б один населений пункт перед завершенням ідентифікації', type: 'error' });
            return;
        }

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

        setRecord({ ...record, status: 'review' });

        const adminIds = await getAdminUserIds(supabase);

        if (adminIds.length > 0) {
            const recordUrl = `${window.location.origin}/unidentified/${id}`
            const messageText =
                `Новий інвентар ідентифіковано, він очікує на перевірку.\n\n` +
                `[Переглянути щойно ідентифікований інвентар](${recordUrl})`

            for (const adminId of adminIds) {
                try {
                    await sendNotification({
                        fromUserId: user?.id || 'system',
                        toUserId: adminId,
                        messageType: 'new_identified',
                        messageText
                    });
                } catch (err) {
                    console.error('Помилка відправки повідомлення адміну:', err);
                }
            }
        }
        setToast({ message: 'Ідентифікацію завершено. Очікуйте підтвердження адміністратором', type: 'success' });
    };

    if (!record) return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
            </div>
        </>
    );

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px] mb-[20px]">
                        {/* Блок 1: Інформація про інвентар */}
                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                            <div className="flex items-center gap-[10px] mb-[15px]">
                                <FileText className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                    Неідентифікований інвентар
                                </h2>
                            </div>

                            <div className="space-y-[10px]">
                                <InfoRow label="Шифр справи" value={record.case_signature} />
                                <InfoRow label="Архів" value={record.archive} />
                                <InfoRow label="Номер фонд" value={record.fonds} />
                                <InfoRow label="Номер опису" value={record.series} />
                                <InfoRow label="Номер справи" value={record.record} />
                                <InfoRow label="Назва справи" value={record.case_title} />
                                <InfoRow label="Рік складання" value={record.inventory_year} />
                                <InfoRow label="Примітки" value={record.notes} />
                                <InfoRow 
                                    label="Посилання на скани" 
                                    value={record.scans_url} 
                                    isLink 
                                />
                                <InfoRow 
                                    label="Статус інвентарю" 
                                    value={
                                        record.status === 'new' ? 'Очікує ідентифікації' :
                                        record.status === 'review' ? 'Обробляється адміністратором' :
                                        record.status === 'done' ? 'Оброблено' : '—'
                                    }
                                />
                            </div>
                        </section>

                        {/* Блок 2: Форма ідентифікації */}
                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                            <div className="flex justify-between items-center mb-[15px]">
                                <div className="flex items-center gap-[10px]">
                                    <MapPin className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                    <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                        {editingPointId ? 'Редагування точки' : 'Ідентифікація населених пунктів'}
                                    </h2>
                                </div>
                                {editingPointId && (
                                    <button
                                        onClick={cancelEdit}
                                        className="flex items-center gap-[8px] px-[12px] h-[36px] rounded bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
                                    >
                                        <X className="w-4 h-4" strokeWidth={2} />
                                        <span className="text-[13px] font-medium">Скасувати</span>
                                    </button>
                                )}
                            </div>

                            <div className="space-y-[15px]">
                                {/* Сучасний адміністративний поділ */}
                                <div>
                                    <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold mb-[10px]">
                                        Сучасний адміністративний поділ
                                    </h3>
                                    <div className="space-y-[10px]">
                                        <FormSelect
                                            name="current_region"
                                            value={formData.current_region}
                                            onChange={handleChange}
                                            placeholder="Оберіть область"
                                        >
                                            {nestedData && Object.keys(nestedData).map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </FormSelect>

                                        <FormSelect
                                            name="current_district"
                                            value={formData.current_district}
                                            onChange={handleChange}
                                            placeholder="Оберіть район"
                                            disabled={!districts.length}
                                        >
                                            {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                        </FormSelect>

                                        <FormSelect
                                            name="current_community"
                                            value={formData.current_community}
                                            onChange={handleChange}
                                            placeholder="Оберіть громаду"
                                            disabled={!communities.length}
                                        >
                                            {communities.map(c => <option key={c} value={c}>{c}</option>)}
                                        </FormSelect>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                                            <FormSelect
                                                name="current_settlement_type"
                                                value={formData.current_settlement_type}
                                                onChange={handleChange}
                                                placeholder="Тип населеного пункту"
                                                disabled={!settlementTypes.length}
                                            >
                                                {settlementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                            </FormSelect>

                                            <FormSelect
                                                name="current_settlement_name"
                                                value={formData.current_settlement_name}
                                                onChange={handleChange}
                                                placeholder="Населений пункт"
                                                disabled={!formData.current_settlement_type}
                                            >
                                                {settlements
                                                    .filter(s => s.type === formData.current_settlement_type)
                                                    .map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                                            </FormSelect>
                                        </div>

                                        <p className="text-gray-700 dark:text-white text-[13px] opacity-80">
                                            Якщо потрібного населеного пункту немає, ви можете{' '}
                                            <Link href="/add_settlement">
                                                <a className="text-[#2563EB] hover:text-[#1D4ED8] underline">
                                                    надіслати запит на його додавання
                                                </a>
                                            </Link>.
                                        </p>

                                        <p className="text-gray-700 dark:text-white text-[13px] opacity-80">
                                            Оберіть точку на карті, що стосується потрібного населеного пункту (Обов'язково)
                                        </p>

                                        <div className="rounded-lg overflow-hidden border border-gray-300 dark:border-[#374151]">
                                            <MapSelector
                                                latitude={formData.latitude}
                                                longitude={formData.longitude}
                                                onPositionChange={(lat, lng) =>
                                                    setFormData(fd => ({ ...fd, latitude: lat.toString(), longitude: lng.toString() }))
                                                }
                                            />
                                        </div>

                                        <FormSelect
                                            name="mark_type"
                                            value={formData.mark_type}
                                            onChange={handleChange}
                                            placeholder="Тип позначки"
                                        >
                                            <option value="1">Місце</option>
                                            <option value="0">Регіон</option>
                                        </FormSelect>
                                        <p className="text-gray-700 dark:text-white text-[13px] opacity-80">
                                            Обирайте "Місце" якщо точно знаєте, що інвентар стосується цього населеного пункту.
                                            Обирайте "Регіон" якщо не впевнені які села зустрічаються в інвентарі.
                                        </p>
                                    </div>
                                </div>

                                {/* Адміністративний поділ час складання */}
                                <div>
                                    <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold mb-[10px]">
                                        Історичний адміністративний поділ (станом на час складання інвентарю)
                                    </h3>
                                    <p className="text-gray-700 dark:text-white text-[13px] opacity-80 mb-[10px]">
                                        Заповнюйте лише ті значення, в яких точно впевнені. Вказуйте повну назву
                                    </p>
                                    <div className="space-y-[10px]">
                                        <FormInput
                                            name="old_province"
                                            value={formData.old_province}
                                            onChange={handleChange}
                                            placeholder="Воєводство (Губернія)"
                                        />
                                        <FormInput
                                            name="old_district"
                                            value={formData.old_district}
                                            onChange={handleChange}
                                            placeholder="Повіт"
                                        />
                                        <FormInput
                                            name="old_community"
                                            value={formData.old_community}
                                            onChange={handleChange}
                                            placeholder="Ключ (Староство)"
                                        />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                                            <FormSelect
                                                name="old_settlement_type"
                                                value={formData.old_settlement_type}
                                                onChange={handleChange}
                                                placeholder="Тип населеного пункту"
                                            >
                                                <option value="Місто">Місто</option>
                                                <option value="Містечко">Містечко</option>
                                                <option value="Село">Село</option>
                                            </FormSelect>
                                            <FormInput
                                                name="old_settlement_name"
                                                value={formData.old_settlement_name}
                                                onChange={handleChange}
                                                placeholder="Назва населеного пункту"
                                            />
                                        </div>

                                        <FormInput
                                            name="inventory_start_page"
                                            value={formData.inventory_start_page}
                                            onChange={handleChange}
                                            placeholder="Сторінка початку інвентарю"
                                        />

                                        <FormTextarea
                                            name="notes"
                                            value={formData.notes}
                                            onChange={handleChange}
                                            placeholder="Примітки"
                                        />

                                        <FormInput
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            placeholder="Email для зв'язку"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    className={`w-full flex items-center justify-center gap-[10px] px-[15px] h-[40px] rounded transition-colors ${
                                        editingPointId
                                            ? 'bg-[#EA580C] hover:bg-[#C2410C] text-white'
                                            : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                                    }`}
                                >
                                    <Save className="w-5 h-5" strokeWidth={2} />
                                    <span className="text-[14px] lg:text-[16px] font-medium">
                                        {editingPointId ? 'Оновити' : 'Додати точку'}
                                    </span>
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* Блок 3: Таблиця населених пунктів */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[10px]">
                            Населені пункти інвентарю
                        </h2>
                        <p className="text-gray-700 dark:text-white text-[13px] opacity-80 mb-[15px]">
                            Натисніть на рядок/картку, щоб відредагувати запис
                        </p>

                        {/* Desktop Table */}
                        <div className="hidden lg:block overflow-x-auto mb-[15px]">
                            {points.length > 0 ? (
                                <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-[2fr_2fr_1fr_1fr] border-b border-gray-300 dark:border-[#374151]">
                                        <TableHeader label="Сучасний адміністративний поділ" />
                                        <TableHeader label="Історичний адміністративний поділ" />
                                        <TableHeader label="Координати" />
                                        <TableHeader label="Сторінка початку" isLast />
                                    </div>

                                    {/* Table Body */}
                                    <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                        {points.map((p, index) => {
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
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleRowClick(p)}
                                                    className={`grid grid-cols-[2fr_2fr_1fr_1fr] cursor-pointer transition-colors ${
                                                        isEditing
                                                            ? 'bg-blue-100 dark:bg-blue-900'
                                                            : index % 2 === 0
                                                                ? ''
                                                                : 'bg-gray-50 dark:bg-[#1F2937]'
                                                    } hover:bg-gray-100 dark:hover:bg-[#374151]`}
                                                >
                                                    <TableCell>{fullLocationCurrent || '-'}</TableCell>
                                                    <TableCell>{fullLocationOld || '-'}</TableCell>
                                                    <TableCell>
                                                        {p.latitude && p.longitude ? (
                                                            <a
                                                                href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                Відкрити на мапі
                                                            </a>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell isLast>{p.inventory_start_page || '-'}</TableCell>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-[20px] text-center">
                                    <p className="text-gray-500 dark:text-gray-400 text-[14px]">
                                        Населені пункти ще не додані
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Mobile Cards */}
                        <div className="block lg:hidden space-y-4 mb-[15px]">
                            {points.length > 0 ? (
                                points.map((p) => {
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
                                            className={`p-[15px] border rounded-lg cursor-pointer transition ${
                                                isEditing
                                                    ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
                                                    : 'bg-white dark:bg-[#111827] border-gray-300 dark:border-[#374151] hover:bg-gray-50 dark:hover:bg-[#1F2937]'
                                            }`}
                                        >
                                            <div className="space-y-[10px]">
                                                <div>
                                                    <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-400 mb-[5px]">
                                                        Сучасний адміністративний поділ:
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {fullLocationCurrent || '-'}
                                                    </div>
                                                    {(p.current_settlement_type || p.current_settlement_name) && (
                                                        <div className="text-[13px] text-gray-900 dark:text-white mt-1">
                                                            {[p.current_settlement_type, p.current_settlement_name].filter(Boolean).join(' ')}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-400 mb-[5px]">
                                                        Історичний адміністративний поділ:
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {fullLocationOld || '-'}
                                                    </div>
                                                    {(p.old_settlement_type || p.old_settlement_name) && (
                                                        <div className="text-[13px] text-gray-900 dark:text-white mt-1">
                                                            {[p.old_settlement_type, p.old_settlement_name].filter(Boolean).join(' ')}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-400 mb-[5px]">
                                                        Координати:
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {p.latitude && p.longitude ? (
                                                            <a
                                                                href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[#2563EB] hover:text-[#1D4ED8] underline"
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
                                                    <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-400 mb-[5px]">
                                                        Сторінка початку інвентарю:
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {p.inventory_start_page || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-[20px] border border-gray-300 dark:border-[#374151] rounded-lg text-center">
                                    <p className="text-gray-500 dark:text-gray-400 text-[14px]">
                                        Населені пункти ще не додані
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={completeIdentification}
                                className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                            >
                                <Check className="w-5 h-5" strokeWidth={2} />
                                <span className="text-[14px] lg:text-[16px] font-medium">
                                    Завершити ідентифікацію
                                </span>
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {toast && (
                <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
            )}
        </>
    );
}

// Helper Components
function InfoRow({ label, value, isLink = false }: { label: string; value: any; isLink?: boolean }) {
    return (
        <div className="flex flex-col md:flex-row md:items-start gap-[5px] md:gap-[15px] pb-[10px] border-b border-gray-200 dark:border-[#374151] last:border-0">
            <div className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] font-semibold md:w-1/3">
                {label}
            </div>
            <div className="text-gray-900 dark:text-white text-[13px] lg:text-[14px] md:w-2/3">
                {isLink && value ? (
                    <a
                        href={value}
                        className="text-[#2563EB] hover:text-[#1D4ED8] underline break-all"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {value}
                    </a>
                ) : (
                    value || '—'
                )}
            </div>
        </div>
    );
}

function FormSelect({ name, value, onChange, placeholder, disabled, children }: any) {
    return (
        <div className="relative">
            <select
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <option value="">{placeholder}</option>
                {children}
            </select>
            <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
        </div>
    );
}

function FormInput({ name, value, onChange, placeholder }: any) {
    return (
        <input
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
        />
    );
}

function FormTextarea({ name, value, onChange, placeholder }: any) {
    return (
        <textarea
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={3}
            className="w-full px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
        />
    );
}

function TableHeader({ label, isLast = false }: { label: string; isLast?: boolean }) {
    return (
        <div className={`flex items-center justify-center gap-[5px] p-[10px] ${isLast ? '' : 'border-r border-gray-200 dark:border-[#374151]'} bg-gray-100 dark:bg-[#1F2937] min-h-[50px]`}>
            <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold text-center">{label}</span>
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
        </div>
    );
}

function TableCell({ children, isLast = false }: { children: React.ReactNode; isLast?: boolean }) {
    return (
        <div className={`flex items-center justify-center p-[10px] ${isLast ? '' : 'border-r border-gray-200 dark:border-[#374151]'} min-h-[50px]`}>
            <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px] text-center">{children}</span>
        </div>
    );
}
