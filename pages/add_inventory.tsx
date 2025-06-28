import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import { supabase } from '../lib/supabaseClient';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
    ssr: false,
});

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

type Settlement = {
    name: string;
    code: string;
    type: string;
    lat: number | null;
    lon: number | null;
};

type NestedStructure = {
    [region: string]: {
        [district: string]: {
            [community: string]: Settlement[];
        };
    };
};

export default function AddInventoryPage() {
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    // Дані з JSON
    const [nestedData, setNestedData] = useState<NestedStructure | null>(null);

    // Для каскадних списків
    const [districts, setDistricts] = useState<string[]>([]);
    const [communities, setCommunities] = useState<string[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [settlementTypes, setSettlementTypes] = useState<string[]>([]); // Витягнемо унікальні типи поселень для вибраного ОТГ

    // Перемикач для ручного вводу
    const [manualEntry, setManualEntry] = useState(false);

    const [formData, setFormData] = useState<any>({
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
        additional_case_signature: '',
        case_title: '',
        case_date: '',
        pages_count: '',
        inventory_year: '',
        inventory_start_page: '',
        mark_type: '',
        scans_url: '',
        notes: '',
        email: '',
    });



    // Завантажуємо region_structure.json при монтуванні
    useEffect(() => {
        async function fetchNestedData() {
            try {
                const res = await fetch('/data/region_structure.json');
                if (!res.ok) throw new Error('Не вдалось завантажити структуру');
                const data: NestedStructure = await res.json();
                setNestedData(data);
            } catch (e) {
                console.error('Error loading nested structure:', e);
            }
        }
        fetchNestedData();
    }, []);

    // Оновлюємо districts при зміні current_region
    useEffect(() => {
        if (nestedData && formData.current_region && !manualEntry) {
            const regionData = nestedData[formData.current_region];
            if (regionData) {
                const dists = Object.keys(regionData);
                setDistricts(dists);
            } else {
                setDistricts([]);
            }
            // Очищаємо нижчі рівні
            setFormData((fd: any) => ({
                ...fd,
                current_district: '',
                current_community: '',
                current_settlement_type: '',
                current_settlement_name: '',
                latitude: '',
                longitude: '',
            }));
            setCommunities([]);
            setSettlements([]);
            setSettlementTypes([]);
        }
    }, [formData.current_region, nestedData, manualEntry]);

    // Оновлюємо communities при зміні current_district
    useEffect(() => {
        if (
            nestedData &&
            formData.current_region &&
            formData.current_district &&
            !manualEntry
        ) {
            const communitiesData = nestedData[formData.current_region]?.[formData.current_district];
            if (communitiesData) {
                const comms = Object.keys(communitiesData);
                setCommunities(comms);
            } else {
                setCommunities([]);
            }
            // Очищаємо нижчі рівні
            setFormData((fd: any) => ({
                ...fd,
                current_community: '',
                current_settlement_type: '',
                current_settlement_name: '',
                latitude: '',
                longitude: '',
            }));
            setSettlements([]);
            setSettlementTypes([]);
        }
    }, [formData.current_district, formData.current_region, nestedData, manualEntry]);

    // Оновлюємо settlements при зміні current_community
    useEffect(() => {
        if (
            nestedData &&
            formData.current_region &&
            formData.current_district &&
            formData.current_community &&
            !manualEntry
        ) {
            const settlementsData =
                nestedData[formData.current_region]?.[formData.current_district]?.[formData.current_community];
            if (settlementsData) {
                setSettlements(settlementsData);
                // Визначаємо унікальні типи населених пунктів
                const types = Array.from(new Set(settlementsData.map((s) => s.type)));
                setSettlementTypes(types);
            } else {
                setSettlements([]);
                setSettlementTypes([]);
            }
            // Очищаємо вибір типу і назви населеного пункту
            setFormData((fd: any) => ({
                ...fd,
                current_settlement_type: '',
                current_settlement_name: '',
                //latitude: '',
                //longitude: '',
            }));
        }
    }, [formData.current_community, formData.current_district, formData.current_region, nestedData, manualEntry]);

    // Оновлюємо current_settlement_name при зміні типу, щоб очистити непотрібні значення
    useEffect(() => {
        if (!manualEntry && formData.current_settlement_type) {
            // Фільтруємо settlements за типом, якщо тип вибрано, і якщо вибрана назва не відповідає типу — очищуємо її
            const filtered = settlements.filter((s) => s.type === formData.current_settlement_type);
            if (!filtered.some((s) => s.name === formData.current_settlement_name)) {
                setFormData((fd: any) => ({ ...fd, current_settlement_name: '' }));
            }
        }
    }, [formData.current_settlement_type, settlements, formData.current_settlement_name, manualEntry]);

    // Обробка зміни форми
    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type, checked } = e.target as any;

        // Якщо змінюємо manualEntry (checkbox)
        if (name === 'manualEntry') {
            setManualEntry(checked);
            if (checked) {
                // Очистити каскадні значення щоб не було конфлікту
                setFormData((fd: any) => ({
                    ...fd,
                    current_region: '',
                    current_district: '',
                    current_community: '',
                    current_settlement_type: '',
                    current_settlement_name: '',
                    latitude: '',
                    longitude: '',
                }));
                // Очистити списки
                setDistricts([]);
                setCommunities([]);
                setSettlements([]);
                setSettlementTypes([]);
            } else {
                // При відключенні manualEntry — можна очистити координати (або ні, за бажанням)
                setFormData((fd: any) => ({
                    ...fd,
                    latitude: '',
                    longitude: '',
                }));
            }
            return;
        }

        // Оновлюємо звичайні поля
        const updated = { ...formData, [name]: value };

        // Формуємо case_signature, якщо потрібно
        if (
            updated.is_ukrainian_archive === 'Так' &&
            updated.archive &&
            updated.fonds &&
            updated.series &&
            updated.record
        ) {
            updated.case_signature = `${updated.archive} ${updated.fonds}-${updated.series}-${updated.record}`;
        }

        setFormData(updated);
    };

    const validate = () => {
        const requiredFields = [
            'current_region',
            'current_district',
            'current_community',
            'current_settlement_type',
            'current_settlement_name',
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
        };

        // Якщо ручний ввід — перевіряємо ці ж поля, просто заповнені в інпутах
        if (manualEntry) {

        }

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
        if (formData.inventory_year && (isNaN(year) || year < 1500 || year > 2000)) {
            return 'Поле "inventory_year" має бути числом від 1500 до 2000';
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
                return 'Поле "Сторінка початку інвентаря" має бути числом більшим за 0.';
            }
        }


        return null;
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
            return;
        }

        const matchQuery: Record<string, any> = {
            current_region: formData.current_region,
            current_district: formData.current_district,
            current_community: formData.current_community,
            current_settlement_type: formData.current_settlement_type,
            current_settlement_name: formData.current_settlement_name,
            case_signature: formData.case_signature,
        };

        if (formData.inventory_year) {
            matchQuery.inventory_year = formData.inventory_year;
        }

        const { data: existing } = await supabase
            .from('records')
            .select('id')
            .match(matchQuery)
            .maybeSingle();

        if (existing) {
            setDuplicateUrl(`/records/${existing.id}`);
            setToast({ message: `Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів`, type: 'error' });
            return;
        }

        const { data: unverifiedExisting } = await supabase
            .from('records_unverified')
            .select('id')
            .match(matchQuery)
            .maybeSingle();

        if (unverifiedExisting) {
            setToast({ message: `Такий інвентар уже надіслано на перевірку. Зачекайте доки адміністратор проекту Inventarium опрацює його і запис з'явиться в реєстрі інвентарів`, type: 'error' });
            return;
        }

        console.log('To insert: ПОЧАТОК');
        const toInsert = {
            ...formData,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            mark_type: formData.mark_type ? parseInt(formData.mark_type) : null,
            pages_count: formData.pages_count ? parseInt(formData.pages_count) : null,
            inventory_start_page: formData.inventory_start_page ? parseInt(formData.inventory_start_page) : null,
            inventory_year: formData.inventory_year ? parseInt(formData.inventory_year) : null,
        };

        console.log('To insert:', toInsert);
        const { error: insertError } = await supabase.from('records_unverified').insert([toInsert]);

        if (insertError) {
            setError('Помилка збереження даних');
            setToast({ message: 'Помилка збереження даних: ' + insertError, type: 'error' });
        } else {
            setSuccess(true);
            setToast({ message: 'Інвентар успішно додано до перевірки.', type: 'success' });
        }
    };

    const [error, setError] = useState<string | null>(null);
    const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    return (
        <>
            <Header />
            <main className="p-6 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
                <div className="max-w-2xl w-full">
                    <h1 className="text-2xl font-bold mb-6">Додати до реєстру новий інвентар інвентар</h1>

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Перед додаванням інвентаря,{' '}
                        <a
                            href="https://telegra.ph/%D0%86nstrukc%D1%96ya-po-robot%D1%96-z-%D0%86nventar%D1%96um-06-27"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-blue-600 dark:hover:text-blue-400"
                        >
                            ознайомтеся з інструкцією
                        </a>.
                    </p>
                    <EditableInventoryForm data={formData} onChange={setFormData} />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Зверніть увагу, доданий вами інвентар буде опубліковано в реєстрі лише після перевірки адміністратором!</p>

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
