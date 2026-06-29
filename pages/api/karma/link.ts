import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  getUserTotal,
  karmaLinkRedeem,
  toKarmaLogin,
} from '../../../lib/karma';

// Проксі для прив'язки акаунта до «Карми».
// Браузер не може мати KARMA_TOKEN, тому код приходить сюди разом із
// access-токеном Supabase — сервер впізнає користувача, рахує бали і викликає «Карму».

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface LinkResponse {
  ok: boolean;
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LinkResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не підтримується' });
  }

  // Авторизація користувача через його Supabase access-токен.
  const authHeader = req.headers.authorization ?? '';
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!accessToken) {
    return res.status(401).json({ ok: false, message: 'Ви не авторизовані' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user?.email) {
    return res.status(401).json({ ok: false, message: 'Ви не авторизовані' });
  }

  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code) {
    return res.status(400).json({ ok: false, message: 'Введіть код привʼязки' });
  }

  const login = toKarmaLogin(user.email);

  try {
    const total = await getUserTotal(supabase, user.id);
    const result = await karmaLinkRedeem({ code, login, total });

    if (result.status === 200 && result.ok) {
      let message = 'Акаунт привʼязано до Генеалогічного навігатора';
      if (result.awarded > 0) {
        message += `. Нараховано ${result.awarded} балів карми.`;
      }
      return res.status(200).json({ ok: true, message });
    }

    if (result.status === 404 || result.error === 'invalid_or_expired') {
      return res.status(200).json({
        ok: false,
        message:
          'Код недійсний або прострочений (15 хв). Отримайте новий у Навігаторі.',
      });
    }

    if (result.status === 409 || result.error === 'already_linked') {
      return res.status(200).json({
        ok: false,
        message: 'Цей акаунт уже привʼязаний іншим користувачем.',
      });
    }

    return res
      .status(200)
      .json({ ok: false, message: 'Сталася помилка, спробуйте пізніше.' });
  } catch (err) {
    console.error('Karma link error:', err);
    return res
      .status(200)
      .json({ ok: false, message: 'Сталася помилка, спробуйте пізніше.' });
  }
}
