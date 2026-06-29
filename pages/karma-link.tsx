import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';

export default function KarmaLinkPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Якщо в URL є ?code=XXXX — підставляємо його у поле автоматично.
  useEffect(() => {
    if (!router.isReady) return;
    const queryCode = router.query.code;
    if (typeof queryCode === 'string' && queryCode.trim()) {
      setCode(queryCode.trim());
    }
  }, [router.isReady, router.query.code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || submitting) return;

    const trimmed = code.trim();
    if (!trimmed) {
      setToast({ message: 'Введіть код привʼязки', type: 'error' });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setResult({ ok: false, message: 'Сталася помилка, спробуйте пізніше.' });
        return;
      }

      const res = await fetch('/api/karma/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await res.json();
      setResult({ ok: Boolean(data?.ok), message: data?.message ?? 'Сталася помилка, спробуйте пізніше.' });
      setToast({
        message: data?.ok ? '✅ Готово' : '❌ Не вдалося',
        type: data?.ok ? 'success' : 'error',
      });
    } catch (err) {
      console.error('Karma link request failed:', err);
      setResult({ ok: false, message: 'Сталася помилка, спробуйте пізніше.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (userLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">⛔ Ви не авторизовані</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[640px] mx-auto px-4 md:px-8 py-[20px] lg:py-[40px]">
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
            Привʼязка до Генеалогічного навігатора
          </h1>
          <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mb-[24px]">
            Введіть код із Генеалогічного навігатора, щоб привʼязати свій акаунт і
            отримувати бали карми за внесок у реєстр.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[12px]">
            <label
              htmlFor="karma-code"
              className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium"
            >
              Код з Генеалогічного навігатора
            </label>
            <input
              id="karma-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Напр., A1B2C3"
              autoComplete="off"
              className="w-full px-[14px] py-[10px] rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[16px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="self-start px-[20px] py-[10px] rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[16px] font-medium transition-colors"
            >
              {submitting ? 'Привʼязуємо...' : 'Привʼязати'}
            </button>
          </form>

          {result && (
            <div
              className={`mt-[20px] p-[14px] rounded-lg text-[14px] lg:text-[16px] ${
                result.ok
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700'
              }`}
            >
              {result.message}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
