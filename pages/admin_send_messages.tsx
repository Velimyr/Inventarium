import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import ReactMarkdown from 'react-markdown';
import { Send, User, Users, Search, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { getAdminUserIds, isAdminUser } from '../lib/adminUsers';

export default function AdminSendMessagesPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Список адміністраторів
  const [admins, setAdmins] = useState<any[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');

  // Опції відправки
  const [sendToAll, setSendToAll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Дані повідомлення
  const [messageType, setMessageType] = useState('other');
  const [messageText, setMessageText] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Відправка
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const fetchAdminData = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // Завантажуємо список адміністраторів
      const adminIds = await getAdminUserIds(supabase);
      if (adminIds.length === 0) {
        setAdmins([]);
        setSelectedAdmin(user.id);
        setLoading(false);
        return;
      }

      const { data: adminsList } = await supabase
        .from('profiles')
        .select('user_id, email')
        .in('user_id', adminIds);

      setAdmins(adminsList || []);
      setSelectedAdmin(user.id); // За замовчуванням поточний адмін

      setLoading(false);
    };

    fetchAdminData();
  }, [user, userLoading]);

  // Пошук користувачів
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, email')
      .ilike('email', `%${searchQuery}%`)
      .limit(20);

    if (error) {
      setToast({ message: '❌ Помилка пошуку користувачів', type: 'error' });
      return;
    }

    setSearchResults(data || []);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSendMessages = async () => {
    if (!messageText.trim()) {
      setToast({ message: '❌ Введіть текст повідомлення', type: 'error' });
      return;
    }

    if (!selectedAdmin) {
      setToast({ message: '❌ Оберіть адміністратора', type: 'error' });
      return;
    }

    if (!sendToAll && selectedUsers.length === 0) {
      setToast({ message: '❌ Оберіть хоча б одного користувача', type: 'error' });
      return;
    }

    setSending(true);

    try {
      let recipientIds: string[] = [];

      if (sendToAll) {
        // Отримуємо всіх користувачів
        const { data: allUsers, error } = await supabase
          .from('profiles')
          .select('user_id');

        if (error) {
          setToast({ message: '❌ Помилка отримання списку користувачів', type: 'error' });
          setSending(false);
          return;
        }

        recipientIds = allUsers?.map(u => u.user_id) || [];
      } else {
        recipientIds = selectedUsers;
      }

      // Створюємо повідомлення для кожного користувача
      const messages = recipientIds.map(toUserId => ({
        from_user_id: selectedAdmin,
        to_user_id: toUserId,
        message_type: messageType,
        message_text: messageText,
        event_date: new Date().toISOString(),
        is_read: false
      }));

      const { error: insertError } = await supabase
        .from('messages')
        .insert(messages);

      if (insertError) {
        setToast({ message: '❌ Помилка відправки повідомлень', type: 'error' });
        setSending(false);
        return;
      }

      setToast({
        message: `✅ Повідомлення відправлено ${recipientIds.length} користувачам`,
        type: 'success'
      });

      // Очищаємо форму
      setMessageText('');
      setSelectedUsers([]);
      setSearchQuery('');
      setSearchResults([]);

    } catch (err) {
      console.error(err);
      setToast({ message: '❌ Невідома помилка', type: 'error' });
    } finally {
      setSending(false);
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
          <p className="text-red-600 dark:text-red-400 text-[16px] text-center">
            ⛔ У вас немає доступу до цієї сторінки
          </p>
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
            <Send className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Розсилка повідомлень користувачам
            </h1>
          </div>

          <div className="max-w-[900px]">
            {/* Вибір адміністратора */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
              <label className="block text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold mb-[10px]">
                Від імені адміністратора:
              </label>
              <div className="relative">
                <select
                  value={selectedAdmin}
                  onChange={(e) => setSelectedAdmin(e.target.value)}
                  className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px]"
                >
                  {admins.map(admin => (
                    <option key={admin.user_id} value={admin.user_id}>
                      {admin.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
              </div>
            </section>

            {/* Вибір отримувачів */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
              <label className="block text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold mb-[10px]">
                Отримувачі:
              </label>
              <div className="flex items-center gap-[20px] mb-[15px]">
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input
                    type="radio"
                    checked={sendToAll}
                    onChange={() => setSendToAll(true)}
                    className="w-4 h-4 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <Users className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={2} />
                  <span className="text-gray-900 dark:text-white text-[14px]">Відправити всім</span>
                </label>
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input
                    type="radio"
                    checked={!sendToAll}
                    onChange={() => setSendToAll(false)}
                    className="w-4 h-4 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <User className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={2} />
                  <span className="text-gray-900 dark:text-white text-[14px]">Вибрати користувачів</span>
                </label>
              </div>

              {!sendToAll && (
                <div>
                  <div className="flex gap-[10px] mb-[15px]">
                    <input
                      type="text"
                      placeholder="Введіть email для пошуку..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      className="flex-1 px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none focus:border-[#2563EB] transition-colors"
                    />
                    <button
                      onClick={handleSearch}
                      className="flex items-center gap-[8px] px-[15px] h-[40px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                    >
                      <Search className="w-5 h-5 text-white" strokeWidth={2} />
                      <span className="text-white text-[14px] font-medium">Шукати</span>
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="p-[15px] border border-gray-300 dark:border-[#374151] rounded-lg bg-white dark:bg-[#111827] max-h-[240px] overflow-y-auto mb-[15px]">
                      <p className="text-gray-900 dark:text-white text-[14px] font-semibold mb-[10px]">
                        Результати пошуку:
                      </p>
                      <div className="space-y-[8px]">
                        {searchResults.map(user => (
                          <label key={user.user_id} className="flex items-center gap-[8px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.user_id)}
                              onChange={() => toggleUserSelection(user.user_id)}
                              className="w-4 h-4 rounded border-gray-300 dark:border-[#374151] text-[#2563EB] focus:ring-[#2563EB]"
                            />
                            <span className="text-gray-900 dark:text-white text-[13px]">{user.email}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUsers.length > 0 && (
                    <div className="p-[15px] border border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <p className="text-gray-900 dark:text-white text-[14px] font-semibold mb-[8px]">
                        Обрано користувачів: {selectedUsers.length}
                      </p>
                      <button
                        onClick={() => setSelectedUsers([])}
                        className="text-[#2563EB] hover:text-[#1D4ED8] text-[13px] underline"
                      >
                        Очистити вибір
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Тип повідомлення */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
              <label className="block text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold mb-[10px]">
                Тип повідомлення:
              </label>
              <div className="relative">
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value)}
                  className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px]"
                >
                  <option value="other">Загальне повідомлення</option>
                  <option value="approved">Інвентар підтверджено</option>
                  <option value="reject">Інвентар відхилено</option>
                  <option value="edit_approve">Редагування підтверджено</option>
                  <option value="edit_reject">Редагування відхилено</option>
                </select>
                <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
              </div>
            </section>

            {/* Текст повідомлення */}
            <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
              <label className="block text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold mb-[10px]">
                Текст повідомлення (Markdown):
              </label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={8}
                placeholder="Введіть текст повідомлення... Підтримується Markdown форматування."
                className="w-full px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] font-mono outline-none focus:border-[#2563EB] transition-colors resize-none"
              />
              <p className="text-gray-600 dark:text-gray-400 text-[12px] mt-[8px]">
                Підтримується Markdown: **жирний**, *курсив*, [посилання](url)
              </p>
            </section>

            {/* Превʼю */}
            <section className="mb-[20px]">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors mb-[10px]"
              >
                {showPreview ? (
                  <EyeOff className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                ) : (
                  <Eye className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                )}
                <span className="text-gray-900 dark:text-white text-[14px] font-medium">
                  {showPreview ? 'Сховати превʼю' : 'Показати превʼю'}
                </span>
              </button>

              {showPreview && (
                <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827]">
                  <p className="text-gray-900 dark:text-white text-[14px] font-semibold mb-[10px]">
                    Превʼю повідомлення:
                  </p>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#2563EB] hover:text-[#1D4ED8] underline"
                          />
                        ),
                      }}
                    >
                      {messageText || '*Тут буде відображено ваше повідомлення*'}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </section>

            {/* Кнопка відправки */}
            <button
              onClick={handleSendMessages}
              disabled={sending}
              className="flex items-center gap-[10px] px-[20px] h-[50px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5 text-white" strokeWidth={2} />
              <span className="text-white text-[16px] font-semibold">
                {sending ? 'Відправка...' : 'Відправити повідомлення'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
