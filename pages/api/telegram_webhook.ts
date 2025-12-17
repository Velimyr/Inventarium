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

  const [, token] = text.split(' ')

  if (!token) {
    await sendTelegramMessage(chatId, '❌ Невірне посилання')
    return res.status(200).json({ ok: true })
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_link_token: null
    })
    .eq('telegram_link_token', token)
    .select('user_id')
    .single()

  if (error || !data) {
    await sendTelegramMessage(chatId, '❌ Посилання недійсне або застаріле')
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