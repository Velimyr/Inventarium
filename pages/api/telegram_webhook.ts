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
    console.log("start process");
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

  const [, userId] = text.split(' ')

  if (!userId) {
    await sendTelegramMessage(chatId, '❌ Невірне посилання')
    return res.status(200).json({ ok: true })
  }

  // 🔑 ВИКЛИК RPC
  const { error } = await supabase.rpc('link_telegram', {
    p_user_id: userId,
    p_chat_id: chatId,
  })

  if (error) {
    await sendTelegramMessage(
      chatId,
      '❌ Помилка підключення Telegram'
    )
    return res.status(200).json({ ok: true })
  }

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