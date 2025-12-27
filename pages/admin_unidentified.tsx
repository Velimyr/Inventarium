import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { Search, Check, RotateCcw, ChevronDown, ChevronRight, ExternalLink, MapPin, Mail } from 'lucide-react';

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
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 text-[16px] text-center">{error}</p>
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
          <div className="flex items-center gap-[10px] mb-[20px] lg:mb-[30px]">
            <Search className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Неідентифіковані інвентарі
            </h1>
          </div>

          {/* Filter */}
          <div className="mb-[20px]">
            <label className="block text-gray-900 dark:text-white text-[14px] font-medium mb-[10px]">
              Фільтр по статусу:
            </label>
            <div className="relative max-w-[300px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px]"
              >
                <option value="all">Всі</option>
                <option value="new">Очікує ідентифікації</option>
                <option value="review">Обробляється адміністратором</option>
                <option value="done">Оброблено</option>
              </select>
              <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] text-center">
              <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px]">
                Немає інвентарів для відображення
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-[#374151]">
                <thead className="bg-gray-100 dark:bg-[#1F2937]">
                  <tr>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Дата додавання</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Назва справи</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Сигнатура</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Дата справи</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Дод. сигнатура</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Рік</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Скани</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-center text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold whitespace-nowrap">Н.п.</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-left text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Статус</th>
                    <th className="border border-gray-300 dark:border-[#374151] p-[10px] text-center text-gray-900 dark:text-white text-[13px] lg:text-[14px] font-semibold">Дії</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record, index) => (
                    <>
                      <tr 
                        key={record.id} 
                        className={`${index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'} hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors`}
                      >
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px] whitespace-nowrap">
                          {record.created_at ? new Date(record.created_at).toLocaleDateString('uk-UA') : '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.case_title || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.case_signature || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.case_date || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.additional_case_signature || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.inventory_year || '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-gray-900 dark:text-white text-[13px]">
                          {record.scans_url ? (
                            <a
                              href={record.scans_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-[5px] text-[#2563EB] hover:text-[#1D4ED8] underline"
                            >
                              <ExternalLink className="w-3 h-3" strokeWidth={2} />
                              Відкрити
                            </a>
                          ) : '—'}
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px] text-center">
                          <button
                            onClick={() => toggleExpandRecord(record.id)}
                            className="inline-flex items-center gap-[5px] text-[#2563EB] hover:text-[#1D4ED8] font-medium text-[13px]"
                          >
                            {record.points_count}
                            {expandedRecordId === record.id ? (
                              <ChevronDown className="w-4 h-4" strokeWidth={2} />
                            ) : (
                              <ChevronRight className="w-4 h-4" strokeWidth={2} />
                            )}
                          </button>
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px]">
                          <span
                            className={`inline-block px-[8px] py-[4px] rounded text-[12px] font-medium ${
                              record.status === 'new'
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                                : record.status === 'review'
                                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                  : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                            }`}
                          >
                            {record.status === 'new' && 'Очікує'}
                            {record.status === 'review' && 'Обробляється'}
                            {record.status === 'done' && 'Оброблено'}
                          </span>
                        </td>
                        <td className="border border-gray-300 dark:border-[#374151] p-[10px]">
                          {record.status === 'review' && (
                            <div className="flex gap-[8px] justify-center flex-wrap">
                              <button
                                onClick={() => confirmRecord(record)}
                                className="inline-flex items-center gap-[5px] px-[10px] py-[6px] bg-green-600 hover:bg-green-700 text-white rounded text-[12px] font-medium transition-colors"
                              >
                                <Check className="w-3 h-3" strokeWidth={2} />
                                Підтвердити
                              </button>
                              <button
                                onClick={() => returnToIdentification(record)}
                                className="inline-flex items-center gap-[5px] px-[10px] py-[6px] bg-orange-600 hover:bg-orange-700 text-white rounded text-[12px] font-medium transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" strokeWidth={2} />
                                Повернути
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedRecordId === record.id && (
                        <tr>
                          <td colSpan={10} className="border border-gray-300 dark:border-[#374151] p-[15px] bg-gray-100 dark:bg-[#111827]">
                            {loadingPoints ? (
                              <p className="text-center text-gray-900 dark:text-white text-[14px]">Завантаження населених пунктів...</p>
                            ) : settlementPoints.length === 0 ? (
                              <p className="text-center text-gray-500 dark:text-gray-400 text-[14px]">Немає населених пунктів</p>
                            ) : (
                              <div>
                                <h3 className="text-gray-900 dark:text-white text-[16px] font-semibold mb-[10px]">
                                  Населені пункти ({settlementPoints.length}):
                                </h3>
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse border border-gray-300 dark:border-[#374151]">
                                    <thead className="bg-gray-200 dark:bg-[#1F2937]">
                                      <tr>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-left text-gray-900 dark:text-white text-[12px] font-semibold">Регіон</th>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-left text-gray-900 dark:text-white text-[12px] font-semibold">Район</th>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-left text-gray-900 dark:text-white text-[12px] font-semibold">Громада</th>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-left text-gray-900 dark:text-white text-[12px] font-semibold">Населений пункт</th>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-left text-gray-900 dark:text-white text-[12px] font-semibold">Автор</th>
                                        <th className="border border-gray-300 dark:border-[#374151] p-[8px] text-center text-gray-900 dark:text-white text-[12px] font-semibold">Карта</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {settlementPoints.map((point, idx) => (
                                        <tr key={idx} className={`${idx % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'} hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors`}>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-gray-900 dark:text-white text-[12px]">{point.current_region || '—'}</td>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-gray-900 dark:text-white text-[12px]">{point.current_district || '—'}</td>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-gray-900 dark:text-white text-[12px]">{point.current_community || '—'}</td>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-gray-900 dark:text-white text-[12px]">
                                            {point.current_settlement_type} {point.current_settlement_name}
                                          </td>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-gray-900 dark:text-white text-[12px]">
                                            <div className="flex items-center gap-[5px]">
                                              <Mail className="w-3 h-3" strokeWidth={2} />
                                              {point.email || '—'}
                                            </div>
                                          </td>
                                          <td className="border border-gray-300 dark:border-[#374151] p-[8px] text-center">
                                            {point.latitude && point.longitude ? (
                                              <a
                                                href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}&zoom=15`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-[5px] text-[#2563EB] hover:text-[#1D4ED8] underline text-[12px]"
                                              >
                                                <MapPin className="w-3 h-3" strokeWidth={2} />
                                                Показати
                                              </a>
                                            ) : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}