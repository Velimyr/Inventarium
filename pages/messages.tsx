import { useEffect, useState } from 'react'
import Header from '../components/header'
import { useUser } from '../contexts/UserContext'
import { supabase } from '../lib/supabaseClient'
import Toast from '../components/Toast'
import ReactMarkdown from 'react-markdown'
import { Mail, CheckCheck, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

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
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
                </div>
            </>
        )
    }

    if (error) {
        return (
            <>
                <Header />
                <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                    <p className="text-red-600 dark:text-red-400 text-[16px]">{error}</p>
                </div>
            </>
        )
    }

    return (
        <>
            <Header />
            <div className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
                    {/* Header with buttons */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-[20px] lg:mb-[30px]">
                        <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                            Мої повідомлення
                        </h1>

                        <div className="flex flex-wrap items-center gap-[10px]">
                            <button
                                onClick={connectTelegram}
                                disabled={isTelegramLinked}
                                title={isTelegramLinked ? 'Telegram прив\'язаний' : 'Прив\'язати Telegram'}
                                className={`flex items-center gap-[8px] px-[15px] h-[40px] rounded transition-colors ${
                                    isTelegramLinked
                                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 cursor-not-allowed'
                                        : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                                }`}
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                                </svg>
                                <span className="text-[14px] lg:text-[16px] font-medium">
                                    {isTelegramLinked ? 'Прив\'язаний' : 'Прив\'язати'}
                                </span>
                            </button>

                            <button
                                onClick={markAllAsRead}
                                title="Прочитати все"
                                className="flex items-center justify-center w-[40px] h-[40px] rounded bg-gray-600 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                            >
                                <CheckCheck className="w-5 h-5 text-white" strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden lg:block overflow-x-auto mb-[20px]">
                        <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[180px_250px_1fr] border-b border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937]">
                                <div className="p-[10px] border-r border-gray-200 dark:border-[#374151]">
                                    <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold">Дата</span>
                                </div>
                                <div className="p-[10px] border-r border-gray-200 dark:border-[#374151]">
                                    <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold">Тип</span>
                                </div>
                                <div className="p-[10px]">
                                    <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold">Повідомлення</span>
                                </div>
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                                {messages.length === 0 ? (
                                    <div className="p-[20px] text-center">
                                        <p className="text-gray-500 dark:text-gray-400 text-[14px] lg:text-[16px]">
                                            Повідомлень поки немає
                                        </p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const { short, hasMore } = truncateToFirstLine(msg.message_text)
                                        const isExpanded = expandedRow === msg.message_id

                                        return (
                                            <div
                                                key={msg.message_id}
                                                onClick={() => handleRowClick(msg.message_id, msg.is_read)}
                                                className={`grid grid-cols-[180px_250px_1fr] cursor-pointer transition-colors ${
                                                    !msg.is_read
                                                        ? 'bg-blue-100 dark:bg-blue-900 font-semibold hover:bg-blue-200 dark:hover:bg-blue-800'
                                                        : 'hover:bg-gray-50 dark:hover:bg-[#1F2937] opacity-60'
                                                }`}
                                            >
                                                <div className="p-[10px] border-r border-gray-200 dark:border-[#374151] flex items-start">
                                                    <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
                                                        {formatDate(msg.event_date)}
                                                    </span>
                                                </div>
                                                <div className="p-[10px] border-r border-gray-200 dark:border-[#374151] flex items-start">
                                                    <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
                                                        {getMessageTypeLabel(msg.message_type)}
                                                    </span>
                                                </div>
                                                <div className="p-[10px]">
                                                    {isExpanded ? (
                                                        <div className="text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
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
                                                                {msg.message_text}
                                                            </ReactMarkdown>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
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
                                                                {short}
                                                            </ReactMarkdown>
                                                            {hasMore && (
                                                                <span className="text-gray-500 dark:text-gray-400 ml-1">[...]</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="block lg:hidden space-y-4 mb-[20px]">
                        {messages.length === 0 ? (
                            <div className="p-[20px] border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937] text-center">
                                <p className="text-gray-500 dark:text-gray-400 text-[14px]">
                                    Повідомлень поки немає
                                </p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.message_id}
                                    className={`border rounded-lg overflow-hidden transition-all ${
                                        !msg.is_read
                                            ? 'border-blue-400 dark:border-blue-600 bg-blue-100 dark:bg-blue-900 shadow-md'
                                            : 'border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] opacity-60'
                                    }`}
                                >
                                    <button
                                        onClick={() => handleCardClick(msg.message_id, msg.is_read)}
                                        className="w-full p-[15px] flex justify-between items-center text-left"
                                    >
                                        <div className="flex-1">
                                            <div className={`text-[14px] ${!msg.is_read ? 'font-bold' : 'font-medium'} text-gray-900 dark:text-white`}>
                                                {getMessageTypeLabel(msg.message_type)}
                                            </div>
                                            <div className="text-[12px] text-gray-600 dark:text-gray-400 mt-1">
                                                {formatDate(msg.event_date)}
                                            </div>
                                        </div>
                                        <ChevronDown
                                            className={`w-5 h-5 text-gray-900 dark:text-white transition-transform ${
                                                expandedCard === msg.message_id ? 'rotate-180' : ''
                                            }`}
                                            strokeWidth={2}
                                        />
                                    </button>
                                    {expandedCard === msg.message_id && (
                                        <div className="px-[15px] pb-[15px] border-t border-gray-300 dark:border-[#374151] pt-[15px]">
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
                                                    p: ({ node, ...props }) => <p className="text-[13px] mb-2 text-gray-900 dark:text-white" {...props} />,
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

                    {/* Pagination */}
                    <div className="flex items-center justify-between p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827]">
                        <button
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={page === 0 || loading}
                            onClick={() => {
                                setPage(prev => Math.max(prev - 1, 0))
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                            <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Назад</span>
                        </button>

                        <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                            Сторінка {page + 1}
                        </span>

                        <button
                            className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={messages.length < PAGE_SIZE || loading}
                            onClick={() => {
                                setPage(prev => prev + 1)
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                        >
                            <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Вперед</span>
                            <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
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
    )
}