import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/header';
import Toast from '../components/Toast';
import emailjs from 'emailjs-com';
import { ChevronDown, Plus, Send, AlertTriangle, Trash2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import {
    fetchRegionStructure, listCountries, listRegions, listDistricts, listCommunities,
    listSettlements, type NestedStructure, type Settlement,
} from '../components/keys/regionData';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

export default function AddSettlementPage() {
    const { user, loading: userLoading } = useUser();
    const [regionStructure, setRegionStructure] = useState<NestedStructure | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [addedSettlements, setAddedSettlements] = useState<typeof formData[]>([]);

    const [formData, setFormData] = useState({
        country: '',
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

    const [regions, setRegions] = useState<string[]>([]);
    const [districts, setDistricts] = useState<string[]>([]);
    const [communities, setCommunities] = useState<string[]>([]);
    const [settlementTypes, setSettlementTypes] = useState<string[]>([]);

    useEffect(() => {
        fetchRegionStructure()
            .then(json => setRegionStructure(json))
            .catch(err => console.error('Failed to load region_structure.json', err));
    }, []);

    // Підтягування email користувача
    useEffect(() => {
        if (!userLoading && user?.email && !formData.email) {
            setFormData(prev => ({ ...prev, email: user.email }));
        }
    }, [user, userLoading]);

    useEffect(() => {
        setRegions(listRegions(regionStructure, formData.country));
        setDistricts([]);
        setCommunities([]);
        setFormData(prev => ({ ...prev, region: '', district: '', community: '' }));
    }, [formData.country, regionStructure]);

    useEffect(() => {
        setDistricts(listDistricts(regionStructure, formData.country, formData.region));
        setCommunities([]);
        setFormData(prev => ({ ...prev, district: '', community: '' }));
    }, [formData.region, formData.country, regionStructure]);

    useEffect(() => {
        setCommunities(listCommunities(
            regionStructure, formData.country, formData.region, formData.district,
        ));
        setFormData(prev => ({ ...prev, community: '' }));
    }, [formData.district, formData.region, formData.country, regionStructure]);

    useEffect(() => {
        const communityData = listSettlements(
            regionStructure, formData.country, formData.region, formData.district, formData.community,
        );
        setSettlementTypes(Array.from(new Set(communityData.map(s => s.type))));
        setFormData(prev => ({ ...prev, settlementType: '' }));
    }, [formData.community, formData.district, formData.region, formData.country, regionStructure]);

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

        const exists = listSettlements(
            regionStructure, formData.country, formData.region, formData.district, formData.community,
        ).some(
            s => s.name.toLowerCase() === formData.settlementName.toLowerCase() && s.type === formData.settlementType
        );

        if (exists) {
            setToast({ message: 'Такий населений пункт уже існує', type: 'error' });
            return;
        }

        const newCode = 'GNRT' + Math.floor(Math.random() * 1e8).toString().padStart(8, '0');

        if (!regionStructure) return;
        const { country, region, district, community } = formData;
        const updatedStructure: NestedStructure = { ...regionStructure };
        updatedStructure[country] = { ...updatedStructure[country] };
        updatedStructure[country][region] = { ...updatedStructure[country][region] };
        updatedStructure[country][region][district] = { ...updatedStructure[country][region][district] };
        updatedStructure[country][region][district][community] = [
            ...(updatedStructure[country][region][district][community] ?? []),
            {
                name: formData.settlementName,
                code: newCode,
                type: formData.settlementType,
                lat: parseFloat(formData.latitude),
                lon: parseFloat(formData.longitude),
            },
        ];

        setRegionStructure(updatedStructure);
        setAddedSettlements(prev => [...prev, { ...formData, settlementCode: newCode }]);
        setToast({ message: 'Населений пункт додано', type: 'success' });

        setFormData((prev) => ({
            ...prev,
            country: '',
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
    };

    const handleSend = async () => {
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setToast({ message: 'Будь ласка, введіть коректний email.', type: 'error' });
            return;
        }

        if (addedSettlements.length === 0) {
            setToast({ message: 'Немає нових населених пунктів для відправки.', type: 'error' });
            return;
        }

        const payload: NestedStructure = {};
        const settlements: any[] = [];

        addedSettlements.forEach(s => {
            if (!payload[s.country]) payload[s.country] = {};
            if (!payload[s.country][s.region]) payload[s.country][s.region] = {};
            if (!payload[s.country][s.region][s.district]) payload[s.country][s.region][s.district] = {};
            if (!payload[s.country][s.region][s.district][s.community]) {
                payload[s.country][s.region][s.district][s.community] = [];
            }

            payload[s.country][s.region][s.district][s.community].push({
                name: s.settlementName,
                code: s.settlementCode,
                type: s.settlementType,
                lat: parseFloat(s.latitude),
                lon: parseFloat(s.longitude),
            });

            settlements.push({
                country: s.country,
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
                'service_kdqzv9e',
                'template_qdlf2p8',
                {
                    email: formData.email,
                    json: JSON.stringify(payload, null, 2),
                    settlements: JSON.stringify(settlements, null, 2),
                },
                'WBCc_TP1lGiy8DVtF'
            );

            setToast({ message: 'Ваші дані відправлено і буде перевірено адміністратором.', type: 'success' });

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
            setAddedSettlements([]);

        } catch (err: any) {
            console.error('Помилка при надсиланні:', err);
            setToast({ message: 'Сталася помилка під час відправки даних.', type: 'error' });
        }
    };

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                        Додати населений пункт
                    </h1>

                    <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[30px]">
                        Додайте населений пункт, який відсутній у базі
                    </p>

                    {/* Warning Banner */}
                    <div className="flex items-start gap-[10px] p-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308] mb-[20px]">
                        <AlertTriangle className="w-4 h-4 text-[#92400E] dark:text-[#451A03] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                        <p className="text-[#92400E] dark:text-[#451A03] text-[14px] lg:text-[16px] font-medium">
                            Ви повинні додати потрібні населені пункти вибираючи адмін поділ з випадаючих списків, заповнюючи назву і обираючи на карті локацію. 
                            Ви можете додати стільки населених пунктів скільки потрібно, після цього ввести свій email і відправити на перевірку адміністратору.
                            Додані, але не відправлені на перевірку пункти не будуть оброблені!
                        </p>
                    </div>

                    {/* Form Section */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                            Адміністративний поділ
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[15px] mb-[15px]">
                            <FormSelect
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                placeholder="Оберіть країну"
                            >
                                {listCountries(regionStructure).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </FormSelect>

                            <FormSelect
                                name="region"
                                value={formData.region}
                                onChange={handleChange}
                                placeholder="Оберіть область"
                                disabled={!regions.length}
                            >
                                {regions.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </FormSelect>

                            <FormSelect
                                name="district"
                                value={formData.district}
                                onChange={handleChange}
                                placeholder="Оберіть район"
                                disabled={!districts.length}
                            >
                                {districts.map(d => <option key={d} value={d}>{d}</option>)}
                            </FormSelect>

                            <FormSelect
                                name="community"
                                value={formData.community}
                                onChange={handleChange}
                                placeholder="Оберіть громаду"
                                disabled={!communities.length}
                            >
                                {communities.map(c => <option key={c} value={c}>{c}</option>)}
                            </FormSelect>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-[15px] mb-[15px]">
                            <FormSelect
                                name="settlementType"
                                value={formData.settlementType}
                                onChange={handleChange}
                                placeholder="Тип населеного пункту"
                                disabled={!settlementTypes.length}
                            >
                                {settlementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </FormSelect>

                            <FormInput
                                name="settlementName"
                                value={formData.settlementName}
                                onChange={handleChange}
                                placeholder="Назва населеного пункту"
                            />
                        </div>

                        <div className="mb-[15px]">
                            <FormTextarea
                                name="comment"
                                value={formData.comment}
                                onChange={handleChange}
                                placeholder="Коментар (необов'язково)"
                            />
                        </div>

                        <label className="flex items-center gap-[10px] cursor-pointer">
                            <input
                                type="checkbox"
                                name="isNonExistent"
                                checked={formData.isNonExistent}
                                onChange={handleChange}
                                className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-[#2563EB] focus:ring-2 focus:ring-[#2563EB]"
                            />
                            <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium">
                                Неіснуючий населений пункт
                            </span>
                        </label>
                    </section>

                    {/* Map Section */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                            Карта
                        </h2>

                        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
                            Оберіть точку на карті для населеного пункту
                        </p>

                        <MapSelector
                            latitude={formData.latitude}
                            longitude={formData.longitude}
                            onPositionChange={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                        />
                    </section>

                    {/* Add Button */}
                    <div className="flex flex-wrap items-center gap-[15px] mb-[30px]">
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                        >
                            <Plus className="w-4 h-4 text-white" strokeWidth={1.6} />
                            <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                Додати до списку
                            </span>
                        </button>
                    </div>

                    {/* Added Settlements Table */}
                    {addedSettlements.length > 0 && (
                        <>
                            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[20px] lg:text-[24px] font-bold mb-[15px]">
                                Додані населені пункти ({addedSettlements.length})
                            </h2>

                            {/* Desktop Table */}
                            <div className="hidden lg:block overflow-x-auto mb-[20px]">
                                <div className="border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                                    <div className="flex min-w-full bg-gray-100 dark:bg-[#1F2937]">
                                        <div className="w-[150px] border-r border-gray-300 dark:border-[#374151] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Область</span>
                                        </div>
                                        <div className="w-[150px] border-r border-gray-300 dark:border-[#374151] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Район</span>
                                        </div>
                                        <div className="w-[170px] border-r border-gray-300 dark:border-[#374151] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Громада</span>
                                        </div>
                                        <div className="flex-1 border-r border-gray-300 dark:border-[#374151] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Населений пункт</span>
                                        </div>
                                        <div className="w-[100px] border-r border-gray-300 dark:border-[#374151] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Тип</span>
                                        </div>
                                        <div className="w-[100px] p-[10px]">
                                            <span className="text-gray-900 dark:text-white text-[14px] font-semibold">Дії</span>
                                        </div>
                                    </div>

                                    <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                        {addedSettlements.map((s, idx) => (
                                            <div key={idx} className="flex min-w-full hover:bg-gray-50 dark:hover:bg-[#1F2937] transition-colors">
                                                <div className="w-[150px] border-r border-gray-200 dark:border-[#374151] p-[10px]">
                                                    <span className="text-gray-900 dark:text-white text-[13px] break-words">{s.region}</span>
                                                </div>
                                                <div className="w-[150px] border-r border-gray-200 dark:border-[#374151] p-[10px]">
                                                    <span className="text-gray-900 dark:text-white text-[13px] break-words">{s.district}</span>
                                                </div>
                                                <div className="w-[170px] border-r border-gray-200 dark:border-[#374151] p-[10px]">
                                                    <span className="text-gray-900 dark:text-white text-[13px] break-words">{s.community}</span>
                                                </div>
                                                <div className="flex-1 border-r border-gray-200 dark:border-[#374151] p-[10px]">
                                                    <span className="text-gray-900 dark:text-white text-[13px] break-words">{s.settlementName}</span>
                                                    {s.isNonExistent && (
                                                        <span className="ml-2 text-red-600 dark:text-red-400 text-[12px] whitespace-nowrap">(неіснуючий)</span>
                                                    )}
                                                </div>
                                                <div className="w-[100px] border-r border-gray-200 dark:border-[#374151] p-[10px]">
                                                    <span className="text-gray-900 dark:text-white text-[13px] break-words">{s.settlementType}</span>
                                                </div>
                                                <div className="w-[100px] p-[10px] flex items-center justify-center">
                                                    <button
                                                        onClick={() => handleRemove(idx)}
                                                        className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" strokeWidth={1.6} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Cards */}
                            <div className="lg:hidden space-y-4 mb-[20px]">
                                {addedSettlements.map((s, idx) => (
                                    <div key={idx} className="p-4 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937]">
                                        <div className="space-y-2">
                                            <p className="text-gray-900 dark:text-white text-[14px] font-semibold">
                                                {s.settlementType} {s.settlementName}
                                                {s.isNonExistent && (
                                                    <span className="ml-2 text-red-600 dark:text-red-400 text-[12px]">(неіснуючий)</span>
                                                )}
                                            </p>
                                            <p className="text-gray-700 dark:text-gray-300 text-[13px]">
                                                {s.region}, {s.district}, {s.community}
                                            </p>
                                            {s.comment && (
                                                <p className="text-gray-600 dark:text-gray-400 text-[12px]">
                                                    Коментар: {s.comment}
                                                </p>
                                            )}
                                            <button
                                                onClick={() => handleRemove(idx)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-[12px] font-medium transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                                                Видалити
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Email and Send Section */}
                            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
                                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
                                    Контактні дані
                                </h2>

                                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
                                    Вкажіть email для зв'язку у разі необхідності уточнення інформації
                                </p>

                                <FormInput
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="your.email@example.com"
                                />
                            </section>

                            {/* Send Button */}
                            <div className="flex flex-wrap items-center gap-[15px]">
                                <button
                                    onClick={handleSend}
                                    className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] transition-colors"
                                >
                                    <Send className="w-4 h-4 text-white" strokeWidth={1.6} />
                                    <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                        Відправити на перевірку
                                    </span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} duration={4000} />}
        </>
    );
}

// Form Components
function FormSelect({ 
    name, 
    value, 
    onChange, 
    placeholder, 
    disabled, 
    children 
}: { 
    name: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
    placeholder: string; 
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className="relative">
            <select
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <option value="">{placeholder}</option>
                {children}
            </select>
            <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
        </div>
    );
}

function FormInput({ 
    name, 
    value, 
    onChange, 
    placeholder 
}: { 
    name: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
    placeholder: string; 
}) {
    return (
        <input
            type="text"
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
        />
    );
}

function FormTextarea({ 
    name, 
    value, 
    onChange, 
    placeholder 
}: { 
    name: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; 
    placeholder: string; 
}) {
    return (
        <textarea
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={3}
            className="w-full p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
        />
    );
}