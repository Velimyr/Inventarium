import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const signOut = () => {
    supabase.auth.signOut();
    location.reload();
  };

  const sendMagicLink = async () => {
    await supabase.auth.signInWithOtp({ email });
    setSent(true);
  };

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Увійти</h1>
      <input className="border p-2 mb-2 w-full" placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <button onClick={sendMagicLink} className="bg-blue-600 text-white px-4 py-2 rounded">Надіслати лінк</button>
      <button onClick={signOut} className="ml-4 text-red-600 underline">Вийти</button>
      {sent && <p className="mt-2">Перевірте пошту</p>}
    </main>
  );
}