import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../contexts/UserContext';
import SubscriptionNotifier from '../components/SubscriptionNotifier';
import regionStructure from '../public/data/region_structure.json';
// Отримати код населеного пункту за шляхом
const getSettlementCodeByPath = (
  structure: any,
  region: string,
  district: string,
  community: string,
  type: string,
  name: string
): string | null => {
  const regionNode = structure[region];
  if (!regionNode) return null;

  const districtNode = regionNode[district];
  if (!districtNode) return null;

  const communityNode = districtNode[community];
  if (!communityNode || !Array.isArray(communityNode)) return null;

  const settlement = communityNode.find(
    (s: any) => s.name === name && s.type === type
  );

  return settlement?.code || null;
};

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
  ssr: false,
});

export default function AdminPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<any>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [originalCoords, setOriginalCoords] = useState<{ latitude: any; longitude: any }>({ latitude: '', longitude: '' });
  const [notifyAfterSave, setNotifyAfterSave] = useState(false);
  const [savedRecordInfo, setSavedRecordInfo] = useState<any | null>(null);

  useEffect(() => {
    // Чекаємо, поки юзер завантажиться
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

      const { data: records } = await supabase
        .from('records_unverified')
        .select('*')
        .order('created_at', { ascending: true });

      setRecords(records || []);

      const first = records?.[0] || {};
      setFormData((prev: any) => ({
        ...prev,
        ...first,
        current_region: first.current_region || '',
        current_district: first.current_district || '',
        current_community: first.current_community || '',
        current_settlement_type: first.current_settlement_type || '',
        current_settlement_name: first.current_settlement_name || '',
        latitude: first.latitude || '',
        longitude: first.longitude || '',
      }));

      setOriginalCoords({
        latitude: first.latitude || '',
        longitude: first.longitude || '',
      });

      setLoading(false);
    };

    fetchAdminAndRecords();
  }, [user, userLoading]);

  const goToRecord = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < records.length) {
      const newRecord = records[newIndex];
      setIndex(newIndex);
      setFormData(newRecord);
      setOriginalCoords({
        latitude: newRecord.latitude,
        longitude: newRecord.longitude,
      });
    }
  };

  function parseLatLng(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value.toString());
    return isNaN(num) ? null : num;
  }

  const saveRecord = async () => {
    try {

       const matchQuery: Record<string, any> = {
        current_region: formData.current_region,
        current_district: formData.current_district,
        current_community: formData.current_community,
        current_settlement_type: formData.current_settlement_type,
        current_settlement_name: formData.current_settlement_name,
        case_signature: formData.case_signature,
      };

       // Додаткова умова для інвентарного року
        let existing;
        if (formData.inventory_year) {
            // Якщо рік вказано — шукаємо запис із точно таким самим роком
            ({ data: existing } = await supabase
                .from('records')
                .select('id')
                .match({ ...matchQuery, inventory_year: formData.inventory_year.trim() })
                .maybeSingle());
        } else {
            // Якщо рік НЕ вказано — шукаємо записи, де inventory_year IS NULL або ''
            ({ data: existing } = await supabase
                .from('records')
                .select('id')
                .match(matchQuery)
                .is('inventory_year', null)
                .maybeSingle());
        }

        if (existing) {            
            setToast({
                message: `Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів`,
                type: 'error',
            });
            return;
        }


      const { is_ukrainian_archive, ...recordToInsert } = formData;

      const parseIntegerOrNull = (value: any) => {
        if (value === "" || value === null || value === undefined) return null;
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
      };

      const parseFloatOrNull = (value: any) => {
        if (value === "" || value === null || value === undefined) return null;
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      };

      const preparedRecord = {
        ...recordToInsert,
        approved: true,
        //created_by: user?.id || null,
        latitude: parseFloatOrNull(formData.latitude) ?? parseFloatOrNull(originalCoords.latitude),
        longitude: parseFloatOrNull(formData.longitude) ?? parseFloatOrNull(originalCoords.longitude),
        pages_count: parseIntegerOrNull(recordToInsert.pages_count ?? formData.pages_count),
        inventory_year: parseIntegerOrNull(recordToInsert.inventory_year ?? formData.inventory_year),
        inventory_start_page: parseIntegerOrNull(recordToInsert.inventory_start_page ?? formData.inventory_start_page),
        created_by: formData.created_by ? formData.created_by : (user?.id || null),
      };

      const { error: insertError } = await supabase
        .from('records')
        .insert([preparedRecord]);

      if (insertError) {
        console.error(insertError);
        setToast({ message: '❌ Помилка при додаванні до бази', type: 'error' });
        return;
      }
      if (!insertError) {
        setNotifyAfterSave(true);
        const settlementCode = getSettlementCodeByPath(
          regionStructure,
          formData.current_region,
          formData.current_district,
          formData.current_community,
          formData.current_settlement_type,
          formData.current_settlement_name
        );
        setSavedRecordInfo({
          id: formData.id,
          settlement_code: settlementCode,
          settlement: `${formData.current_region}, ${formData.current_district}, ${formData.current_community}, ${formData.current_settlement_type} ${formData.current_settlement_name}`
        });
      }
      const { error: deleteError } = await supabase
       .from('records_unverified')
       .delete()
       .eq('id', formData.id);

      if (deleteError) {
       console.error('Delete error:', deleteError);
       setToast({ message: `Помилка видалення: ${deleteError.message}`, type: 'error' });
      } else {
       setToast({ message: '✅ Інвентар підтверджено і збережено', type: 'success' });
     }

      const updatedRecords = records.filter((_, i) => i !== index);
      setRecords(updatedRecords);

      if (updatedRecords.length === 0) {
        setFormData({});
        setIndex(0);
        setToast({
          message: '🎉 Усі інвентарі оброблено! Записів більше не залишилось.',
          type: 'success',
        });
      } else {
        const nextIndex = index >= updatedRecords.length ? updatedRecords.length - 1 : index;
        setIndex(nextIndex);
        setFormData(updatedRecords[nextIndex]);
        setOriginalCoords({
          latitude: updatedRecords[nextIndex].latitude,
          longitude: updatedRecords[nextIndex].longitude,
        });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: '❌ Невідома помилка при збереженні', type: 'error' });
    }
  };

  const rejectRecord = async () => {
    const confirmed = window.confirm('Ви впевнені, що хочете відхилити цей інвентар? Це призведе до його видалення.');

    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase.from('records_unverified').delete().eq('id', formData.id);

      if (error) {
        alert('❌ Помилка при відхиленні');
        console.error(error);
        return;
      }

      alert('❌ Запис відхилено та видалено');

      const updatedRecords = records.filter((_, i) => i !== index);
      setRecords(updatedRecords);

      if (updatedRecords.length === 0) {
        setIndex(0);
        setFormData({});
        setToast({
          message: '🎉 Усі інвентарі оброблено! Записів більше не залишилось.',
          type: 'success',
        });
      } else {
        const nextIndex = index >= updatedRecords.length ? updatedRecords.length - 1 : index;
        setIndex(nextIndex);
        setFormData(updatedRecords[nextIndex]);
        setOriginalCoords({
          latitude: updatedRecords[nextIndex].latitude,
          longitude: updatedRecords[nextIndex].longitude,
        });
      }
    } catch (err) {
      alert('❌ Помилка при відхиленні');
      console.error(err);
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
        <div className="max-w-2xl w-full mx-auto">
          <h1 className="text-2xl font-bold mb-6">🛠 Перевірте інвентар і внесіть зміни, якщо вони потрібні</h1>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
          {records.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300">Немає записів для перевірки</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => goToRecord(index - 1)}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                  disabled={index === 0}
                >
                  ⬅ Попередній
                </button>
                <button
                  type="button"
                  onClick={() => goToRecord(index + 1)}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                  disabled={index === records.length - 1}
                >
                  Наступний ➡
                </button>
              </div>

              <EditableInventoryForm data={formData} onChange={setFormData} />
              <div className="flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center mt-6 gap-2 sm:gap-4">
                {/* Кнопки навігації */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => goToRecord(index - 1)}
                    disabled={index === 0}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ⬅ Попередній
                  </button>
                  <button
                    type="button"
                    onClick={() => goToRecord(index + 1)}
                    disabled={index === records.length - 1}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Наступний ➡
                  </button>
                </div>

                {/* Кнопки дій */}
                <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={saveRecord}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ✅ Прийняти і зберегти
                  </button>
                  <button
                    type="button"
                    onClick={rejectRecord}
                    className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    ❌ Відхилити
                  </button>
                </div>
              </div>

            </>
          )}
        </div>
        {notifyAfterSave && savedRecordInfo && user?.id && (
          <SubscriptionNotifier
            settlement={savedRecordInfo.settlement}
            settlementCode={savedRecordInfo.settlement_code}
            link={`https://inventarium.org.ua/record/${savedRecordInfo.id}`}
            userId={user.id}
          />
        )}
      </main>

    </>
  );
}