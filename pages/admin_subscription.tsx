import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import regionStructureRaw from '../public/data/region_structure.json';
import {
  findSettlementByCode, formatSettlementLabel, type NestedStructure,
} from '../components/keys/regionData';
import { Bell, Check, X, User, MapPin } from 'lucide-react';
import { isAdminUser } from '../lib/adminUsers';

export default function AdminSubscriptionPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [regionStructure, setRegionStructure] = useState<NestedStructure | null>(null);

  const getSettlementNameByCode = (code: string): string => {
    const found = findSettlementByCode(regionStructure, code);
    return found ? formatSettlementLabel(found) : code;
  };

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    setRegionStructure(regionStructureRaw as NestedStructure);

    const fetchAdminAndSubscriptions = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
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

  if (!isAdmin) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 text-[16px] text-center">⛔ У вас немає доступу до цієї сторінки</p>
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
            <Bell className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Підписки на населені пункти для підтвердження
            </h1>
          </div>

          {subscriptions.length === 0 ? (
            <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] text-center">
              <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px]">
                Немає нових підписок для підтвердження
              </p>
            </div>
          ) : (
            <div className="space-y-[20px]">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]"
                >
                  <div className="flex flex-col md:flex-row gap-[20px]">
                    {/* Image */}
                    <div className="flex-shrink-0">
                      <img
                        src={sub.screenshot_url || '/placeholder.png'}
                        alt={`Зображення ${getSettlementNameByCode(sub.settlement_code)}`}
                        className="w-full md:w-[120px] h-[120px] object-cover rounded-lg border border-gray-300 dark:border-[#374151]"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-[10px]">
                      <div className="flex items-start gap-[10px]">
                        <MapPin className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                        <div>
                          <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[5px]">
                            Населений пункт:
                          </div>
                          <div className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
                            {getSettlementNameByCode(sub.settlement_code)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-[10px]">
                        <User className="w-5 h-5 text-gray-700 dark:text-white flex-shrink-0 mt-[2px]" strokeWidth={2} />
                        <div>
                          <div className="text-gray-700 dark:text-white text-[13px] font-semibold mb-[5px]">
                            ID користувача:
                          </div>
                          <div className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-mono">
                            {sub.user_id}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex md:flex-col gap-[10px] md:justify-center">
                      <button
                        onClick={() => updateSubscriptionStatus(sub.id, 'approved')}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                      >
                        <Check className="w-5 h-5 text-white" strokeWidth={2} />
                        <span className="text-white text-[14px] lg:text-[16px] font-medium">Підтвердити</span>
                      </button>
                      <button
                        onClick={() => updateSubscriptionStatus(sub.id, 'rejected')}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors"
                      >
                        <X className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                        <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium">Відхилити</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
