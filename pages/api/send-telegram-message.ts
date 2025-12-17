import type { NextApiRequest, NextApiResponse } from 'next'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { chatId, message } = req.body

  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message are required' })
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Telegram API error:', data)
      return res.status(500).json({ error: 'Failed to send message', details: data })
    }

    return res.status(200).json({ success: true, data })
  } catch (error) {
    console.error('Error sending telegram message:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}