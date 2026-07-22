import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ExternalLink, RefreshCw } from 'lucide-react';

// Поля справи, які мають бути однакові в усіх записів з тим самим шифром
export const CASE_FIELDS: { key: string; label: string }[] = [
  { key: 'archive', label: 'Архів' },
  { key: 'fonds', label: 'Фонд' },
  { key: 'series', label: 'Опис' },
  { key: 'record', label: 'Справа' },
  { key: 'case_date', label: 'Дати справи' },
  { key: 'pages_count', label: 'К-ть сторінок' },
  { key: 'scans_url', label: 'Посилання на скани' },
  { key: 'additional_case_signature', label: 'Дод. сигнатура' },
];

interface CaseGroup {
  signature_key: string;
  case_signature: string;
  records_count: number;
  record_ids: string[];
  diffs: Record<string, string[]>;
}

const shorten = (value: string, max = 60) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export default function CaseInconsistencies({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [groups, setGroups] = useState<CaseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFields, setActiveFields] = useState<Set<string>>(
    new Set(CASE_FIELDS.map((f) => f.key))
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('find_case_inconsistencies');

    if (error) {
      console.error('Помилка пошуку неповних даних справ:', error);
      onError('❌ Помилка пошуку: ' + error.message);
      setGroups([]);
    } else {
      setGroups((data as CaseGroup[]) || []);
    }

    setOpenKey(null);
    setLoading(false);
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  // Показуємо лише групи, що розходяться за обраними полями
  const visibleGroups = useMemo(
    () =>
      groups.filter((g) => Object.keys(g.diffs || {}).some((field) => activeFields.has(field))),
    [groups, activeFields]
  );

  const openGroup = async (group: CaseGroup) => {
    if (openKey === group.signature_key) {
      setOpenKey(null);
      setRecords([]);
      return;
    }

    setOpenKey(group.signature_key);
    setRecordsLoading(true);

    const { data, error } = await supabase
      .from('records')
      .select('*')
      .in('id', group.record_ids)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Помилка завантаження записів справи:', error);
      onError('❌ Помилка завантаження записів');
      setRecords([]);
    } else {
      setRecords(data || []);
    }

    setRecordsLoading(false);
  };

  const toggleField = (key: string) => {
    setActiveFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return <p className="text-gray-900 dark:text-white text-[16px]">Пошук розбіжностей...</p>;
  }

  return (
    <>
      <p className="text-gray-700 dark:text-gray-300 text-[14px] mb-[15px]">
        Записи з одним шифром описують ту саму архівну справу, тож ці поля мають у них
        збігатися. Розбіжність — це або помилка введення, або незаповнене поле. Сторінка
        початку інвентаря не перевіряється: вона законно різна для кожного населеного пункту.
      </p>

      {/* Які поля враховувати */}
      <div className="p-[12px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] mb-[20px]">
        <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium mb-[8px]">
          Враховувати розбіжності в полях
        </p>
        <div className="flex flex-wrap gap-x-[20px] gap-y-[6px]">
          {CASE_FIELDS.map((field) => {
            const affected = groups.filter((g) => g.diffs?.[field.key]).length;
            return (
              <label key={field.key} className="flex items-center gap-[7px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeFields.has(field.key)}
                  onChange={() => toggleField(field.key)}
                  className="w-[16px] h-[16px] accent-[#2563EB]"
                />
                <span className="text-gray-700 dark:text-gray-300 text-[14px]">
                  {field.label}{' '}
                  <span className="text-gray-500 dark:text-gray-500">({affected})</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[15px]">
        <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
          Справ із розбіжностями: {visibleGroups.length}
        </p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-[6px] h-[36px] px-[14px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[14px]"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={2} />
          Оновити
        </button>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
          <p className="text-gray-900 dark:text-white text-[16px]">
            За обраними полями розбіжностей не знайдено.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {visibleGroups.map((group) => {
            const diffFields = CASE_FIELDS.filter(
              (f) => group.diffs?.[f.key] && activeFields.has(f.key)
            );
            const isOpen = openKey === group.signature_key;

            return (
              <section
                key={group.signature_key}
                className="rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]"
              >
                <button
                  type="button"
                  onClick={() => openGroup(group)}
                  className="w-full text-left p-[15px]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                      {group.case_signature}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 text-[14px]">
                      записів: {group.records_count}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-[6px] mt-[8px]">
                    {diffFields.map((f) => (
                      <span
                        key={f.key}
                        className="px-[8px] py-[2px] rounded bg-amber-100 dark:bg-[#4A3413] text-amber-900 dark:text-amber-200 text-[12px]"
                      >
                        {f.label}: {group.diffs[f.key].length} варіант(и)
                      </span>
                    ))}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-[15px] pb-[15px]">
                    {/* Варіанти значень по кожному полю */}
                    <div className="flex flex-col gap-[8px] mb-[15px]">
                      {diffFields.map((f) => (
                        <div key={f.key} className="text-[13px]">
                          <span className="text-gray-900 dark:text-[#F3F4F6] font-medium">
                            {f.label}:{' '}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {group.diffs[f.key]
                              .map((v) => (v === '' ? '— (не заповнено)' : shorten(v)))
                              .join('  ·  ')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {recordsLoading ? (
                      <p className="text-gray-900 dark:text-white text-[14px]">
                        Завантаження записів...
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827]">
                        <table className="min-w-full text-[13px]">
                          <thead>
                            <tr className="border-b border-gray-300 dark:border-[#374151]">
                              <th className="text-left p-[8px] text-gray-900 dark:text-[#F3F4F6] font-medium">
                                Населений пункт
                              </th>
                              {diffFields.map((f) => (
                                <th
                                  key={f.key}
                                  className="text-left p-[8px] text-gray-900 dark:text-[#F3F4F6] font-medium whitespace-nowrap"
                                >
                                  {f.label}
                                </th>
                              ))}
                              <th className="p-[8px]" />
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((record) => (
                              <tr
                                key={record.id}
                                className="border-b border-gray-200 dark:border-[#374151] last:border-b-0"
                              >
                                <td className="p-[8px] text-gray-700 dark:text-gray-300">
                                  {record.current_settlement_type} {record.current_settlement_name}
                                </td>
                                {diffFields.map((f) => {
                                  const value = String(record[f.key] ?? '').trim();
                                  return (
                                    <td
                                      key={f.key}
                                      className="p-[8px] text-gray-700 dark:text-gray-300 break-all"
                                    >
                                      {value === '' ? (
                                        <span className="text-red-600 dark:text-red-400">
                                          не заповнено
                                        </span>
                                      ) : (
                                        shorten(value, 48)
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="p-[8px] whitespace-nowrap">
                                  <a
                                    href={`/edit/${record.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-[4px] text-[#2563EB] hover:underline"
                                  >
                                    Редагувати
                                    <ExternalLink className="w-3 h-3" strokeWidth={2} />
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
