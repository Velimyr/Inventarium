import { useEffect, useState } from 'react'
import Header from '../components/header'
import { useUser } from '../contexts/UserContext'
import { supabase } from '../lib/supabaseClient'
import Toast from '../components/Toast'

interface Message {
  message_id: string
  message_type: string
  message_text: string
  event_date: string
  is_read: boolean
}

export default function MessagesPage() {
  const { user, loading: userLoading } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [isTelegramLinked, setIsTelegramLinked] = useState(false)

  useEffect(() => {
    if (userLoading) return
    console.log("user_id: ", user);

    if (!user) {
      setError('⛔ Ви не авторизовані')
      setLoading(false)
      return
    }

    loadMessages()
    checkTelegramLink()
  }, [user, userLoading])

  async function loadMessages() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('message_id, message_type, message_text, event_date, is_read')
        .eq('to_user_id', user.id)
        .order('event_date', { ascending: false })

      if (error) {
        console.error('Помилка завантаження повідомлень:', error)
        setError('Помилка завантаження повідомлень')
        return
      }

      setMessages(data || [])
    } catch (err) {
      console.error('Неочікувана помилка:', err)
      setError('Неочікувана помилка')
    } finally {
      setLoading(false)
    }
  }

  async function checkTelegramLink() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .eq('user_id', user.id)
        .single()

      if (!error && data && data.telegram_chat_id) {
        setIsTelegramLinked(true)
      }
    } catch (err) {
      console.error('Помилка перевірки Telegram:', err)
    }
  }

  function getMessageTypeLabel(type: string): string {
    switch (type) {
      case 'approve':
        return 'Ваш інвентар підтверджено'
      case 'edit_approve':
        return 'Ваше редагування інвентарю підтверджено'
      case 'other':
        return 'Загальне повідомлення'
      default:
        return 'Загальне повідомлення'
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  async function markAsRead(messageId: string) {
    if (!user) return

    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true, read_date: new Date().toISOString() })
        .eq('message_id', messageId)

      if (error) {
        console.error('Помилка оновлення статусу:', error)
        return
      }

      // Оновлюємо локальний стан
      setMessages((prev) =>
        prev.map((msg) =>
          msg.message_id === messageId ? { ...msg, is_read: true } : msg
        )
      )
    } catch (err) {
      console.error('Неочікувана помилка:', err)
    }
  }

  async function markAllAsRead() {
    if (!user) return

    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true, read_date: new Date().toISOString() })
        .eq('to_user_id', user.id)
        .eq('is_read', false)

      if (error) {
        console.error('Помилка оновлення статусу:', error)
        setToast({
          message: '❌ Не вдалося відмітити всі повідомлення',
          type: 'error'
        })
        return
      }

      // Оновлюємо локальний стан
      setMessages((prev) =>
        prev.map((msg) => ({ ...msg, is_read: true }))
      )

      setToast({
        message: '✅ Всі повідомлення відмічено як прочитані',
        type: 'success'
      })
    } catch (err) {
      console.error('Неочікувана помилка:', err)
      setToast({
        message: '❌ Неочікувана помилка',
        type: 'error'
      })
    }
  }

  async function handleCardClick(messageId: string, isRead: boolean) {
    const newExpanded = expandedCard === messageId ? null : messageId
    setExpandedCard(newExpanded)

    // Якщо картка розгортається і повідомлення не прочитане - відмічаємо
    if (newExpanded && !isRead) {
      await markAsRead(messageId)
    }
  }

  async function handleRowClick(messageId: string, isRead: boolean) {
    if (!isRead) {
      await markAsRead(messageId)
    }
  }

  async function connectTelegram() {
    if (!user) return
  
    try {
      const token = crypto.randomUUID()
  
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('user_id, telegram_link_token')
        .eq('user_id', user.id)
        .single()
  
      if (fetchError) {
        console.error('Помилка отримання профілю:', fetchError)
        setToast({
          message: `❌ Помилка: ${fetchError.message}`,
          type: 'error'
        })
        return
      }
  
      if (!existingProfile) {
        setToast({
          message: '❌ Профіль користувача не знайдено',
          type: 'error'
        })
        return
      }
  
      const { data, error } = await supabase
        .from('profiles')
        .update({ telegram_link_token: token })
        .eq('user_id', user.id)
        .select('telegram_link_token')
        .single()
  
      if (error) {
        console.error('Помилка оновлення токену:', error)
        setToast({
          message: `❌ Помилка оновлення: ${error.message}`,
          type: 'error'
        })
        return
      }
  
      if (!data) {
        setToast({
          message: '❌ Не вдалося оновити токен',
          type: 'error'
        })
        return
      }
  
      const telegramUrl = `https://t.me/inventarium_bot?start=${token}`
      window.open(telegramUrl, '_blank')
      setToast({ message: '✅ Посилання для Telegram згенеровано', type: 'success' })
    } catch (err) {
      console.error('Неочікувана помилка:', err)
      setToast({
        message: '❌ Неочікувана помилка при генерації токену',
        type: 'error'
      })
    }
  }

  async function sendTestMessage() {
    if (!user) return

    try {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .eq('user_id', user.id)
        .single()

      if (fetchError || !profile || !profile.telegram_chat_id) {
        setToast({
          message: '❌ Telegram не підключено. Спочатку підключіть Telegram.',
          type: 'error'
        })
        return
      }

      const response = await fetch('/api/send-telegram-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: profile.telegram_chat_id,
          message: '🔔 Тестове повідомлення з Inventarium!\n\nПереглянути запис: https://inventarium.org.ua/record/c1169e63-c053-4d2f-bc91-4f56cf8e4816'
        })
      })

      if (!response.ok) {
        throw new Error('Помилка відправки повідомлення')
      }

      setToast({ message: '✅ Тестове повідомлення відправлено в Telegram', type: 'success' })
    } catch (err) {
      console.error('Помилка відправки тестового повідомлення:', err)
      setToast({
        message: '❌ Не вдалося відправити повідомлення',
        type: 'error'
      })
    }
  }

  if (userLoading || loading) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center">
          <p>Завантаження...</p>
        </main>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 flex items-center justify-center">
          <p>{error}</p>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="px-8 py-6 w-full min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="max-w-screen-lg mx-auto">
          <h1 className="text-3xl font-bold mb-8">Повідомлення</h1>

          {/* Кнопки над таблицею */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={connectTelegram}
              disabled={isTelegramLinked}
              className={`px-4 py-2 rounded ${
                isTelegramLinked
                  ? 'bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isTelegramLinked ? 'Telegram прив\'язаний' : 'Прив\'язати Telegram'}
            </button>
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Прочитати все
            </button>
          </div>

          {/* Десктопна таблиця */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full border border-gray-300 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Дата</th>
                  <th className="px-4 py-2 text-left">Тип</th>
                  <th className="px-4 py-2 text-left">Повідомлення</th>
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr className="border-t border-gray-300 dark:border-gray-700">
                    <td colSpan={3} className="px-4 py-2 text-gray-500 text-center">
                      Повідомлень поки немає
                    </td>
                  </tr>
                ) : (
                  messages.map((msg) => (
                    <tr
                      key={msg.message_id}
                      onClick={() => handleRowClick(msg.message_id, msg.is_read)}
                      className={`border-t border-gray-300 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        !msg.is_read ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : ''
                      }`}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatDate(msg.event_date)}
                      </td>
                      <td className="px-4 py-2">
                        {getMessageTypeLabel(msg.message_type)}
                      </td>
                      <td className="px-4 py-2">{msg.message_text}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Мобільні картки */}
          <div className="md:hidden space-y-4">
            {messages.length === 0 ? (
              <div className="border border-gray-300 dark:border-gray-700 rounded p-4 text-center text-gray-500">
                Повідомлень поки немає
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.message_id}
                  className={`border border-gray-300 dark:border-gray-700 rounded overflow-hidden ${
                    !msg.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <button
                    onClick={() => handleCardClick(msg.message_id, msg.is_read)}
                    className="w-full px-4 py-3 flex justify-between items-center text-left"
                  >
                    <div className="flex-1">
                      <div className={`text-sm ${!msg.is_read ? 'font-semibold' : 'font-medium'}`}>
                        {getMessageTypeLabel(msg.message_type)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(msg.event_date)}
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 transition-transform ${
                        expandedCard === msg.message_id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {expandedCard === msg.message_id && (
                    <div className="px-4 pb-3 border-t border-gray-300 dark:border-gray-700 pt-3">
                      <p className="text-sm">{msg.message_text}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Кнопка тестового повідомлення під таблицею */}
          <div className="mt-6">
            <button
              onClick={sendTestMessage}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Відправити тестове повідомлення
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
  )
}