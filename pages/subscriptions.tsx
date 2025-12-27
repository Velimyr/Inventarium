import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import SubscriptionModal from '../components/subscriptionModal';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { Bell, Plus, AlertTriangle, ChevronDown } from 'lucide-react';

export default function SubscriptionsPage() {
    const { user, loading } = useUser();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [regionStructure, setRegionStructure] = useState({});
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);

    const formatDate = (isoString: string) => {
        // Припускаємо формат ISO: YYYY-MM-DD або YYYY-MM-DDTHH:mm:ss.sssZ
        const datePart = isoString.split('T')[0]; // "YYYY-MM-DD"
        const [year, month, day] = datePart.split('-');
        return `${day}.${month}.${year}`;
    };

    useEffect(() => {
        fetch('/data/region_structure.json')
            .then(res => res.json())
            .then(data => setRegionStructure(data))
            .catch(err => console.error('Помилка завантаження region_structure:', err));
    }, []);

    useEffect(() => {
        if (!user) return;
        setLoadingSubscriptions(true);
        supabase
            .from('settlement_subscription')
            .select('*')
            .eq('user_id', user.id)
            .then(({ data, error }) => {
                if (error) console.error('Помилка завантаження підписок:', error);
                else setSubscriptions(data || []);
                setLoadingSubscriptions(false);
            });
    }, [user]);

    const getSettlementNameByCode = (code: string): string => {
        for (const [regionName, region] of Object.entries(regionStructure)) {
            for (const [districtName, district] of Object.entries(region)) {
                for (const [communityName, settlements] of Object.entries(district)) {
                    if (!Array.isArray(settlements)) continue;

                    for (const settlement of settlements) {
                        if (settlement.code === code) {
                            const prefix = settlement.type === 'місто' ? 'м.' : 'с.';
                            return `${prefix} ${settlement.name}, ${communityName} громада, ${districtName} район, ${regionName} область`;
                        }
                    }
                }
            }
        }
        return code;
    };

    if (loading) return null;

    if (!user) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px] lg:text-[18px] text-center px-4">
                        🔐 Щоб переглянути підписки, увійдіть у систему.
                    </p>
                </div>
            </>
        );
    }

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Page Title */}
                    <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[30px]">
                        Мої підписки
                    </h1>

                    {/* Info Section */}
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
                        <div className="flex items-start gap-[10px] mb-[15px]">
                            <Bell className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0 mt-0.5" strokeWidth={2} />
                            <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                Про підписки
                            </h2>
                        </div>
                        <div className="space-y-[15px]">
                            <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                                Ви можете підписатися на оновлення реєстру Інвентаріуму по певному населеному пункту. Якщо в систему буде внесено інвентар по цьому населеному пункту — ви отримаєте відповідне сповіщення на електронну пошту.
                            </p>
                            <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                                Для створення нової підписки за одним населеним пунктом — ви маєте зробити пожертву на підтримку Сил Оборони України для актуального збору на нашому сайті (сума повинна бути від 200 грн.):
                            </p>
                            <Link href="/donate">
                                <a className="inline-block text-[#2563EB] hover:text-[#1D4ED8] text-[14px] lg:text-[16px] font-semibold underline">
                                    Задонатити
                                </a>
                            </Link>
                        </div>
                    </section>

                    {/* Subscriptions Table */}
                    {loadingSubscriptions ? (
                        <div className="text-center py-8">
                            <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                        </div>
                    ) : subscriptions.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden lg:block overflow-x-auto mb-[20px]">
                                <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr] border-b border-gray-300 dark:border-[#374151]">
                                        <TableHeader label="Населений пункт" />
                                        <TableHeader label="Статус" />
                                        <TableHeader label="Дійсна до" />
                                        <TableHeader label="Email" isLast />
                                    </div>

                                    {/* Table Body */}
                                    <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                        {subscriptions.map((s, index) => {
                                            const now = new Date();
                                            const expired = new Date(s.expire_date) < now;
                                            let statusText = '';
                                            if (expired) {
                                                statusText = 'Підписка завершена';
                                            } else if (s.status === 'new') {
                                                statusText = 'Очікує підтвердження адміністратором';
                                            } else if (s.status === 'approved') {
                                                statusText = 'Підписка активна';
                                            } else if (s.status === 'rejected') {
                                                statusText = 'Підписка відхилена';
                                            } else {
                                                statusText = 'Підписка завершена';
                                            }

                                            return (
                                                <div
                                                    key={s.id}
                                                    className={`grid grid-cols-[2fr_1.5fr_1fr_1.5fr] ${
                                                        index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                                                    }`}
                                                >
                                                    <TableCell>{getSettlementNameByCode(s.settlement_code)}</TableCell>
                                                    <TableCell>{statusText}</TableCell>
                                                    <TableCell>
                                                        {s.status === 'rejected' ? '—' : formatDate(s.expire_date)}
                                                    </TableCell>
                                                    <TableCell>{s.email || '—'}</TableCell>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Cards */}
                            <div className="block lg:hidden space-y-4 mb-[20px]">
                                {subscriptions.map((s) => {
                                    const now = new Date();
                                    const expired = new Date(s.expire_date) < now;
                                    let statusText = '';
                                    if (expired) {
                                        statusText = 'Підписка завершена';
                                    } else if (s.status === 'new') {
                                        statusText = 'Очікує підтвердження адміністратором';
                                    } else if (s.status === 'approved') {
                                        statusText = 'Підписка активна';
                                    } else if (s.status === 'rejected') {
                                        statusText = 'Підписка відхилена';
                                    } else {
                                        statusText = 'Підписка завершена';
                                    }

                                    return (
                                        <div
                                            key={s.id}
                                            className="p-4 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937]"
                                        >
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                        Населений пункт
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {getSettlementNameByCode(s.settlement_code)}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                            Статус
                                                        </div>
                                                        <div className="text-[13px] text-gray-900 dark:text-white">
                                                            {statusText}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                            Дійсна до
                                                        </div>
                                                        <div className="text-[13px] text-gray-900 dark:text-white">
                                                            {s.status === 'rejected' ? '—' : formatDate(s.expire_date)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                                                        Email
                                                    </div>
                                                    <div className="text-[13px] text-gray-900 dark:text-white">
                                                        {s.email || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Warning Banner */}
                            <div className="flex items-start gap-[10px] lg:gap-[15px] px-[12px] lg:px-[15px] py-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308] mb-[20px]">
                                <AlertTriangle className="w-4 h-4 text-[#92400E] dark:text-[#451A03] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                                <p className="text-[#92400E] dark:text-[#451A03] text-[14px] lg:text-[16px] font-medium flex-1">
                                    Зверніть увагу: Коли зʼявиться новий інвентар і вам буде відправлено сповіщення про це, лист може потрапити в спам. Додайте завчасно адресу inventariumteam@gmail.com до списку дозволених відправників.
                                </p>
                            </div>
                        </>
                    ) : (
                        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
                            <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] text-center">
                                У вас поки немає підписок.
                            </p>
                        </section>
                    )}

                    {/* Add Subscription Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                        >
                            <Plus className="w-4 h-4 text-white" strokeWidth={1.6} />
                            <span className="text-white text-[14px] lg:text-[16px] font-medium">
                                Додати підписку
                            </span>
                        </button>
                    </div>

                    <SubscriptionModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        regionStructure={regionStructure}
                        onSuccess={() => {
                            setLoadingSubscriptions(true);
                            supabase
                                .from('settlement_subscription')
                                .select('*')
                                .eq('user_id', user.id)
                                .then(({ data, error }) => {
                                    if (!error) setSubscriptions(data || []);
                                    setLoadingSubscriptions(false);
                                });
                        }}
                    />
                </div>
            </div>
        </>
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

function TableCell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-center p-[10px] border-r border-gray-200 dark:border-[#374151] last:border-r-0 min-h-[50px]">
            <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px] text-center">{children}</span>
        </div>
    );
}