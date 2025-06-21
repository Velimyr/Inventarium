import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function Home() {
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadRecords();
  }, [query]);

  const loadRecords = async () => {
    let req = supabase.from('records').select('*').eq('approved', true);
    if (query) req = req.ilike('title', `%${query}%`);
    const { data } = await req;
    setRecords(data || []);
  };

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Підтверджені записи</h1>
      <input className="border p-2 mb-4 w-full" placeholder="Пошук за заголовком" value={query} onChange={e => setQuery(e.target.value)} />
      <ul>
        {records.map((r: any) => (
          <li key={r.id} className="mb-2">
            <strong>{r.title}</strong><br />
            <span>{r.description}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}