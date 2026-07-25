import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../contexts/UserContext';
import { Save, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { fromSignatureList, resolveIsUkrainianArchive, validateCaseSignature } from '../lib/caseSignature';

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
    ssr: false,
});

export default function MyDraftsPage() {
    const { user, loading: userLoading } = useUser();

    const [records, setRecords] = useState<any[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            setLoading(false);
            return;
        }

        const fetchDrafts = async () => {
            const { data, error } = await supabase
                .from('records_unverified')
                .select('*')
                .eq('created_by', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error(error);
                setToast({ message: '❌ Помилка завантаження чернеток', type: 'error' });
            } else {
                setRecords(data || []);
                setFormData(data?.[0] || {});
            }

            setLoading(false);
        };

        fetchDrafts();
    }, [user, userLoading]);

    const goToRecord = (newIndex: number) => {
        if (newIndex >= 0 && newIndex < records.length) {
            setIndex(newIndex);
            setFormData(records[newIndex]);
        }
    };

    const saveRecord = async () => {
        const recordId = formData.id;
        if (!recordId) return;

        // Шифр і його складові мають описувати одну справу й мати коректний формат
        const signatureError = validateCaseSignature({
            ...formData,
            is_ukrainian_archive: resolveIsUkrainianArchive(formData),
        });
        if (signatureError) {
            setToast({ message: `❌ ${signatureError}`, type: 'error' });
            return;
        }

        // Додаємо у matchQuery лише непорожні значення
        const matchQuery: any = {};
        if (formData.current_region != null && formData.current_region !== '') matchQuery.current_region = formData.current_region;
        if (formData.current_district != null && formData.current_district !== '') matchQuery.current_district = formData.current_district;
        if (formData.current_community != null && formData.current_community !== '') matchQuery.current_community = formData.current_community;
        if (formData.current_settlement_type != null && formData.current_settlement_type !== '') matchQuery.current_settlement_type = formData.current_settlement_type;
        if (formData.current_settlement_name != null && formData.current_settlement_name !== '') matchQuery.current_settlement_name = formData.current_settlement_name;
        if (formData.case_signature != null && formData.case_signature !== '') matchQuery.case_signature = formData.case_signature;
        const year = formData.inventory_year?.toString().trim();
        if (year) matchQuery.inventory_year = Number(year);

        // Підготовка payload для оновлення
        const payload = { ...formData };
        payload.additional_case_signature = fromSignatureList(payload.additional_case_signature);
        const payloadYear = payload.inventory_year?.toString().trim();
        payload.inventory_year = payloadYear ? Number(payloadYear) : null;

        try {
            // 🔍 Перевірка records_unverified (чернетки) - використовуємо limit замість maybeSingle
            const { data: unverifiedDups, error: unverifiedError } = await supabase
                .from('records_unverified')
                .select('id')
                .match(matchQuery)
                .neq('id', recordId)
                .limit(1);

            if (unverifiedError) throw unverifiedError;

            if (unverifiedDups && unverifiedDups.length > 0) {
                setToast({
                    message: '❗ Такий запис уже існує серед ваших чернеток',
                    type: 'error',
                });
                return;
            }

            // 🔍 Перевірка records (офіційна база) - використовуємо limit замість maybeSingle
            const { data: verifiedDups, error: verifiedError } = await supabase
                .from('records')
                .select('id')
                .match(matchQuery)
                .limit(1);

            if (verifiedError) throw verifiedError;

            if (verifiedDups && verifiedDups.length > 0) {
                setToast({
                    message: '❗ Такий запис уже є в реєстрі Інвентаріума',
                    type: 'error',
                });
                return;
            }

            // ✅ Якщо унікально — оновити запис у records_unverified
            const { error } = await supabase
                .from('records_unverified')
                .update(payload)
                .eq('id', recordId);

            if (error) throw error;

            setToast({ message: '✅ Чернетку збережено', type: 'success' });

            const updatedRecords = [...records];
            updatedRecords[index] = formData;
            setRecords(updatedRecords);

        } catch (error) {
            console.error(error);
            setToast({ message: '❌ Помилка при збереженні або перевірці', type: 'error' });
        }
    };

    if (loading) {
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
                    <div className="flex items-center gap-[10px] mb-[20px] lg:mb-[29px]">
                        <FileText className="w-6 h-6 lg:w-7 lg:h-7 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                        <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                            Мої чернетки
                        </h1>
                    </div>

                    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                    {records.length === 0 ? (
                        <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] text-center">
                                У вас немає чернеток
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Navigation Buttons */}
                            <div className="flex flex-wrap items-center gap-[10px] lg:gap-[15px] mb-[20px]">
                                <button
                                    onClick={() => goToRecord(index - 1)}
                                    disabled={index === 0}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">
                                        Попередній
                                    </span>
                                </button>
                                <span className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                                    {index + 1} з {records.length}
                                </span>
                                <button
                                    onClick={() => goToRecord(index + 1)}
                                    disabled={index === records.length - 1}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[12px] lg:px-[15px] h-[36px] lg:h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium whitespace-nowrap">
                                        Наступний
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" strokeWidth={1.6} />
                                </button>
                            </div>

                            {/* Form */}
                            <EditableInventoryForm data={formData} onChange={setFormData} />

                            {/* Save Button */}
                            <div className="mt-[20px] flex justify-end">
                                <button
                                    onClick={saveRecord}
                                    className="flex items-center gap-[8px] lg:gap-[10px] px-[15px] lg:px-[20px] h-[40px] lg:h-[44px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                                >
                                    <Save className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                                    <span className="text-white text-[15px] lg:text-[16px] font-semibold whitespace-nowrap">
                                        Зберегти чернетку
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