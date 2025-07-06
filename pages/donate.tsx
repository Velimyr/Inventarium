import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';

type DonateData = {
    header: string;
    text: string;
    image: string;
    link: string;
};

export default function DonatePage() {
    const [donateInfo, setDonateInfo] = useState<DonateData | null>(null);

    useEffect(() => {
        const fetchDonateData = async () => {
            const { data, error } = await supabase
                .from('donate')
                .select('*')
                .in('type', ['default', 'current']);

            if (error || !data) return;

            const current = data.find((d) => d.type === 'current');
            const fallback = data.find((d) => d.type === 'default');
            console.log('Current.active:' + current?.active)
            if (current?.active) {
                setDonateInfo(current);
            } else if (fallback) {
                setDonateInfo(fallback);
            }
        };

        fetchDonateData();
    }, []);

    if (!donateInfo) {
        return (
            <>
                <Header />
                <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                    <div className="max-w-screen-lg mx-auto text-center">Завантаження…</div>
                </main>
            </>
        );
    }

    return (
        <>
            <Header />
            <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="max-w-screen-lg mx-auto">
                    {/* <div className="mb-6 bg-yellow-200 text-yellow-900 p-4 rounded shadow">
                        Після вашого донату обовʼязково надішліть скріншот оплати або квитанцію на електронну пошту{" "}
                        <strong>donate@inventarium.org.ua</strong>
                    </div> */}

                    <div className="flex flex-col md:flex-row items-center gap-6 bg-gray-50 dark:bg-gray-800 p-6 rounded shadow">
                        {donateInfo.image && (
                            <img
                                src={donateInfo.image}
                                alt="Donate"
                                className="w-full md:w-1/2 rounded-lg shadow"
                            />
                        )}

                        <div className="flex-1 text-center md:text-left">
                            <h1 className="text-2xl font-bold mb-4">{donateInfo.header}</h1>
                            <p className="mb-4 whitespace-pre-line">{donateInfo.text}</p>
                            {donateInfo.link && (
                                <div className="flex justify-center md:justify-start">
                                    <a
                                        href={donateInfo.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded transition"
                                    >
                                        Задонатити
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}