// pages/add_settlement.tsx
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/header';
import Toast from '../components/Toast';
import emailjs from 'emailjs-com';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

interface Settlement {
    name: string;
    code: string;
    type: string;
    lat: number;
    lon: number;
}

interface NestedStructure {
    [region: string]: {
        [district: string]: {
            [community: string]: Settlement[];
        };
    };
}

export default function AddSettlementPage() {
    const [regionStructure, setRegionStructure] = useState<NestedStructure | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [addedSettlements, setAddedSettlements] = useState<typeof formData[]>([]);

    const [formData, setFormData] = useState({
        region: '',
        district: '',
        community: '',
        settlementType: '',
        settlementName: '',
        settlementCode: '',
        latitude: '',
        longitude: '',
        email: '',
        comment: '',
        isNonExistent: false,
    });

    const [districts, setDistricts] = useState<string[]>([]);
    const [communities, setCommunities] = useState<string[]>([]);
    const [settlementTypes, setSettlementTypes] = useState<string[]>([]);

    // ==== 1. Завантаження даних через fetch ====
    useEffect(() => {
        fetch('/data/region_structure.json')
            .then(res => res.json())
            .then((json: NestedStructure) => setRegionStructure(json))
            .catch(err => console.error('Failed to load region_structure.json', err));
    }, []);

    // ==== Каскадне оновлення select ====
    useEffect(() => {
        if (formData.region && regionStructure?.[formData.region]) {
            setDistricts(Object.keys(regionStructure[formData.region]));
        } else {
            setDistricts([]);
        }
        setFormData(prev => ({ ...prev, district: '', community: '' }));
        setCommunities([]);
    }, [formData.region, regionStructure]);

    useEffect(() => {
        if (
            formData.region &&
            formData.district &&
            regionStructure?.[formData.region]?.[formData.district]
        ) {
            setCommunities(Object.keys(regionStructure[formData.region][formData.district]));
        } else {
            setCommunities([]);
        }
        setFormData(prev => ({ ...prev, community: '' }));
    }, [formData.district, formData.region, regionStructure]);

    useEffect(() => {
        if (
            formData.region &&
            formData.district &&
            formData.community &&
            regionStructure?.[formData.region]?.[formData.district]?.[formData.community]
        ) {
            const communityData = regionStructure[formData.region][formData.district][formData.community];
            setSettlementTypes(Array.from(new Set(communityData.map(s => s.type))));
        } else {
            setSettlementTypes([]);
        }
        setFormData(prev => ({ ...prev, settlementType: '' }));
    }, [formData.community, formData.district, formData.region, regionStructure]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleRemove = (index: number) => {
        setAddedSettlements(prev => prev.filter((_, idx) => idx !== index));
    };

    // ==== Додавання нового населеного пункту ====
    const handleSubmit = () => {
        if (
            !formData.region ||
            !formData.district ||
            !formData.community ||
            !formData.settlementType ||
            !formData.settlementName ||
            !formData.latitude ||
            !formData.longitude
        ) {
            setToast({ message: 'Будь ласка, заповніть усі поля', type: 'error' });
            return;
        }

        const cyrillicRegex = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґʼ'\s\-—]+$/u;
        if (formData.settlementName && !cyrillicRegex.test(formData.settlementName.trim())) {
            setToast({
                message: 'Поле "Назва населеного пункту" може містити лише кириличні символи, дефіс та пробіл.',
                type: 'error'
            });
            return;
        }

        // Перевірка дубліката
        const exists = regionStructure?.[formData.region]?.[formData.district]?.[formData.community]?.some(
            s => s.name.toLowerCase() === formData.settlementName.toLowerCase() && s.type === formData.settlementType
        );

        if (exists) {
            setToast({ message: 'Такий населений пункт уже існує', type: 'error' });
            return;
        }

        // Генерація коду (тут просто умовно)
        const newCode = 'GNRT' + Math.floor(Math.random() * 1e8).toString().padStart(8, '0');

        // Додаємо у локальну структуру
        if (!regionStructure) return;
        const updatedStructure = { ...regionStructure };
        if (!updatedStructure[formData.region][formData.district][formData.community]) {
            updatedStructure[formData.region][formData.district][formData.community] = [];
        }

        updatedStructure[formData.region][formData.district][formData.community].push({
            name: formData.settlementName,
            code: newCode,
            type: formData.settlementType,
            lat: parseFloat(formData.latitude),
            lon: parseFloat(formData.longitude),
        });

        setRegionStructure(updatedStructure);

        // ==== 2. Додаємо запис у таблицю під картою ====
        setAddedSettlements(prev => [...prev, { ...formData }]);

        setToast({ message: 'Населений пункт додано', type: 'success' });

        setFormData((prev) => ({
            ...prev,
            region: '',
            district: '',
            community: '',
            settlementType: '',
            settlementName: '',
            latitude: '',
            longitude: '',
            comment: '',
            isNonExistent: false,
        }));

    }
    const handleSend = async () => {
        // 1. Перевірка email
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setToast({ message: 'Будь ласка, введіть коректний email.', type: 'error' });
            return;
        }

        // 2. Беремо готову структуру (з усіма доданими пунктами)
        if (addedSettlements.length === 0) {
            setToast({ message: 'Немає нових населених пунктів для відправки.', type: 'error' });
            return;
        }

        // Формуємо структуру тільки з нових пунктів
        const payload: NestedStructure = {};
        const settlements: any[] = [];

        addedSettlements.forEach(s => {
            if (!payload[s.region]) payload[s.region] = {};
            if (!payload[s.region][s.district]) payload[s.region][s.district] = {};
            if (!payload[s.region][s.district][s.community]) payload[s.region][s.district][s.community] = [];

            payload[s.region][s.district][s.community].push({
                name: s.settlementName,
                code: s.settlementCode,
                type: s.settlementType,
                lat: parseFloat(s.latitude),
                lon: parseFloat(s.longitude),
            });

            // Зберігаємо також додаткову інформацію
            settlements.push({
                region: s.region,
                district: s.district,
                community: s.community,
                name: s.settlementName,
                type: s.settlementType,
                lat: s.latitude,
                lon: s.longitude,
                comment: s.comment || '',
                isNonExistent: s.isNonExistent || false,
            });
        });

        setToast({ message: 'Зачекайте, дані відправляються...', type: 'success' });
        try {
            await emailjs.send(
                'service_kdqzv9e',       // service ID
                'template_qdlf2p8',      // template ID
                {
                    email: formData.email,
                    json: JSON.stringify(payload, null, 2),
                    settlements: JSON.stringify(settlements, null, 2),
                },
                'WBCc_TP1lGiy8DVtF'      // public key
            );

            setToast({ message: 'Ваші дані відправлено і буде перевірено адміністратором.', type: 'success' });

            // очищаємо форму (крім email)
            setFormData(prev => ({
                ...prev,
                region: '',
                district: '',
                community: '',
                settlementType: '',
                settlementName: '',
                latitude: '',
                longitude: '',
                email: '',
                comment: '',
                isNonExistent: false,
            }));
            setAddedSettlements([]); // чистимо таблицю


        } catch (err: any) {
            console.error('Помилка при надсиланні:', err);
            if (err.text) console.error('Текст помилки EmailJS:', err.text);
            if (err.status) console.error('Статус:', err.status);
            setToast({ message: 'Сталася помилка під час відправки даних.', type: 'error' });
        }

    };




    return (
        <>
            <Header />
            <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="max-w-screen-lg mx-auto flex flex-col gap-6">
                    <h1 className="text-2xl font-bold mb-4">Додати населений пункт</h1>

                     <div className="w-full max-w-[1000px] mx-auto mb-4">
                            <p className="text-base font-semibold text-yellow-700 dark:text-yellow-400">
                                ⚠️ Зверніть увагу: Ви повинні додати потрібні населені пункти вибираючи адмін поділ з випадаючих списків, заповнюючи назву і обираючи на карті локацію. 
                                Ви можете додати стільки населених пунктів скільки потрібно, після цього ввести свій email і відправити на перевірку адміністратору.
                                Додані, але не відправлені на перевірку пункти не будуть оброблені!
                            </p>
                        </div>

                    {/* Каскадні select */}
                    <select name="region" value={formData.region} onChange={handleChange} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Область</option>
                        {regionStructure && Object.keys(regionStructure).map(r => <option key={r} value={r}>{r}</option>)}

                    </select>

                    <select name="district" value={formData.district} onChange={handleChange} disabled={!districts.length} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Район</option>
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <select name="community" value={formData.community} onChange={handleChange} disabled={!communities.length} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Громада</option>
                        {communities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select name="settlementType" value={formData.settlementType} onChange={handleChange} disabled={!settlementTypes.length} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Тип населеного пункту</option>
                        {settlementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <input type="text" name="settlementName" placeholder="Назва населеного пункту" value={formData.settlementName} onChange={handleChange} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />

                    {/* Нові поля */}
                    <textarea 
                        name="comment" 
                        placeholder="Коментар (необов'язково)" 
                        value={formData.comment} 
                        onChange={handleChange} 
                        rows={3}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            name="isNonExistent" 
                            checked={formData.isNonExistent} 
                            onChange={handleChange}
                            className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">Неіснуючий населений пункт</span>
                    </label>

                    {/* Карта */}
                    <MapSelector latitude={formData.latitude} longitude={formData.longitude} onPositionChange={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))} />
                    <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded transition">Додати</button>

                    {/* --- Таблиця для ПК --- */}                    
                    <div className="mt-6 w-full overflow-x-auto border rounded shadow hidden sm:block">                    
                        <table className="w-full min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Область</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Район</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Громада</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Назва населеного пункту</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Тип</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Широта</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Довгота</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Коментар</th>
                                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">Неіснуючий</th>
                                    <th className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">Дія</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {addedSettlements.map((s, idx) => (
                                    <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.region}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.district}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.community}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.settlementName}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.settlementType}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.latitude}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.longitude}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.comment || '-'}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{s.isNonExistent ? 'Так' : 'Ні'}</td>
                                        <td className="px-4 py-2">
                                            <button
                                                onClick={() => handleRemove(idx)}
                                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1 rounded transition"
                                            >
                                                Видалити
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* --- Мобільна версія: картки --- */}
                    <div className="block sm:hidden space-y-4 mt-4">
                        {addedSettlements.map((s, idx) => (
                            <div key={idx} className="border rounded p-3 bg-white dark:bg-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                <div className="text-sm font-medium">{s.region}</div>
                                <div className="text-sm font-medium">{s.district}</div>
                                <div className="text-sm font-medium">{s.community}</div>
                                <div className="text-sm font-medium">{s.settlementType}, {s.settlementName}</div>
                                <div className="text-xs">Координати: {s.latitude}, {s.longitude}</div>
                                {s.comment && <div className="text-xs mt-1">Коментар: {s.comment}</div>}
                                {s.isNonExistent && <div className="text-xs mt-1 text-red-600 dark:text-red-400">⚠️ Неіснуючий населений пункт</div>}
                                <button
                                    onClick={() => handleRemove(idx)}
                                    className="mt-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1 rounded transition"
                                >
                                    Видалити
                                </button>
                            </div>
                        ))}
                    </div>


                    <input type="text" name="email" placeholder="Ваш E-mail" value={formData.email} onChange={handleChange} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-3 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded transition">Відправити на перевірку</button>
                </div>
                {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} duration={4000} />}
            </main>
        </>
    );
}