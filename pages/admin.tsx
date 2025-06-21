import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Admin() {
  const [records, setRecords] = useState([]);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        router.push('/');
      } else {
        setUser(data.user);
        loadRecords();
      }
    });
  }, []);

  const loadRecords = async () => {
    const { data } = await supabase
      .from('records')
      .select('*')
      .eq('approved', false);
    setRecords(data || []);
  };

  const approve = async (id: string) => {
    await supabase.from('records').update({ approved: true }).eq('id', id);
    loadRecords();
  };

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Записи на підтвердження</h1>
      {records.map((r: any) => (
        <div key={r.id} className="border p-2 mb-2">
          <strong>{r.title}</strong><br />
          {r.description}<br />
          <button onClick={() => approve(r.id)} className="bg-green-600 text-white px-3 py-1 mt-2 rounded">✅ Підтвердити</button>
        </div>
      ))}
    </main>
  );
}