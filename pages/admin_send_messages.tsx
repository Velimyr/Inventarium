import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import ReactMarkdown from 'react-markdown';

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

      // Завантажуємо список адміністраторів
      const { data: adminsList } = await supabase
        .from('profiles')
        .select('user_id, email')
        .in('user_id', (await supabase.from('admin_users').select('id')).data?.map(a => a.id) || []);

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
          <p className="text-red-600 dark:text-red-400 font-medium text-center">
            ⛔ У вас немає доступу до цієї сторінки
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Розсилка повідомлень користувачам</h1>

          {/* Вибір адміністратора */}
          <div className="mb-6">
            <label className="block font-semibold mb-2">Від імені адміністратора:</label>
            <select
              value={selectedAdmin}
              onChange={(e) => setSelectedAdmin(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            >
              {admins.map(admin => (
                <option key={admin.user_id} value={admin.user_id}>
                  {admin.email}
                </option>
              ))}
            </select>
          </div>

          {/* Вибір отримувачів */}
          <div className="mb-6">
            <label className="block font-semibold mb-2">Отримувачі:</label>
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={sendToAll}
                  onChange={() => setSendToAll(true)}
                />
                <span>Відправити всім</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!sendToAll}
                  onChange={() => setSendToAll(false)}
                />
                <span>Вибрати користувачів</span>
              </label>
            </div>

            {!sendToAll && (
              <div>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Введіть email для пошуку..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1 p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Шукати
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="border rounded p-4 max-h-60 overflow-y-auto mb-4 bg-gray-50 dark:bg-gray-800">
                    <p className="font-semibold mb-2">Результати пошуку:</p>
                    {searchResults.map(user => (
                      <label key={user.user_id} className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.user_id)}
                          onChange={() => toggleUserSelection(user.user_id)}
                        />
                        <span>{user.email}</span>
                      </label>
                    ))}
                  </div>
                )}

                {selectedUsers.length > 0 && (
                  <div className="border rounded p-4 bg-blue-50 dark:bg-blue-900/20">
                    <p className="font-semibold mb-2">
                      Обрано користувачів: {selectedUsers.length}
                    </p>
                    <button
                      onClick={() => setSelectedUsers([])}
                      className="text-sm text-blue-600 dark:text-blue-400 underline"
                    >
                      Очистити вибір
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Тип повідомлення */}
          <div className="mb-6">
            <label className="block font-semibold mb-2">Тип повідомлення:</label>
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            >
              <option value="other">Загальне повідомлення</option>
              <option value="approved">Інвентар підтверджено</option>
              <option value="reject">Інвентар відхилено</option>
              <option value="edit_approve">Редагування підтверджено</option>
              <option value="edit_reject">Редагування відхилено</option>
            </select>
          </div>

          {/* Текст повідомлення */}
          <div className="mb-6">
            <label className="block font-semibold mb-2">Текст повідомлення (Markdown):</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={8}
              placeholder="Введіть текст повідомлення... Підтримується Markdown форматування."
              className="w-full p-3 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Підтримується Markdown: **жирний**, *курсив*, [посилання](url)
            </p>
          </div>

          {/* Превʼю */}
          <div className="mb-6">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 mb-2"
            >
              {showPreview ? 'Сховати превʼю' : 'Показати превʼю'}
            </button>

            {showPreview && (
              <div className="border rounded p-4 bg-gray-50 dark:bg-gray-800">
                <p className="font-semibold mb-2">Превʼю повідомлення:</p>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      a: ({ node, ...props }) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline"
                        />
                      ),
                    }}
                  >
                    {messageText || '*Тут буде відображено ваше повідомлення*'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Кнопка відправки */}
          <div className="flex gap-4">
            <button
              onClick={handleSendMessages}
              disabled={sending}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {sending ? 'Відправка...' : 'Відправити повідомлення'}
            </button>
          </div>
        </div>
      </main>

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