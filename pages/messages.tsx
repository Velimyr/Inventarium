import { useEffect, useState } from 'react'
import Header from '../components/header'
import { useUser } from '../contexts/UserContext'
import { supabase } from '../lib/supabaseClient'
import Toast from '../components/Toast'
import ReactMarkdown from 'react-markdown'

interface Message {
    message_id: string
    message_type: string
    message_text: string
    event_date: string
    is_read: boolean
}

const PAGE_SIZE = 20

export default function MessagesPage() {
    const { user, loading: userLoading } = useUser()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [expandedCard, setExpandedCard] = useState<string | null>(null)
    const [expandedRow, setExpandedRow] = useState<string | null>(null)
    const [isTelegramLinked, setIsTelegramLinked] = useState(false)
    const [page, setPage] = useState(0)

    useEffect(() => {
        if (userLoading) return

        if (!user) {
            setError('⛔ Ви не авторизовані')
            setLoading(false)
            return
        }

        loadMessages()
        checkTelegramLink()
    }, [user, userLoading, page])

    async function loadMessages() {
        if (!user) return

        setLoading(true)

        try {
            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            const { data, error } = await supabase
                .from('messages')
                .select('message_id, message_type, message_text, event_date, is_read')
                .eq('to_user_id', user.id)
                .order('event_date', { ascending: false })
                .range(from, to)

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
            case 'approved':
                return 'Ваш інвентар підтверджено'
            case 'reject':
                return 'Ваш інвентар відхилено'
            case 'edit_approve':
                return 'Ваше редагування інвентарю підтверджено'
            case 'edit_reject':
                return 'Ваше редагування інвентарю відхилено'
            case 'new':
                return 'Новий інвентар додано'
            case 'new_identified':
                return 'Новий інвентар ідентифіковано'
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

    function truncateToFirstLine(text: string): { short: string; hasMore: boolean } {
        const firstLine = text.split('\n')[0]
        const hasMore = text.includes('\n') || firstLine.length > 100
        return {
            short: firstLine.length > 100 ? firstLine.substring(0, 100) : firstLine,
            hasMore
        }
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

        if (newExpanded && !isRead) {
            await markAsRead(messageId)
        }
    }

    async function handleRowClick(messageId: string, isRead: boolean) {
        const newExpanded = expandedRow === messageId ? null : messageId
        setExpandedRow(newExpanded)

        if (newExpanded && !isRead) {
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
                    message: `❌ Помилка оновлення`,
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
                    {/* Заголовок і кнопки */}
                    <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <h1 className="text-3xl font-bold">Мої повідомлення</h1>

                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={connectTelegram}
                                disabled={isTelegramLinked}
                                title={isTelegramLinked ? 'Telegram прив\'язаний' : 'Прив\'язати Telegram'}
                                className={`px-3 py-2 rounded flex items-center gap-2 ${isTelegramLinked
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                                </svg>
                                <span className="text-sm">
                                    {isTelegramLinked ? 'Прив\'язаний' : 'Прив\'язати'}
                                </span>
                            </button>

                            <button
                                onClick={markAllAsRead}
                                title="Прочитати все"
                                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center justify-center"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Десктопна таблиця */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full border border-gray-300 dark:border-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-2 text-left w-40">Дата</th>
                                    <th className="px-4 py-2 text-left w-64">Тип</th>
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
                                    messages.map((msg) => {
                                        const { short, hasMore } = truncateToFirstLine(msg.message_text)
                                        const isExpanded = expandedRow === msg.message_id

                                        return (
                                            <tr
                                                key={msg.message_id}
                                                onClick={() => handleRowClick(msg.message_id, msg.is_read)}
                                                className={`border-t border-gray-300 dark:border-gray-700 cursor-pointer transition-colors ${!msg.is_read
                                                    ? 'bg-blue-100 dark:bg-blue-900/40 font-bold hover:bg-blue-200 dark:hover:bg-blue-900/60'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 opacity-60'
                                                    }`}
                                            >
                                                <td className="px-4 py-3 whitespace-nowrap align-top">
                                                    {formatDate(msg.event_date)}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {getMessageTypeLabel(msg.message_type)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isExpanded ? (
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
                                                            {msg.message_text}
                                                        </ReactMarkdown>
                                                    ) : (
                                                        <div>
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
                                                                {short}
                                                            </ReactMarkdown>
                                                            {hasMore && (
                                                                <span className="text-gray-500 dark:text-gray-400 ml-1">[...]</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Мобільні картки */}
                    <div className="md:hidden space-y-3">
                        {messages.length === 0 ? (
                            <div className="border border-gray-300 dark:border-gray-700 rounded p-4 text-center text-gray-500">
                                Повідомлень поки немає
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.message_id}
                                    className={`border rounded overflow-hidden transition-all ${!msg.is_read
                                        ? 'border-blue-400 dark:border-blue-600 bg-blue-100 dark:bg-blue-900/40 shadow-md'
                                        : 'border-gray-300 dark:border-gray-700 opacity-60'
                                        }`}
                                >
                                    <button
                                        onClick={() => handleCardClick(msg.message_id, msg.is_read)}
                                        className="w-full px-4 py-3 flex justify-between items-center text-left"
                                    >
                                        <div className="flex-1">
                                            <div className={`text-sm ${!msg.is_read ? 'font-bold' : 'font-medium'}`}>
                                                {getMessageTypeLabel(msg.message_type)}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {formatDate(msg.event_date)}
                                            </div>
                                        </div>
                                        <svg
                                            className={`w-5 h-5 transition-transform ${expandedCard === msg.message_id ? 'rotate-180' : ''
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
                                                    p: ({ node, ...props }) => <p className="text-sm mb-2" {...props} />,
                                                }}
                                            >
                                                {msg.message_text}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Пагінація */}
                    <div className="flex justify-between items-center mt-6 max-w-md mx-auto">
                        <button
                            className="px-4 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={page === 0 || loading}
                            onClick={() => {
                                setPage(prev => Math.max(prev - 1, 0))
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                        >
                            Попередня
                        </button>

                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            Сторінка {page + 1}
                        </span>

                        <button
                            className="px-4 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={messages.length < PAGE_SIZE || loading}
                            onClick={() => {
                                setPage(prev => prev + 1)
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                        >
                            Наступна
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