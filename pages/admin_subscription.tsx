import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import regionStructureRaw from '../public/data/region_structure.json';



export default function AdminSubscriptionPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);


  const [regionStructure, setRegionStructure] = useState<any>({});

const getSettlementNameByCode = (code: string): string => {
    for (const regionName in regionStructure) {
        const region = regionStructure[regionName];
        for (const districtName in region) {
            const district = region[districtName];
            for (const communityName in district) {
                const settlements = district[communityName];
                if (!Array.isArray(settlements)) continue;

                for (const settlement of settlements) {
                    if (settlement.code === code) {
                        const prefix = settlement.type === 'місто' ? 'м.' : 'с.';
                        return `${prefix} ${settlement.name}, ${communityName} громада, ${districtName} район, ${regionName} область`;
                    }
                }
            }
        }
    }
    return code;
};

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    setRegionStructure(regionStructureRaw);

    const fetchAdminAndSubscriptions = async () => {
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

      const { data: subs, error: subsError } = await supabase
        .from('settlement_subscription')
        .select('id,settlement_code,screenshot_url,user_id')
        .eq('status', 'new')
        .order('created_at', { ascending: true });

      if (subsError) {
        setError('❌ Помилка завантаження підписок');
        setLoading(false);
        console.log('Subs error:', subsError);
        return;
      }

      console.log('Subscriptions:', subs);
      setSubscriptions(subs || []);
      setLoading(false);
    };

    fetchAdminAndSubscriptions();
  }, [user, userLoading]);

  const updateSubscriptionStatus = async (id: string, newStatus: string) => {
    if (newStatus !== 'approved' && newStatus !== 'rejected') {
      setToast({ message: `❌ Некоректний статус: ${newStatus}`, type: 'error' });
      return;
    }
    try {
      const { error, data } = await supabase
        .from('settlement_subscription')
        .update({ status: newStatus })
        .eq('id', id);

      console.log('Update result:', data, error);

      if (error) {
        setToast({ message: `❌ Помилка при оновленні статусу: ${error.message}`, type: 'error' });
        return;
      }

      setToast({
        message: newStatus === 'approved' ? '✅ Підписку підтверджено' : '❌ Підписку відхилено',
        type: 'success',
      });

      setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
    } catch (err) {
      setToast({ message: '❌ Невідома помилка', type: 'error' });
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

  if (!isAdmin) {
    return (
      <>
        <Header />
        <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6 flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 font-medium text-center">⛔ У вас немає доступу до цієї сторінки</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Підписки на населені пункти для підтвердження</h1>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

          {subscriptions.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300">Немає нових підписок для підтвердження</p>
          ) : (
            <ul className="space-y-6">
              {subscriptions.map((sub) => (
                <li key={sub.id} className="border rounded p-4 flex items-center gap-4">
                  <img
                    src={sub.screenshot_url || '/placeholder.png'}
                    alt={`Зображення ${getSettlementNameByCode(sub.settlement_code)}`}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <p><strong>Населений пункт:</strong> {getSettlementNameByCode(sub.settlement_code)}</p>
                    <p><strong>ID користувача:</strong> {sub.user_id}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => updateSubscriptionStatus(sub.id, 'approved')}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Підтвердити
                    </button>
                    <button
                      onClick={() => updateSubscriptionStatus(sub.id, 'rejected')}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                      Відхилити
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}