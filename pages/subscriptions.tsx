import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';
import SubscriptionModal from '../components/subscriptionModal';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

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
            .eq('user', user.id)
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
                            return `${prefix} ${settlement.name}, ${communityName}, ${districtName}, ${regionName}`;
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
                <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
                    <p className="text-lg text-center">🔐 Щоб переглянути підписки, увійдіть у систему.</p>
                </main>
            </>
        );
    }

    return (
        <>
            <Header />
            <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-4">Мої підписки</h1>

                    <p className="mb-4">
                        Ви можете підписатися на оновлення реєстру Інвентаріуму по певному населеному пункту. Якщо в систему буде внесено інвентар по цьому населеному пункту — ви отримаєте відповідне сповіщення на електронну пошту.
                    </p>
                    <p className="mb-6">
                        Для створення нової підписки за одним населеним пунктом — ви маєте зробити пожертву на підтримку Сил Оборони України для актуального збору:
                    </p>

                    <Link
                        href="/donate"
                        className="inline-block text-blue-600 hover:underline font-semibold mb-8"
                    >
                        Задонатити
                    </Link>

                    {/* Таблиця підписок */}
                    {loadingSubscriptions ? (
                        <p className="mb-8">Завантаження...</p>
                    ) : (
                        subscriptions.length > 0 ? (
                            <table className="w-full text-left border border-gray-300 dark:border-gray-700 mb-8">
                                <thead className="bg-gray-100 dark:bg-gray-800">
                                    <tr>
                                        <th className="p-2 border-b dark:border-gray-700">Населений пункт</th>
                                        <th className="p-2 border-b dark:border-gray-700">Статус</th>
                                        <th className="p-2 border-b dark:border-gray-700">Дійсна до</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subscriptions.map((s) => {
                                        const now = new Date();
                                        const expired = new Date(s.expire_date) < now;
                                        const statusText = expired
                                            ? 'Підписка завершена'
                                            : s.status === 'approve'
                                                ? 'Активна підписка'
                                                : 'Не підтверджено';
                                        return (
                                            <tr key={s.id} className="border-t border-gray-300 dark:border-gray-700">
                                                <td className="p-2">{getSettlementNameByCode(s.settlement_code)}</td>
                                                <td className="p-2">{statusText}</td>
                                                <td className="p-2">
                                                    {formatDate(s.expire_date)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p className="mb-8">У вас поки немає підписок.</p>
                        )
                    )}

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                        >
                            Додати підписку
                        </button>
                    </div>

                    <SubscriptionModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        regionStructure={regionStructure}
                    />
                </div>
            </main>
        </>
    );
}