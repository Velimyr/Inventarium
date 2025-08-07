import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import dynamic from 'next/dynamic';
import { useUser } from '../contexts/UserContext';

const EditableInventoryForm = dynamic(() => import('../components/EditableInventoryForm'), {
  ssr: false,
});

export default function MyDraftsPage() {
  const { user, loading: userLoading } = useUser();

  const [records, setRecords] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchDrafts = async () => {
      const { data, error } = await supabase
        .from('records_unverified')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setToast({ message: '❌ Помилка завантаження чернеток', type: 'error' });
      } else {
        setRecords(data || []);
        setFormData(data?.[0] || {});
      }

      setLoading(false);
    };

    fetchDrafts();
  }, [user, userLoading]);

  const goToRecord = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < records.length) {
      setIndex(newIndex);
      setFormData(records[newIndex]);
    }
  };

  const saveRecord = async () => {
    const recordId = formData.id;
    if (!recordId) return;

    const { error } = await supabase
      .from('records_unverified')
      .update(formData)
      .eq('id', recordId);

    if (error) {
      console.error(error);
      setToast({ message: '❌ Помилка при збереженні', type: 'error' });
    } else {
      setToast({ message: '✅ Чернетку збережено', type: 'success' });

      const updatedRecords = [...records];
      updatedRecords[index] = formData;
      setRecords(updatedRecords);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="p-6 min-h-screen flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <main className="p-6 min-h-screen flex items-center justify-center">
          <p className="text-red-600">⛔ Лише для авторизованих користувачів</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="p-6 min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">✏️ Мої чернетки</h1>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

          {records.length === 0 ? (
            <p>У вас немає чернеток</p>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => goToRecord(index - 1)}
                  disabled={index === 0}
                  className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                >
                  ⬅ Попередній
                </button>
                <button
                  onClick={() => goToRecord(index + 1)}
                  disabled={index === records.length - 1}
                  className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                >
                  Наступний ➡
                </button>
              </div>

              <EditableInventoryForm data={formData} onChange={setFormData} />

              <div className="mt-6 flex justify-end">
                <button
                  onClick={saveRecord}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  💾 Зберегти чернетку
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
