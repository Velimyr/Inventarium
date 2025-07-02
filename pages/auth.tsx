import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useUser } from '../contexts/UserContext';

export default function AuthPage() {
  const { user, loading } = useUser();

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    location.reload();
  };

  return (
    <>
      <Header />
      <main className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">🔐 Вхід до системи</h1>

          {loading ? (
            <div className="italic text-gray-500 dark:text-gray-400">Завантаження…</div>
          ) : user ? (
            <div className="border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 rounded p-6">
              <p className="mb-4">
                Ви увійшли як: <span className="font-medium">{user.email}</span>
              </p>
              <button
                onClick={signOut}
                className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition"
              >
                Вийти
              </button>
            </div>
          ) : (
            <div className="border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 rounded p-6">
              <p className="mb-4">
                Увійдіть через обліковий запис Google для доступу до адміністративної частини сайту.
              </p>
              <button
                onClick={signInWithGoogle}
                className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition"
              >
                Увійти через Google
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}