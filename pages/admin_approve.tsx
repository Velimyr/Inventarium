import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import AdminSectionTabs, { APPROVE_SECTION_TITLE, APPROVE_TABS, withCount } from '../components/AdminSectionTabs';
import dynamic from 'next/dynamic';
import { useUser } from '../contexts/UserContext';
import SubscriptionNotifier from '../components/SubscriptionNotifier';
import regionStructure from '../public/data/region_structure.json';
import { getSettlementCodeByPath, type NestedStructure } from '../components/keys/regionData';
import { sendNotification } from '../components/notifications';
import { Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { isAdminUser } from '../lib/adminUsers';
import { findDuplicateVerifiedRecord, normalizeKeyFields } from '../lib/adminApproveUtils';
import { findRecordWithAdditionalSignature } from '../lib/duplicateCheck';
import DuplicateWarnings from '../components/DuplicateWarnings';
import { fromSignatureList, resolveIsUkrainianArchive, validateCaseSignature } from '../lib/caseSignature';

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
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const fetchAdminAndRecords = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
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

  const saveRecord = async () => {
    try {
      // Для чернеток, доданих до появи колонки, прапорець відновлюємо з даних
      const recordWithFlag = {
        ...formData,
        is_ukrainian_archive: resolveIsUkrainianArchive(formData),
      };

      const signatureError = validateCaseSignature(recordWithFlag);
      if (signatureError) {
        setToast({ message: `❌ ${signatureError}`, type: 'error' });
        return;
      }

      const existing = await findDuplicateVerifiedRecord(formData);

      if (existing) {
        setToast({
          message: `Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів`,
          type: 'error',
        });
        return;
      }

      // Той самий шифр уже вказано як додатковий шифр справи в іншому записі
      // цього населеного пункту.
      const crossMatch = await findRecordWithAdditionalSignature(formData.case_signature, formData);
      if (crossMatch) {
        setToast({
          message: `Шифр справи «${formData.case_signature}» вже вказано як додатковий шифр справи в іншому записі цього населеного пункту.`,
          type: 'error',
        });
        return;
      }

      // is_ukrainian_archive зберігається разом із записом — див. adminApproveUtils
      const recordToInsert = normalizeKeyFields(recordWithFlag);

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
        additional_case_signature: fromSignatureList(formData.additional_case_signature),
        latitude: parseFloatOrNull(formData.latitude) ?? parseFloatOrNull(originalCoords.latitude),
        longitude: parseFloatOrNull(formData.longitude) ?? parseFloatOrNull(originalCoords.longitude),
        pages_count: parseIntegerOrNull(recordToInsert.pages_count ?? formData.pages_count),
        inventory_year: parseIntegerOrNull(recordToInsert.inventory_year ?? formData.inventory_year),
        // ВИПРАВЛЕНО: зберігаємо як рядок, без конвертації в число
        inventory_start_page: recordToInsert.inventory_start_page ?? formData.inventory_start_page ?? null,
        created_by: formData.created_by ? formData.created_by : (user?.id || null),
      };

      const { error: insertError } = await supabase
        .from('records')
        .insert([preparedRecord]);

      if (insertError) {
        console.error(insertError);
        // 23505 — унікальне обмеження БД (unique_inventory_verified_record):
        // запис уже є в реєстрі, навіть якщо попередня перевірка його не побачила.
        if ((insertError as any).code === '23505') {
          setToast({
            message: 'Такий інвентар уже існує. Спробуйте пошукати його в реєстрі інвентарів',
            type: 'error',
          });
        } else {
          setToast({ message: '❌ Помилка при додаванні до бази', type: 'error' });
        }
        return;
      }

      if (!insertError) {
        setNotifyAfterSave(true);
        const settlementCode = getSettlementCodeByPath(regionStructure as NestedStructure, {
          country: formData.current_country,
          region: formData.current_region,
          district: formData.current_district,
          community: formData.current_community,
          type: formData.current_settlement_type,
          name: formData.current_settlement_name,
        });
        setSavedRecordInfo({
          id: formData.id,
          settlement_code: settlementCode,
          settlement: [
            formData.current_country, formData.current_region, formData.current_district,
            formData.current_community,
            `${formData.current_settlement_type} ${formData.current_settlement_name}`,
          ].filter(Boolean).join(', ')
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
        const recordUrl = `${window.location.origin}/record/${formData.id}`;
        const messageText =
          `Ваш інвентар успішно підтверджено адміністратором.\n\n` +
          `[Переглянути інвентар можна тут](${recordUrl})`;

        await sendNotification({
          fromUserId: user.id,
          toUserId: formData.created_by,
          messageType: 'approved',
          messageText
        });

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
    const confirmed = window.confirm(
      'Ви впевнені, що хочете відхилити цей інвентар? Це призведе до його видалення.'
    );

    if (!confirmed) return;

    const reason = window.prompt('Вкажіть причину відхилення (необовʼязково):');

    try {
      const { error } = await supabase
        .from('records_unverified')
        .delete()
        .eq('id', formData.id);

      if (error) {
        alert('❌ Помилка при відхиленні');
        console.error(error);
        return;
      }

      let messageText = 'Ваш інвентар відхилено адміністратором.';

      if (reason && reason.trim().length > 0) {
        messageText += `\n\nПричина:\n${reason.trim()}`;
      }

      await sendNotification({
        fromUserId: user.id,
        toUserId: formData.created_by,
        messageType: 'reject',
        messageText
      });

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
          <p className="text-red-600 dark:text-red-400 font-medium text-center text-[18px]">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          <AdminSectionTabs
            title={APPROVE_SECTION_TITLE}
            tabs={withCount(APPROVE_TABS, '/admin_approve', records.length)}
            activeHref="/admin_approve"
            description="Перевірте інвентар і внесіть зміни, якщо вони потрібні."
          />

          {records.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300 text-[16px]">Немає записів для перевірки</p>
          ) : (
            <>
              {/* Navigation Info + верхня навігація */}
              <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[20px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                  Запис <span className="font-bold">{index + 1}</span> з <span className="font-bold">{records.length}</span>
                </p>
                <div className="flex items-center gap-[10px]">
                  <button
                    onClick={() => goToRecord(index - 1)}
                    disabled={index === 0}
                    className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">Попередній</span>
                  </button>
                  <button
                    onClick={() => goToRecord(index + 1)}
                    disabled={index === records.length - 1}
                    className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">Наступний</span>
                    <ChevronRight className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
                  </button>
                </div>
              </div>

              <DuplicateWarnings record={formData} />

              <EditableInventoryForm data={formData} onChange={setFormData} />

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-[15px] mt-[20px]">
                <button
                  onClick={() => goToRecord(index - 1)}
                  disabled={index === 0}
                  className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
                  <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                    Попередній
                  </span>
                </button>

                <button
                  onClick={() => goToRecord(index + 1)}
                  disabled={index === records.length - 1}
                  className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                    Наступний
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
                </button>

                <div className="flex-1"></div>

                <button
                  onClick={saveRecord}
                  className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] transition-colors"
                >
                  <Save className="w-4 h-4 text-white" strokeWidth={1.6} />
                  <span className="text-white text-[14px] lg:text-[16px] font-medium">
                    Прийняти і зберегти
                  </span>
                </button>

                <button
                  onClick={rejectRecord}
                  className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#EC221F] hover:bg-[#C81E1B] transition-colors"
                >
                  <X className="w-4 h-4 text-white" strokeWidth={1.6} />
                  <span className="text-white text-[14px] lg:text-[16px] font-medium">
                    Відхилити
                  </span>
                </button>
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
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
