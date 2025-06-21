import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Submit() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const submitRecord = async () => {
    if (!user) {
      alert('Потрібно увійти');
      return;
    }

    await supabase.from('records').insert({
      title,
      description,
      created_by: user.id,
    });

    setSubmitted(true);
  };

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Додати запис</h1>
      {!user ? (
        <a href="/auth" className="text-blue-600 underline">Увійти</a>
      ) : submitted ? (
        <p>Очікує підтвердження адміністратором</p>
      ) : (
        <>
          <input className="border p-2 mb-2 w-full" placeholder="Заголовок" onChange={e => setTitle(e.target.value)} />
          <textarea className="border p-2 mb-2 w-full" placeholder="Опис" onChange={e => setDescription(e.target.value)} />
          <button onClick={submitRecord} className="bg-blue-600 text-white px-4 py-2 rounded">Надіслати</button>
        </>
      )}
    </main>
  );
}