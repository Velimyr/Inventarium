import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Header from '../../components/header';

export default function RecordPage() {
    const router = useRouter();
    const { id } = router.query;
    const [record, setRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

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

    if (loading) return <p className="p-4">Завантаження...</p>;
    if (!record) return <p className="p-4">Запис не знайдено</p>;

    const formatRow = (label: string, value: any) => (
        <tr>
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
    ].filter(Boolean).join(', ');

    const fullLocationCurrent = [
        record.current_region,
        record.current_district,
        record.current_community,
        record.current_settlement_type && record.current_settlement_name
            ? `${record.current_settlement_type} ${record.current_settlement_name}`
            : null,
    ].filter(Boolean).join(', ');

    return (
        <>
            <Header />
            <main className="p-4 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                <h1 className="text-2xl font-bold mb-6">{record.case_title || 'Інвентарний опис'}</h1>
                <div className="overflow-auto max-w-full">
                <table className="min-w-[1000px] border border-gray-300 table-auto mx-auto">
                    <tbody>
                        {formatRow('Сигнатура справи', record.case_signature)}
                        {formatRow('Додаткова сигнатура', record.additional_case_signature)}
                        {formatRow('Назва справи', record.case_title)}
                        {formatRow('Дата справи', record.case_date ? new Date(record.case_date).toLocaleDateString() : '-')}
                        {formatRow('Адмінподіл на час створення', fullLocationOld)}
                        {formatRow('Сучасний адмінподіл', fullLocationCurrent)}
                        {formatRow('Широта', record.latitude)}
                        {formatRow('Довгота', record.longitude)}
                        {formatRow('Тип позначки', record.mark_type)}
                        {formatRow('Кількість сторінок', record.pages_count)}
                        {formatRow('Початкова сторінка інвентаря', record.inventory_start_page)}
                        {formatRow('Рік складання інвентаря', record.inventory_year)}
                        {formatRow('Примітки', record.notes)}
                        {formatRow('Статус', record.status)}
                        {formatRow('Дата створення', new Date(record.created_at).toLocaleString())}
                        {formatRow(
                            'Посилання на скани',
                            record.scans_url ? (
                                <a href={record.scans_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                    Переглянути
                                </a>
                            ) : '-'
                        )}
                        {formatRow(
                            'Google Maps',
                            record.latitude && record.longitude ? (
                                <a
                                    href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline"
                                >
                                    Відкрити на мапі
                                </a>
                            ) : '-'
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-6">
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded hover:bg-gray-400 dark:hover:bg-gray-600"
                >
                    ⬅ Повернутися до списку
                </button>
            </div>
        </main >
    </>
  );
}
