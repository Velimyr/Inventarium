import { supabase } from '../lib/supabaseClient'
import { getMessageTypeLabel, MessageType } from '../lib/messageUtils'

interface SendNotificationParams {
    fromUserId: string
    toUserId: string
    messageType: MessageType
    messageText: string
}

/**
 * Відправляє повідомлення користувачу в систему і в Telegram (якщо підключено)
 */
export async function sendNotification({
    fromUserId,
    toUserId,
    messageType,
    messageText
}: SendNotificationParams): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Зберігаємо повідомлення в таблицю messages
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                message_type: messageType,
                message_text: messageText,
                event_date: new Date().toISOString(),
                is_read: false
            })
            .select('message_id')
            .single()

        if (messageError) {
            console.error('Помилка збереження повідомлення:', messageError)
            return { success: false, error: messageError.message }
        }

        // 2. Перевіряємо, чи підключений Telegram
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('telegram_chat_id')
            .eq('user_id', toUserId)
            .single()

        // Якщо Telegram підключено - відправляємо повідомлення
        if (!profileError && profile?.telegram_chat_id) {
            try {
                const response = await fetch('/api/send-telegram-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId: profile.telegram_chat_id,
                        message: `🔔 ${getMessageTypeLabel(messageType)}\n\n${messageText}`
                    })
                })

                if (!response.ok) {
                    console.error('Помилка відправки в Telegram')
                }
            } catch (telegramError) {
                console.error('Помилка відправки в Telegram:', telegramError)
                // Не повертаємо помилку, бо повідомлення в БД вже збережено
            }
        }

        return { success: true }
    } catch (error) {
        console.error('Неочікувана помилка:', error)
        return { success: false, error: 'Неочікувана помилка' }
    }
}