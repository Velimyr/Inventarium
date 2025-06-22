import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';
import { Dialog } from '@headlessui/react';
import { useEffect, useState, Fragment } from 'react';
import emailjs from 'emailjs-com';

export default function RecordPage() {
    const router = useRouter();
    const { id } = router.query;

    const [record, setRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    // Стани для модального вікна і форми
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [reportText, setReportText] = useState('');
    const [reportName, setReportName] = useState('');
    const [reportContacts, setReportContacts] = useState('');
    const [submitted, setSubmitted] = useState(false);

    // Валідація форми (усі поля обов’язкові)
    const isFormValid =
        reportText.trim() !== '' &&
        reportName.trim() !== '' &&
        reportContacts.trim() !== '';

    useEffect(() => {
        if (id) fetchRecord();
    }, [id]);

    const fetchRecord = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('records').select('*').eq('id', id).single();
        if (error) {
            console.error('Помилка:', error);
            setRecord(null);
        } else {
            setRecord(data);
        }
        setLoading(false);
    };

    const sendErrorReport = async () => {
        if (!isFormValid) return;

        try {
            await emailjs.send(
                'service_kdqzv9e',       // твій service ID
                'template_qdlf2p8',      // твій template ID
                {
                    message: reportText,
                    name: reportName,
                    contacts: reportContacts,
                    record_id: record?.id,
                    url: window.location.href,
                },
                'WBCc_TP1lGiy8DVtF'     // твій public key (user ID)
            );
            setSubmitted(true);
            setTimeout(() => {
                setIsModalOpen(false);
                setReportText('');
                setReportName('');
                setReportContacts('');
                setSubmitted(false);
            }, 2000);
        } catch (err) {
            console.error('Помилка надсилання:', err);
            alert('Сталася помилка під час надсилання повідомлення.');
        }
    };



    if (loading) return <p className="p-4">Завантаження...</p>;
    if (!record) return <p className="p-4">Запис не знайдено</p>;

    const formatRow = (label: string, value: any) => (
        <tr key={label}>
            <td className="border p-2 font-medium">{label}</td>
            <td className="border p-2">{value ?? '-'}</td>
        </tr>
    );

    const fullLocationOld = [
        record.old_province,
        record.old_district,
        record.old_community,
        record.old_settlement_type && record.old_settlement_name
            ? `${record.old_settlement_type} ${record.old_settlement_name}`
            : null,
    ]
        .filter(Boolean)
        .join(', ');

    const fullLocationCurrent = [
        record.current_region,
        record.current_district,
        record.current_community,
        record.current_settlement_type && record.current_settlement_name
            ? `${record.current_settlement_type} ${record.current_settlement_name}`
            : null,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <>
            <Header />
            <main className="p-4 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                <div className="flex flex-col items-center px-4">
                    <h1 className="text-2xl font-bold mb-6 text-center">
                        {record.case_title || 'Інвентарний опис'}
                    </h1>
                    <div className="overflow-auto max-w-full">
                        <table className="min-w-[1000px] border border-gray-300 table-auto mx-auto">
                            <tbody>
                                {formatRow('Адмінподіл на час створення', fullLocationOld)}
                                {formatRow('Сучасний адмінподіл', fullLocationCurrent)}
                                {formatRow('Рік складання інвентаря', record.inventory_year)}
                                {formatRow('Сигнатура справи', record.case_signature)}
                                {formatRow('Назва справи', record.case_title)}
                                {formatRow('Дата справи', record.case_date)}
                                {formatRow('Кількість сторінок', record.pages_count)}
                                {formatRow('Початкова сторінка інвентаря', record.inventory_start_page)}
                                {formatRow('Додаткова сигнатура', record.additional_case_signature)}
                                {formatRow('Примітки', record.notes)}
                                {formatRow('Дата створення', new Date(record.created_at).toLocaleString())}
                                {formatRow(
                                    'Посилання на скани',
                                    record.scans_url ? (
                                        <a
                                            href={record.scans_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 underline"
                                        >
                                            Переглянути
                                        </a>
                                    ) : (
                                        '-'
                                    )
                                )}
                                {formatRow(
                                    'Карта',
                                    record.latitude && record.longitude ? (
                                        <a
                                            href={`https://www.openstreetmap.org/?mlat=${record.latitude}&mlon=${record.longitude}#map=16/${record.latitude}/${record.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 underline"
                                        >
                                            Відкрити на мапі
                                        </a>
                                    ) : (
                                        '-'
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>


                    <div className="mt-6 flex gap-4">
                        <button
                            onClick={() => router.back()}
                            className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded hover:bg-gray-400 dark:hover:bg-gray-600"
                        >
                            ⬅ Повернутися до списку
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            🚫 Повідомити про помилку в інвентарі
                        </button>
                    </div>
                </div>
                <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} as={Fragment}>
                    <div className="fixed inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md max-w-xl w-full z-50">
                            <Dialog.Title className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
                                Повідомте про проблему в інвентарі
                            </Dialog.Title>

                            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                                Ім'я <span className="text-red-600">*</span>
                                <input
                                    type="text"
                                    value={reportName}
                                    onChange={(e) => setReportName(e.target.value)}
                                    className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    placeholder="Ваше ім'я"
                                    required
                                />
                            </label>

                            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                                Контакти <span className="text-red-600">*</span>
                                <input
                                    type="text"
                                    value={reportContacts}
                                    onChange={(e) => setReportContacts(e.target.value)}
                                    className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    placeholder="Facebook, Telegram, Email тощо"
                                    required
                                />
                            </label>

                            <label className="block mb-4 font-medium text-gray-700 dark:text-gray-300">
                                Опис проблеми <span className="text-red-600">*</span>
                                <textarea
                                    value={reportText}
                                    onChange={(e) => setReportText(e.target.value)}
                                    placeholder="Опишіть помилку або неточність"
                                    rows={5}
                                    className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    required
                                />
                            </label>

                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                                >
                                    Скасувати
                                </button>
                                <button
                                    onClick={sendErrorReport}
                                    disabled={!isFormValid}
                                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Надіслати
                                </button>
                            </div>

                            {submitted && (
                                <p className="text-green-600 mt-3 text-sm">Повідомлення надіслано! Дякуємо.</p>
                            )}
                        </div>
                    </div>
                </Dialog>
            </main>
        </>
    );
}
