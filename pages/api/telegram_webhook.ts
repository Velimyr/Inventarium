import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("start process")
  
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const update = req.body
  if (!update.message) {
    return res.status(200).json({ ok: true })
  }

  const chatId: number = update.message.chat.id
  const text: string = update.message.text ?? ''

  if (!text.startsWith('/start')) {
    return res.status(200).json({ ok: true })
  }

  const [, token] = text.split(' ')

  if (!token) {
    await sendTelegramMessage(chatId, '❌ Невірне посилання')
    return res.status(200).json({ ok: true })
  }

  console.log('Шукаємо токен:', token)

  // Спочатку знаходимо user_id за токеном
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('telegram_link_token', token)
    .single()

  console.log('Знайдений профіль:', { profile, fetchError })

  if (fetchError || !profile) {
    console.error('Помилка пошуку профілю:', fetchError)
    await sendTelegramMessage(chatId, '❌ Посилання недійсне або застаріле')
    return res.status(200).json({ ok: true })
  }

  // Викликаємо функцію для оновлення
  const { error: rpcError } = await supabase.rpc('link_telegram', {
    p_user_id: profile.user_id,
    p_chat_id: chatId
  })

  console.log('Результат RPC:', { rpcError })

  if (rpcError) {
    console.error('Помилка при виклику link_telegram:', rpcError)
    await sendTelegramMessage(chatId, '❌ Помилка при підключенні')
    return res.status(200).json({ ok: true })
  }

  // Очищуємо токен після успішного підключення
  await supabase
    .from('profiles')
    .update({ telegram_link_token: null })
    .eq('user_id', profile.user_id)

  await sendTelegramMessage(
    chatId,
    '✅ Telegram успішно підключено'
  )

  return res.status(200).json({ ok: true })
}

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}