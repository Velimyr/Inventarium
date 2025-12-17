import { useEffect, useState } from 'react'
import Header from '../components/header'
import { useUser } from '../contexts/UserContext'
import { supabase } from '../lib/supabaseClient'
import Toast from '../components/Toast'

export default function MessagesPage() {
  const { user, loading: userLoading } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (userLoading) return

    if (!user) {
      setError('⛔ Ви не авторизовані')
      setLoading(false)
      return
    }

    // поки що нічого не вантажимо — заглушка
    setLoading(false)
  }, [user, userLoading])

  async function connectTelegram() {
    if (!user) return
  
    try {
      const token = crypto.randomUUID()
  
      // Спочатку перевіряємо, чи існує профіль
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
  
      // Оновлюємо токен
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
  
      console.log('Токен успішно створено:', data.telegram_link_token)
  
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
      // Отримуємо telegram_chat_id користувача
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

      // Відправляємо тестове повідомлення через API
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

          {/* Таблиця-заглушка */}
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Дата</th>
                  <th className="px-4 py-2 text-left">Заголовок</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-300 dark:border-gray-700">
                  <td className="px-4 py-2 text-gray-500">—</td>
                  <td className="px-4 py-2 text-gray-500">
                    Повідомлень поки немає
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Кнопки Telegram */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={connectTelegram}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Отримувати сповіщення в Telegram
            </button>
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