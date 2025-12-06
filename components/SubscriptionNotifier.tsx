import { useEffect } from 'react';
import emailjs from 'emailjs-com';
import { supabase } from '../lib/supabaseClient';

interface SubscriptionNotifierProps {
  settlement: string;
  settlementCode: string;
  link: string;
  userId: string;
}

export default function SubscriptionNotifier({ settlement, settlementCode, link, userId }: SubscriptionNotifierProps) {
//console.log('🔔 Запускаємо перевірку підписників для:', settlement);
  useEffect(() => {
    async function notifySubscribers() {
      if (!settlement || !userId) return;
      console.log('📨 SubscriptionNotifier запущено:', { settlement, settlementCode, link, userId });

      try {
        // 1. Знайти підписки на цей населений пункт
        const { data: subscriptions, error: subsError } = await supabase
          .from('settlement_subscription')
          .select('user_id, email')
          .eq('settlement_code', settlementCode);

        console.log('🔎 Знайдено підписки:', subscriptions);

        if (subsError) {
          console.error('Помилка отримання підписок:', subsError);
          return;
        }
        if (!subscriptions || subscriptions.length === 0) {
          // Підписок немає — нічого не надсилати
          return;
        }

        for (const sub of subscriptions) {
          const email = sub.email;
          if (!email) continue;

          try {
            console.log('📧 Надсилаємо email:', email);

            const res = await emailjs.send(
              'service_1grk7wf',
              'template_0uhaxka',
              {
                email: email,
                settlement: settlement,
                link: link,
                user_id: userId,
              },
              '0vIrWtLaUXsgLH570'
            );

            console.log('✅ Лист надіслано до:', email, res);
          } catch (err) {
            console.error(`❌ Помилка при надсиланні на ${email}:`, err);
          }
        }

      } catch (err) {
        console.error('Помилка під час надсилання листа:', err);
      }
    }

    notifySubscribers();
  }, [settlement, settlementCode, link, userId]);

  return null;
}