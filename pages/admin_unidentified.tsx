import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';

export default function AdminNotIdentifyPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [settlementPoints, setSettlementPoints] = useState<any[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const fetchAdminAndRecords = async () => {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!adminData) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await fetchRecords();
      setLoading(false);
    };

    fetchAdminAndRecords();
  }, [user, userLoading]);

  const fetchRecords = async () => {
    const { data: recordsData, error: recordsError } = await supabase
      .from('records_notidentify')
      .select('*')
      .order('created_at', { ascending: false });

    if (recordsError) {
      console.error('Error fetching records:', recordsError);
      setToast({ message: '❌ Помилка завантаження інвентарів', type: 'error' });
      return;
    }

    const recordsWithCounts = await Promise.all(
      (recordsData || []).map(async (record) => {
        const { data: pointsData, error: countError } = await supabase
          .from('records_notidentify_points')
          .select('id')
          .eq('notidentify_record_id', record.id);

        if (countError) {
          console.error('Error counting points:', countError);
        }

        return {
          ...record,
          points_count: pointsData?.length || 0,
        };
      })
    );

    setRecords(recordsWithCounts);
    setFilteredRecords(recordsWithCounts.filter(r => r.status === statusFilter));
  };

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredRecords(records);
    } else {
      setFilteredRecords(records.filter(r => r.status === statusFilter));
    }
  }, [statusFilter, records]);

  const fetchSettlementPoints = async (notidentifyId: string) => {
    setLoadingPoints(true);
    const { data, error } = await supabase
      .from('records_notidentify_points')
      .select('*')
      .eq('notidentify_record_id', notidentifyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching settlement points:', error);
      setToast({ message: '❌ Помилка завантаження населених пунктів', type: 'error' });
    } else {
      setSettlementPoints(data || []);
    }
    setLoadingPoints(false);
  };

  const toggleExpandRecord = async (recordId: string) => {
    if (expandedRecordId === recordId) {
      setExpandedRecordId(null);
      setSettlementPoints([]);
    } else {
      setExpandedRecordId(recordId);
      await fetchSettlementPoints(recordId);
    }
  };

  const confirmRecord = async (record: any) => {
    const confirmed = window.confirm(
      `Ви впевнені, що хочете додати ${record.points_count} населених пунктів на перевірку?`
    );

    if (!confirmed) return;

    try {
      const { data: points, error: pointsError } = await supabase
        .from('records_notidentify_points')
        .select('*')
        .eq('notidentify_record_id', record.id);

      if (pointsError) {
        console.error('Error fetching points:', pointsError);
        setToast({ message: '❌ Помилка завантаження населених пунктів', type: 'error' });
        return;
      }

      if (!points || points.length === 0) {
        setToast({ message: '❌ Немає населених пунктів для підтвердження', type: 'error' });
        return;
      }

      const recordsToInsert = points.map(point => ({
        old_province: point.old_province,
        old_district: point.old_district,
        old_community: point.old_community,
        old_settlement_type: point.old_settlement_type,
        old_settlement_name: point.old_settlement_name,
        current_region: point.current_region,
        current_district: point.current_district,
        current_community: point.current_community,
        current_settlement_type: point.current_settlement_type,
        current_settlement_name: point.current_settlement_name,
        latitude: point.latitude,
        longitude: point.longitude,
        mark_type: point.mark_type,
        case_signature: point.case_signature,
        archive: point.archive,
        fonds: point.fonds,
        series: point.series,
        record: point.record,
        additional_case_signature: point.additional_case_signature,
        case_date: point.case_date,
        inventory_year: point.inventory_year,
        pages_count: point.pages_count,
        inventory_start_page: point.inventory_start_page,
        scans_url: point.scans_url,
        case_title: point.case_title,
        notes: point.notes,
        created_by: point.created_by,
        email: point.email,
        is_ukrainian_archive: point.is_ukrainian_archive,
        approved: false,
      }));

      const { error: insertError } = await supabase
        .from('records_unverified')
        .insert(recordsToInsert);

      if (insertError) {
        console.error('Error inserting records:', insertError);
        setToast({ message: '❌ Помилка при додаванні записів на перевірку', type: 'error' });
        return;
      }

      const { error: updateError } = await supabase
        .from('records_notidentify')
        .update({ status: 'done' })
        .eq('id', record.id);

      if (updateError) {
        console.error('Error updating status:', updateError);
        setToast({ message: '❌ Помилка при оновленні статусу', type: 'error' });
        return;
      }

      setToast({
        message: `✅ ${points.length} населених пунктів додано на перевірку`,
        type: 'success'
      });

      await fetchRecords();
      setExpandedRecordId(null);
      setSettlementPoints([]);
    } catch (err) {
      console.error('Error confirming record:', err);
      setToast({ message: '❌ Невідома помилка при підтвердженні', type: 'error' });
    }
  };

  const returnToIdentification = async (record: any) => {
    const confirmed = window.confirm(
      `Ви впевнені, що хочете повернути інвентар на ідентифікацію?`
    );

    if (!confirmed) return;

    try {
      const { error: updateError } = await supabase
        .from('records_notidentify')
        .update({ status: 'new' })
        .eq('id', record.id);

      if (updateError) {
        console.error('Error updating status:', updateError);
        setToast({ message: '❌ Помилка при оновленні статусу', type: 'error' });
        return;
      }

      setToast({
        message: '✅ Інвентар повернуто на ідентифікацію',
        type: 'success'
      });

      await fetchRecords();
      setExpandedRecordId(null);
      setSettlementPoints([]);
    } catch (err) {
      console.error('Error returning to identification:', err);
      setToast({ message: '❌ Невідома помилка', type: 'error' });
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6 flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6 flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 font-medium text-center">{error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-6">🔍 Неідентифіковані інвентарі</h1>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Фільтр по статусу:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="all">Всі</option>
              <option value="new">Очікує ідентифікації</option>
              <option value="review">Обробляється адміністратором</option>
              <option value="done">Оброблено</option>
            </select>
          </div>

          {filteredRecords.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300">Немає інвентарів для відображення</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Дата додавання</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Назва справи</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Сигнатура справи</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Дата справи</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Дод. сигнатура</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Рік інвентаря</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Скани</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">Населені пункти</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Статус</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">Дії</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => (
                    <>
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.created_at ? new Date(record.created_at).toLocaleDateString('uk-UA') : '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.case_title || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.case_signature || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.case_date || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.additional_case_signature || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.inventory_year || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          {record.scans_url ? (
                            <a
                              href={record.scans_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              🔗 Відкрити
                            </a>
                          ) : '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <button
                            onClick={() => toggleExpandRecord(record.id)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            {record.points_count} {expandedRecordId === record.id ? '▼' : '▶'}
                          </button>
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${record.status === 'new'
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                                : record.status === 'review'
                                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                  : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              }`}
                          >
                            {record.status === 'new' && 'Очікує ідентифікації'}
                            {record.status === 'review' && 'Обробляється адміністратором'}
                            {record.status === 'done' && 'Оброблено'}
                          </span>
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {record.status === 'review' && (
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => confirmRecord(record)}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                              >
                                ✅ Підтвердити
                              </button>
                              <button
                                onClick={() => returnToIdentification(record)}
                                className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm"
                              >
                                🔄 На ідентифікацію
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {expandedRecordId === record.id && (
                        <tr>
                          <td colSpan={10} className="border border-gray-300 dark:border-gray-600 px-4 py-4 bg-gray-50 dark:bg-gray-800">
                            {loadingPoints ? (
                              <p className="text-center">Завантаження населених пунктів...</p>
                            ) : settlementPoints.length === 0 ? (
                              <p className="text-center text-gray-500">Немає населених пунктів</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <h3 className="font-semibold mb-3">Населені пункти ({settlementPoints.length}):</h3>
                                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                                  <thead className="bg-gray-200 dark:bg-gray-700">
                                    <tr>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Регіон</th>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Район</th>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Громада</th>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Населений пункт</th>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Автор</th>
                                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center">На карті</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {settlementPoints.map((point, idx) => (
                                      <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">{point.current_region}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">{point.current_district}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">{point.current_community}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                                          {point.current_settlement_type} {point.current_settlement_name}
                                        </td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">{point.email}</td>
                                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center">
                                          {point.latitude && point.longitude ? (
                                            <a
                                              href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}&zoom=15`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                              🗺️ Показати
                                            </a>
                                          ) : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}