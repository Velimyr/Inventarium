import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import EditableInventoryForm from '../components/EditableInventoryForm';
import Toast from '../components/Toast';

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<any>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [originalCoords, setOriginalCoords] = useState<{ latitude: any; longitude: any }>({ latitude: '', longitude: '' });


  useEffect(() => {
    const fetchUserAndCheckAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('⛔ Ви не авторизовані');
        setLoading(false);
        return;
      }
      setUser(user);

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

      // 🔽 ось це додаємо:
      setOriginalCoords({
        latitude: first.latitude || '',
        longitude: first.longitude || '',
      });

      setLoading(false);
    };

    fetchUserAndCheckAdmin();
  }, []);


  const goToRecord = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < records.length) {
      const newRecord = records[newIndex];
      setIndex(newIndex);
      setFormData(records[newIndex]);
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
      // 1. Перевірка на дублікат
      // const { data: existing } = await supabase
      //   .from('records')
      //   .select('id')
      //   .match({
      //     current_region: formData.current_region,
      //     current_district: formData.current_district,
      //     current_community: formData.current_community,
      //     current_settlement_type: formData.current_settlement_type,
      //     current_settlement_name: formData.current_settlement_name,
      //     case_signature: formData.case_signature,
      //     inventory_year: formData.inventory_year,
      //   })
      //   .maybeSingle();
      const matchQuery: Record<string, any> = {
        current_region: formData.current_region,
        current_district: formData.current_district,
        current_community: formData.current_community,
        current_settlement_type: formData.current_settlement_type,
        current_settlement_name: formData.current_settlement_name,
        case_signature: formData.case_signature,
      };

      if (formData.inventory_year) {
        matchQuery.inventory_year = formData.inventory_year;
      }

      const { data: existing } = await supabase
        .from('records')
        .select('id')
        .match(matchQuery)
        .maybeSingle();


      if (existing) {
        setToast({
          message: '❗ Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів',
          type: 'error',
        });
        return;
      }

      // 2. Підготовка даних для вставки
      const { is_ukrainian_archive, ...recordToInsert } = formData;

      // const preparedRecord = {
      //   ...recordToInsert,
      //   approved: true,
      //   created_by: user?.id || null,
      //   latitude: formData.latitude || originalCoords.latitude || null,
      //   longitude: formData.longitude || originalCoords.longitude || null,
      // };
      const parseIntegerOrNull = (value) => {
        if (value === "" || value === null || value === undefined) return null;
        const num = parseInt(value, 10);
        return isNaN(num) ? null : num;
      };

      const parseFloatOrNull = (value) => {
        if (value === "" || value === null || value === undefined) return null;
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      };

      const preparedRecord = {
        ...recordToInsert,
        approved: true,
        created_by: user?.id || null,
        // Перетворюємо всі числові поля:
        latitude: parseFloatOrNull(formData.latitude) ?? parseFloatOrNull(originalCoords.latitude),
        longitude: parseFloatOrNull(formData.longitude) ?? parseFloatOrNull(originalCoords.longitude),

        pages_count: parseIntegerOrNull(recordToInsert.pages_count ?? formData.pages_count),
        inventory_year: parseIntegerOrNull(recordToInsert.inventory_year ?? formData.inventory_year),
        inventory_start_page: parseIntegerOrNull(recordToInsert.inventory_start_page ?? formData.inventory_start_page),
      };


      // 3. Вставка до records
      const { error: insertError } = await supabase
        .from('records')
        .insert([preparedRecord]);

      if (insertError) {
        console.error(insertError);
        setToast({ message: '❌ Помилка при додаванні до бази', type: 'error' });
        return;
      }

      // 4. Видалення з records_unverified
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

      // 5. Оновлення локального стану
      const updatedRecords = records.filter((_, i) => i !== index);
      setRecords(updatedRecords);

      // 6. Перехід до наступного запису або завершення
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
      }
    } catch (err) {
      console.error(err);
      setToast({ message: '❌ Невідома помилка при збереженні', type: 'error' });
    }
  };

  // Функція для відхилення запису 
  const rejectRecord = async () => {
    const confirmed = window.confirm('Ви впевнені, що хочете відхилити цей інвентар? Це призведе до його видалення.');

    if (!confirmed) {
      // Користувач скасував дію
      return;
    }

    try {
      // Видалення запису з records_unverified
      const { error } = await supabase.from('records_unverified').delete().eq('id', formData.id);

      if (error) {
        alert('❌ Помилка при відхиленні');
        console.error(error);
        return;
      }

      alert('❌ Запис відхилено та видалено');

      // Оновлення локального стану — видаляємо відхилений запис зі списку
      const updatedRecords = records.filter((_, i) => i !== index);
      setRecords(updatedRecords);

      // Встановлюємо форму на наступний запис, або очищуємо, якщо записів немає
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
              <EditableInventoryForm data={formData} onChange={setFormData} />
              <div className="flex justify-between items-center mt-6">
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
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={saveRecord}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ✅ Прийняти і зберегти
                  </button>
                  <button
                    type="button"
                    onClick={rejectRecord}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    ❌ Відхилити
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
