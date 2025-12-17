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

    const token = crypto.randomUUID()

    const { data, error } = await supabase
      .from('profiles')
      .update({ telegram_link_token: token })
      .eq('user_id', user.id)
      .select('user_id')

    if (error || !data || data.length === 0) {
      setToast({
        message: '❌ Профіль користувача не знайдено або немає доступу',
        type: 'error'
      })
      return
    }

    const telegramUrl = `https://t.me/inventarium_bot?start=${token}`
    window.open(telegramUrl, '_blank')
    setToast({ message: '✅ Посилання для Telegram згенеровано', type: 'success' })
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

          {/* Кнопка Telegram */}
          <div className="mt-6">
            <button
              onClick={connectTelegram}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Отримувати сповіщення в Telegram
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