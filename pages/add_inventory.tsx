import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import { supabase } from '../lib/supabaseClient';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';

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

    // При зміні current_settlement_name підставляємо координати
    // useEffect(() => {
    //     if (!manualEntry && formData.current_settlement_name) {
    //         const settlement = settlements.find((s) => s.name === formData.current_settlement_name);
    //         if (settlement) {
    //             setFormData((fd: any) => ({
    //                 ...fd,
    //                 latitude: settlement.lat !== null ? settlement.lat.toString() : '',
    //                 longitude: settlement.lon !== null ? settlement.lon.toString() : '',
    //             }));
    //         }
    //     }
    // }, [formData.current_settlement_name, settlements, manualEntry]);

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
            // усе добре, бо ми тримаємо поля ті ж
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
        const { data: existing } = await supabase
            .from('records')
            .select('id')
            .match({
                current_region: formData.current_region,
                current_district: formData.current_district,
                current_community: formData.current_community,
                current_settlement_type: formData.current_settlement_type,
                current_settlement_name: formData.current_settlement_name,
                case_signature: formData.case_signature,
                inventory_year: formData.inventory_year,
            })
            .maybeSingle();

        if (existing) {
            setDuplicateUrl(`/records/${existing.id}`);
            setToast({ message: `Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів`, type: 'error' });
            return;
        }

        // Додаткова перевірка в таблиці records_unverified
        const { data: unverifiedExisting } = await supabase
            .from('records_unverified')
            .select('id')
            .match({
                current_region: formData.current_region,
                current_district: formData.current_district,
                current_community: formData.current_community,
                current_settlement_type: formData.current_settlement_type,
                current_settlement_name: formData.current_settlement_name,
                case_signature: formData.case_signature,
                inventory_year: formData.inventory_year,
            })
            .maybeSingle();

        if (unverifiedExisting) {
            setToast({ message: `Такий інвентар уже надіслано на перевірку. Зачекайте доки адміністратор проекту Inventarium опрацює його і запис з'явиться в реєстрі інвентарів`, type: 'error' });
            return;
        }


        const toInsert = {
            ...formData,
            latitude: parseFloat(formData.latitude),
            longitude: parseFloat(formData.longitude),
            mark_type: parseInt(formData.mark_type),
        };

        const { error: insertError } = await supabase.from('records_unverified').insert([toInsert]);

        if (insertError) {
            setError('Помилка збереження даних');
            setToast({ message: 'Помилка збереження даних', type: 'error' });
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">Зверніть увагу, доданий вами інвентар буде опубліковано в реєстрі лише після перевірки адміністратором!</p>

                    {duplicateUrl && (
                        <p className="text-yellow-600 mb-4">
                            Такий інвентар уже існує.{' '}
                            <a href={duplicateUrl} className="underline">
                                Переглянути
                            </a>
                        </p>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Блок 1: Сучасний адміністративний поділ */}
                        <section className="space-y-4">
                            <h2 className="text-xl font-semibold">Сучасний адміністративний поділ</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Всі поля є обов'язкові</p>

                            {!manualEntry ? (
                                <>
                                    <select
                                        name="current_region"
                                        value={formData.current_region}
                                        onChange={handleChange}
                                        className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                    >
                                        <option value="">Оберіть область</option>
                                        {nestedData &&
                                            Object.keys(nestedData).map((region) => (
                                                <option key={region} value={region}>
                                                    {region}
                                                </option>
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
                                        {districts.map((district) => (
                                            <option key={district} value={district}>
                                                {district}
                                            </option>
                                        ))}
                                    </select>

                                    <select
                                        name="current_community"
                                        value={formData.current_community}
                                        onChange={handleChange}
                                        disabled={!communities.length}
                                        className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                                    >
                                        <option value="">Оберіть ОТГ</option>
                                        {communities.map((comm) => (
                                            <option key={comm} value={comm}>
                                                {comm}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="flex gap-4 flex-wrap mb-4">
                                        <select
                                            name="current_settlement_type"
                                            value={formData.current_settlement_type}
                                            onChange={handleChange}
                                            disabled={!settlementTypes.length}
                                            className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        >
                                            <option value="">Оберіть тип населеного пункту</option>
                                            {settlementTypes.map((type) => (
                                                <option key={type} value={type}>
                                                    {type}
                                                </option>
                                            ))}
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
                                                .filter((s) => s.type === formData.current_settlement_type)
                                                .map((s) => (
                                                    <option key={s.code} value={s.name}>
                                                        {s.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                </>
                            ) : (
                                <>
                                    {/* Ручний ввід */}
                                    <div className="flex flex-col gap-4 mb-4">
                                        <input
                                            name="current_region"
                                            value={formData.current_region}
                                            onChange={handleChange}
                                            placeholder="Область"
                                            className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        />
                                        <input
                                            name="current_district"
                                            value={formData.current_district}
                                            onChange={handleChange}
                                            placeholder="Район"
                                            className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        />
                                        <input
                                            name="current_community"
                                            value={formData.current_community}
                                            onChange={handleChange}
                                            placeholder="ОТГ"
                                            className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        />
                                    </div>

                                    {/* Тип населеного пункту і назва поруч */}
                                    <div className="flex gap-4 flex-wrap mb-4">
                                        <select
                                            name="current_settlement_type"
                                            value={formData.current_settlement_type}
                                            onChange={handleChange}
                                            className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        >
                                            <option value="">Тип населеного пункту</option>
                                            <option value="Місто">Місто</option>
                                            <option value="Село">Село</option>
                                        </select>
                                        <input
                                            name="current_settlement_name"
                                            value={formData.current_settlement_name}
                                            onChange={handleChange}
                                            placeholder="Назва населеного пункту"
                                            className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                        />
                                    </div>

                                </>
                            )}
                            <label className="inline-flex items-center space-x-2 mb-2">
                                <input
                                    type="checkbox"
                                    name="manualEntry"
                                    checked={manualEntry}
                                    onChange={handleChange}
                                />
                                <span>Населеного пункту нема в списку</span>
                            </label>

                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Оберіть точку на карті, що стосується потрібного населеного пункту (Обов'язково)
                            </p>
                            <MapSelector
                                latitude={formData.latitude}
                                longitude={formData.longitude}
                                onChange={(lat, lng) =>
                                    setFormData((fd: any) => ({
                                        ...fd,
                                        latitude: lat.toString(),
                                        longitude: lng.toString(),
                                    }))
                                }
                            />
                        </section>

                        {/* Блок 2: Адміністративний поділ час складання */}
                        <section className="space-y-4">
                            <h2 className="text-xl font-semibold">Адміністративний поділ станом на час складання інвентаря</h2>
                            <br />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Заповнюєте лише ті значення, в яких точно впевнені. Вказуйте повну назву, наприклад "Київське воєводство" замість "Київське"</p>
                            <div className="flex flex-col gap-4">
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

                            {/* В один рядок */}
                            <div className="flex gap-4 flex-wrap">
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
                        </section>

                        {/* Блок 3: Архівна справа */}
                        <section className="space-y-4">
                            <br />
                            <h2 className="text-xl font-semibold">Інформація про архівну справу</h2>
                            <div>
                                <label className="block mb-1">Справа знаходиться в українському архіві?</label>
                                <select
                                    name="is_ukrainian_archive"
                                    value={formData.is_ukrainian_archive}
                                    onChange={handleChange}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                >
                                    <option value="Так">Так</option>
                                    <option value="Ні">Ні</option>
                                </select>
                            </div>

                            {formData.is_ukrainian_archive === 'Так' ? (
                                <div className="flex flex-col gap-4">
                                    <input
                                        name="archive"
                                        value={formData.archive}
                                        onChange={handleChange}
                                        placeholder="Назва архіву"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                    <input
                                        name="fonds"
                                        value={formData.fonds}
                                        onChange={handleChange}
                                        placeholder="Номер фонду"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                    <input
                                        name="series"
                                        value={formData.series}
                                        onChange={handleChange}
                                        placeholder="Опис"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                    <input
                                        name="record"
                                        value={formData.record}
                                        onChange={handleChange}
                                        placeholder="Справа"
                                        className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                    />
                                </div>
                            ) : (
                                <input
                                    name="case_signature"
                                    value={formData.case_signature}
                                    onChange={handleChange}
                                    placeholder="Шифр справи"
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                            )}

                            <input
                                name="case_title"
                                value={formData.case_title}
                                onChange={handleChange}
                                placeholder="Назва справи"
                                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                            />
                            <div className="flex gap-4 flex-wrap">
                                <input
                                    name="case_date"
                                    value={formData.case_date}
                                    onChange={handleChange}
                                    placeholder="Дати справи"
                                    className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                                <input
                                    name="pages_count"
                                    value={formData.pages_count}
                                    onChange={handleChange}
                                    placeholder="Кількість сторінок справи"
                                    className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                            </div>
                            <br />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Заповнюєте це поле якащо ЦЯ Ж справа знаходиться, ще в одному архіві (бібліотеці) Наприклад основна справа "ЦДІАК 1-2-3" Додаткова справа AGAD 10\20\30\40 </p>
                            <input
                                name="additional_case_signature"
                                value={formData.additional_case_signature}
                                onChange={handleChange}
                                placeholder="Шифр додаткової справи (якщо є)"
                                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                            />
                        </section>

                        {/* Блок 4: Інформація про інвентар */}
                        <section className="space-y-4">
                            <br />
                            <h2 className="text-xl font-semibold">Інформація про інвентар</h2>
                            <div className="flex gap-4 flex-wrap">
                                <input
                                    name="inventory_year"
                                    value={formData.inventory_year}
                                    onChange={handleChange}
                                    placeholder="Рік складання інвентаря (напр. 1750)"
                                    className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                                <input
                                    name="inventory_start_page"
                                    value={formData.inventory_start_page}
                                    onChange={handleChange}
                                    placeholder="Сторінка початку інвентаря"
                                    className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                />
                            </div>
                            <br />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Обирайте "Місце" якщо точно знаєте, що інвентар стосується цього населеного пункту" (Наприклад назва справи "Інвентар села Калинівка" \ Обирайте "Регіон" якщо не впевнені які села зустрічаються в інвентарі. (Наприклад "Назва справи "Інвентар Білопільського ключа"</p>
                            <select
                                name="mark_type"
                                value={formData.mark_type}
                                onChange={handleChange}
                                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                            >
                                <option value="">Тип позначки</option>
                                <option value="1">Місце</option>
                                <option value="2">Регіон</option>
                            </select>
                            <input
                                name="scans_url"
                                value={formData.scans_url}
                                onChange={handleChange}
                                placeholder="Посилання на скани справи"
                                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                            />
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                placeholder="Примітки"
                                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                                rows={3}
                            />
                        </section>

                        <input
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="Email для зв'язку"
                            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                        />
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded">
                            Зберегти
                        </button>
                    </form>
                </div>
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}
