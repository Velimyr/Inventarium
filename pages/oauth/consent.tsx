import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../../components/header';
import { useUser } from '../../contexts/UserContext';
import { supabase } from '../../lib/supabaseClient';
import { DAILY_TOOL_CALLS } from '../../lib/mcp/quota';

// Сторінка згоди OAuth для MCP-сервера (/api/mcp).
//
// Supabase Auth (Authentication → OAuth Server, Authorization path = /oauth/consent)
// приводить сюди користувача з ?authorization_id=…, коли AI-застосунок (Claude,
// ChatGPT…) просить доступ. Тут людина входить у свій акаунт і дозволяє або
// відхиляє доступ; Supabase видає застосунку токен і повертає користувача назад.
//
// Без authorization_id сторінка показує вже підключені застосунки — Supabase
// вимагає, щоб доступ можна було відкликати.

type Details = {
  authorization_id: string;
  redirect_url?: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

type Grant = {
  client: { id: string; name: string; uri: string; logo_uri: string };
  scopes: string[];
  granted_at: string;
};

const card = 'p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]';
const primaryButton =
  'px-[20px] py-[10px] rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[16px] font-medium transition-colors';
const secondaryButton =
  'px-[20px] py-[10px] rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#374151] disabled:opacity-60 text-gray-900 dark:text-[#F3F4F6] text-[16px] font-medium transition-colors';

function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[640px] mx-auto px-4 md:px-8 py-[20px] lg:py-[40px] flex flex-col gap-[20px]">{children}</div>
      </div>
    </>
  );
}

const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="text-gray-900 dark:text-white text-[16px]">{children}</p>
);

export default function OAuthConsentPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const authorizationId = typeof router.query.authorization_id === 'string' ? router.query.authorization_id : null;

  if (!router.isReady || userLoading) {
    return (
      <Page>
        <Message>Завантаження...</Message>
      </Page>
    );
  }

  if (!user) return <SignIn authorizationId={authorizationId} />;

  return authorizationId ? (
    <Consent authorizationId={authorizationId} />
  ) : (
    <Grants />
  );
}

function SignIn({ authorizationId }: { authorizationId: string | null }) {
  // Повертаємося саме сюди, з тим самим authorization_id. Адресу треба додати
  // в Supabase → Authentication → URL Configuration → Redirect URLs, інакше
  // Supabase поверне на головну і запит на доступ загубиться.
  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });

  return (
    <Page>
      <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] font-bold">
        {authorizationId ? 'Підключення AI-застосунку' : 'Підключені AI-застосунки'}
      </h1>
      <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
        {authorizationId
          ? 'Щоб дозволити AI-застосунку шукати в реєстрі Інвентаріум, увійдіть у свій акаунт.'
          : 'Увійдіть, щоб побачити застосунки, яким ви дали доступ до Інвентаріуму.'}
      </p>
      <button type="button" onClick={signIn} className={`self-start ${primaryButton}`}>
        Увійти через Google
      </button>
    </Page>
  );
}

function Consent({ authorizationId }: { authorizationId: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (detailsError || !data) {
        console.error('OAuth: не вдалося отримати запит на авторизацію', detailsError);
        setError('Запит на доступ недійсний або прострочений. Поверніться в застосунок і підключіться ще раз.');
        return;
      }
      // Згоду вже дано раніше — Supabase одразу віддає адресу повернення
      if (data.redirect_url) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data as Details);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setSubmitting(true);
    const { data, error: decisionError } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (decisionError || !data?.redirect_url) {
      console.error('OAuth: не вдалося зберегти рішення', decisionError);
      setError('Не вдалося зберегти ваше рішення. Поверніться в застосунок і підключіться ще раз.');
      setSubmitting(false);
      return;
    }
    window.location.assign(data.redirect_url);
  };

  const switchAccount = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (error) {
    return (
      <Page>
        <Message>{error}</Message>
      </Page>
    );
  }

  if (!details) {
    return (
      <Page>
        <Message>Завантаження...</Message>
      </Page>
    );
  }

  return (
    <Page>
      <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] font-bold">
        «{details.client.name}» просить доступ до Інвентаріуму
      </h1>

      <div className={`${card} flex flex-col gap-[14px]`}>
        {details.client.uri && (
          <p className="text-gray-700 dark:text-white text-[14px] opacity-80 break-all">
            Застосунок:{' '}
            <a href={details.client.uri} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              {details.client.uri}
            </a>
          </p>
        )}
        <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px]">
          Ви увійшли як <b>{details.user.email}</b>.{' '}
          <button type="button" onClick={switchAccount} className="text-blue-600 dark:text-blue-400 underline">
            Інший акаунт
          </button>
        </p>
        <div>
          <p className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-medium mb-[6px]">
            Якщо дозволите, застосунок зможе:
          </p>
          <ul className="list-disc pl-[20px] text-gray-700 dark:text-white text-[14px] lg:text-[16px] flex flex-col gap-[4px]">
            <li>шукати й читати записи реєстру від вашого імені;</li>
            <li>робити до {DAILY_TOOL_CALLS} запитів на добу.</li>
          </ul>
          <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80 mt-[10px]">
            Додавати чи змінювати дані через MCP Інвентаріуму застосунок не зможе. Відкликати доступ можна будь-коли на
            сторінці{' '}
            <a href="/oauth/consent" className="text-blue-600 dark:text-blue-400 underline">
              підключених застосунків
            </a>
            .
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-[12px]">
        <button type="button" disabled={submitting} onClick={() => decide(true)} className={primaryButton}>
          Дозволити
        </button>
        <button type="button" disabled={submitting} onClick={() => decide(false)} className={secondaryButton}>
          Відхилити
        </button>
      </div>
    </Page>
  );
}

function Grants() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: grantsError } = await supabase.auth.oauth.listGrants();
    if (grantsError) {
      console.error('OAuth: не вдалося отримати підключені застосунки', grantsError);
      setError('Не вдалося завантажити підключені застосунки. Спробуйте пізніше.');
      return;
    }
    setGrants((data || []) as Grant[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (clientId: string) => {
    setRevoking(clientId);
    const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId });
    if (revokeError) {
      console.error('OAuth: не вдалося відкликати доступ', revokeError);
      setError('Не вдалося відкликати доступ. Спробуйте пізніше.');
    }
    setRevoking(null);
    await load();
  };

  return (
    <Page>
      <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] font-bold">Підключені AI-застосунки</h1>
      <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
        Застосунки, яким ви дозволили шукати в реєстрі Інвентаріум від вашого імені. Після відкликання застосунок
        втратить доступ, і для нового підключення знадобиться ваша згода.
      </p>

      {error && <Message>{error}</Message>}
      {!error && grants === null && <Message>Завантаження...</Message>}
      {grants?.length === 0 && <Message>Жоден застосунок не підключено.</Message>}

      {grants?.map((grant) => (
        <div key={grant.client.id} className={`${card} flex flex-wrap items-center justify-between gap-[12px]`}>
          <div className="min-w-0">
            <p className="text-gray-900 dark:text-white text-[16px] font-medium">{grant.client.name}</p>
            <p className="text-gray-700 dark:text-white text-[14px] opacity-80">
              Доступ надано {new Date(grant.granted_at).toLocaleDateString('uk-UA')}
            </p>
          </div>
          <button
            type="button"
            disabled={revoking === grant.client.id}
            onClick={() => revoke(grant.client.id)}
            className={secondaryButton}
          >
            {revoking === grant.client.id ? 'Відкликаємо...' : 'Відкликати'}
          </button>
        </div>
      ))}
    </Page>
  );
}
