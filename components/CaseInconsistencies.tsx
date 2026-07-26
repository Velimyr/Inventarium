import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ExternalLink, RefreshCw, ClipboardCopy, Play, Check, ArrowRightLeft, RotateCcw } from 'lucide-react';
import { formatSignatureList, toSignatureList } from '../lib/caseSignature';

// Поля справи, які мають бути однакові в усіх записів з тим самим шифром
export const CASE_FIELDS: { key: string; label: string }[] = [
  { key: 'archive', label: 'Архів' },
  { key: 'fonds', label: 'Фонд' },
  { key: 'series', label: 'Опис' },
  { key: 'record', label: 'Справа' },
  { key: 'case_title', label: 'Назва справи' },
  { key: 'case_date', label: 'Дати справи' },
  { key: 'pages_count', label: 'К-ть сторінок' },
  { key: 'scans_url', label: 'Посилання на скани' },
  { key: 'additional_case_signature', label: 'Дод. сигнатури' },
];

// Дод. сигнатури — text[]. Уся сторінка працює з рядками (варіанти, вибір,
// скрипт), тому масив показуємо і повертаємо назад через '; ' — саме за цим
// роздільником toSignatureList розбирає рядок назад у масив.
const ADDITIONAL_FIELD = 'additional_case_signature';
const LIST_SEPARATOR = '; ';

/** Значення поля запису як рядок — для порівняння, показу і вибору. */
const fieldText = (field: string, value: any) =>
  field === ADDITIONAL_FIELD
    ? formatSignatureList(value, LIST_SEPARATOR)
    : String(value ?? '').trim();

// Скільки записів має кожне значення поля, від найпоширенішого до рідкісного
const countVariants = (records: any[], field: string): [string, number][] => {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = fieldText(field, record[field]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

// Екранування рядка для SQL-літерала: одинарна лапка подвоюється
const sqlLiteral = (value: string) => (value === '' ? 'null' : `'${value.replace(/'/g, "''")}'`);

// Літерал для колонки: масив пишемо як array[...], решту — як рядок
const sqlValue = (field: string, value: string) => {
  if (field !== ADDITIONAL_FIELD) return sqlLiteral(value);
  const list = toSignatureList(value);
  return list.length === 0 ? 'null' : `array[${list.map(sqlLiteral).join(', ')}]`;
};

// Зчитує SQL-літерал у лапках, враховуючи подвоєні лапки всередині
const readQuoted = (s: string, from: number): { value: string; end: number } | null => {
  if (s[from] !== "'") return null;
  let out = '';
  let i = from + 1;
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    out += s[i];
    i += 1;
  }
  return null;
};

// Розбирає літерал array['a', 'b', ...] у масив рядків. null — якщо це не
// коректний масив (перевіряй префіксом array[ перед викликом).
const readArrayLiteral = (raw: string): string[] | null => {
  const m = raw.match(/^array\s*\[([\s\S]*)\]$/i);
  if (!m) return null;
  const inner = m[1].trim();
  if (inner === '') return [];
  const items: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i])) i += 1;
    const quoted = readQuoted(inner, i);
    if (!quoted) return null;
    items.push(quoted.value);
    i = quoted.end;
    while (i < inner.length && /\s/.test(inner[i])) i += 1;
    if (i < inner.length) {
      if (inner[i] !== ',') return null;
      i += 1;
    }
  }
  return items;
};

type ParsedScript =
  | { update: Record<string, any>; signature: string; approvedOnly: boolean }
  | { error: string };

// Розбирає відредагований скрипт назад у присвоєння для supabase.update().
// Навмисно строгий: виконуємо лише те, що впевнено розпізнали, і лише
// дозволені поля — довільний SQL з клієнта не виконується.
const parseUpdateScript = (sql: string): ParsedScript => {
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim()
    .replace(/;\s*$/, '');

  const shape = body.match(/^update\s+(?:public\.)?records\s+set\s+([\s\S]+?)\s+where\s+([\s\S]+)$/i);
  if (!shape) {
    return { error: 'Очікується: update public.records set ... where case_signature = \'...\'' };
  }

  const [, setPart, wherePart] = shape;

  // Ділимо присвоєння комами верхнього рівня — коми всередині лапок не рахуються
  const chunks: string[] = [];
  let buf = '';
  for (let i = 0; i < setPart.length; i += 1) {
    if (setPart[i] === "'") {
      const quoted = readQuoted(setPart, i);
      if (!quoted) return { error: 'Незакрита одинарна лапка у значенні' };
      buf += setPart.slice(i, quoted.end);
      i = quoted.end - 1;
      continue;
    }
    if (setPart[i] === ',') {
      chunks.push(buf);
      buf = '';
      continue;
    }
    buf += setPart[i];
  }
  if (buf.trim()) chunks.push(buf);

  const allowed = new Set(CASE_FIELDS.map((f) => f.key));
  const update: Record<string, any> = {};

  for (const chunk of chunks) {
    const pair = chunk.trim().match(/^([a-zA-Z_]+)\s*=\s*([\s\S]+)$/);
    if (!pair) return { error: `Не вдалося розібрати: ${chunk.trim().slice(0, 60)}` };

    const key = pair[1].toLowerCase();
    const raw = pair[2].trim();

    if (!allowed.has(key)) return { error: `Поле «${key}» тут змінювати не можна` };

    if (/^null$/i.test(raw)) {
      update[key] = null;
      continue;
    }

    // Масив (text[]) — напр. additional_case_signature = array['a', 'b']
    if (/^array\s*\[/i.test(raw)) {
      const list = readArrayLiteral(raw);
      if (!list) return { error: `Не вдалося розібрати масив для «${key}»` };
      update[key] = list.length > 0 ? list : null;
      continue;
    }

    const quoted = readQuoted(raw, 0);
    if (!quoted || quoted.end !== raw.length) {
      return { error: `Значення для «${key}» має бути в лапках, array[...] або null` };
    }
    // Поле-масив, введене одним рядком у лапках, загортаємо в масив
    update[key] = key === ADDITIONAL_FIELD ? [quoted.value] : quoted.value;
  }

  if (Object.keys(update).length === 0) return { error: 'Немає жодного присвоєння' };

  const sigAt = wherePart.search(/case_signature\s*=\s*'/i);
  if (sigAt === -1) return { error: "WHERE має містити case_signature = '...'" };
  const quoteAt = wherePart.indexOf("'", sigAt);
  const sig = readQuoted(wherePart, quoteAt);
  if (!sig) return { error: 'Незакрита лапка в шифрі справи' };

  return {
    update,
    signature: sig.value,
    approvedOnly: /approved\s*=\s*true/i.test(wherePart),
  };
};

interface CaseGroup {
  signature_key: string;
  case_signature: string;
  records_count: number;
  record_ids: string[];
  diffs: Record<string, string[]>;
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);

// Значення поля: порожнє показуємо явно, посилання — повністю і клікабельно
function FieldValue({ value }: { value: string }) {
  if (value === '') {
    return (
      <span className="text-red-600 dark:text-red-400 font-medium">не заповнено</span>
    );
  }

  if (isUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-[#2563EB] hover:underline break-all"
      >
        {value}
      </a>
    );
  }

  return <span className="break-words">{value}</span>;
}

export default function CaseInconsistencies({
  onToast,
}: {
  onToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [groups, setGroups] = useState<CaseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFields, setActiveFields] = useState<Set<string>>(
    new Set(CASE_FIELDS.map((f) => f.key))
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  // Яке значення лишаємо по кожному полю, що розходиться
  const [keepValues, setKeepValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [transferValue, setTransferValue] = useState('');
  // Текст скрипта, який реально виконується: можна правити вручну
  const [scriptDraft, setScriptDraft] = useState('');
  const [scriptDirty, setScriptDirty] = useState(false);
  const [executing, setExecuting] = useState(false);
  // Шифри справ, які вже опрацьовано в цій сесії: показуємо сірими
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('find_case_inconsistencies');

    if (error) {
      console.error('Помилка пошуку неповних даних справ:', error);
      onToast('❌ Помилка пошуку: ' + error.message, 'error');
      setGroups([]);
    } else {
      setGroups((data as CaseGroup[]) || []);
    }

    setOpenKey(null);
    setResolved(new Set());
    setLoading(false);
  }, [onToast]);

  // Завантажуємо лише раз на монтуванні. Далі дані оновлюються кнопкою «Оновити»
  // або після виконання — але НЕ через зміну ідентичності load, інакше будь-який
  // тост скидав би відкритий блок і вибрані значення.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Показуємо лише групи, що розходяться за обраними полями
  const visibleGroups = useMemo(
    () =>
      groups.filter((g) => Object.keys(g.diffs || {}).some((field) => activeFields.has(field))),
    [groups, activeFields]
  );

  const resolvedCount = visibleGroups.filter((g) => resolved.has(g.signature_key)).length;
  const openCount = visibleGroups.length - resolvedCount;

  const openGroup = async (group: CaseGroup) => {
    if (openKey === group.signature_key) {
      setOpenKey(null);
      setRecords([]);
      setKeepValues({});
      return;
    }

    setOpenKey(group.signature_key);
    setRecordsLoading(true);
    setKeepValues({});
    setCopied(false);

    const { data, error } = await supabase
      .from('records')
      .select('*')
      .in('id', group.record_ids)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Помилка завантаження записів справи:', error);
      onToast('❌ Помилка завантаження записів', 'error');
      setRecords([]);
    } else {
      const rows = data || [];
      setRecords(rows);

      // за замовчуванням лишаємо найпоширеніше значення по кожному полю
      const defaults: Record<string, string> = {};
      for (const field of Object.keys(group.diffs || {})) {
        const top = countVariants(rows, field)[0];
        if (top) defaults[field] = top[0];
      }
      setKeepValues(defaults);
    }

    setRecordsLoading(false);
  };

  // Скрипт оновлення для відкритої справи. Не виконується — лише показується.
  const updateScript = useMemo(() => {
    const group = groups.find((g) => g.signature_key === openKey);
    if (!group) return '';

    // Поле потрапляє у скрипт, якщо для нього обрано значення. Зазвичай це поля,
    // що розходяться, але перенесення в дод. сигнатуру додає сюди й archive/fonds/
    // series/record → '' і additional_case_signature, навіть якщо вони не в diffs.
    const assignments = CASE_FIELDS.filter(
      (f) => activeFields.has(f.key) && keepValues[f.key] !== undefined
    ).map((f) => `  ${f.key} = ${sqlValue(f.key, keepValues[f.key])}`);

    if (assignments.length === 0) return '';

    return [
      `-- ${group.case_signature} — ${group.records_count} записів`,
      `-- Перевірте вибрані значення перед виконанням.`,
      `update public.records set`,
      assignments.join(',\n'),
      `where case_signature = ${sqlLiteral(group.case_signature)}`,
      `  and approved = true;`,
    ].join('\n');
  }, [groups, openKey, activeFields, keepValues]);

  // Окремі шифри, «зашиті» в поля архів/фонд/опис/справа (усі чотири заповнені).
  // Саме їх переносимо в дод. сигнатуру.
  const composedSignatures = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const a = String(r.archive ?? '').trim();
      const f = String(r.fonds ?? '').trim();
      const s = String(r.series ?? '').trim();
      const rec = String(r.record ?? '').trim();
      if (a && f && s && rec) set.add(`${a} ${f}-${s}-${rec}`);
    }
    return [...set];
  }, [records]);

  // За замовчуванням пропонуємо перший знайдений шифр (адмін може виправити)
  useEffect(() => {
    setTransferValue(composedSignatures[0] ?? '');
  }, [composedSignatures]);

  // Згенерований скрипт перезаписує чернетку — ручні правки скидаються,
  // щойно змінено вибір значень
  useEffect(() => {
    setScriptDraft(updateScript);
    setScriptDirty(false);
  }, [updateScript]);

  const parsedScript = useMemo(
    () => (scriptDraft.trim() ? parseUpdateScript(scriptDraft) : null),
    [scriptDraft]
  );
  const scriptError = parsedScript && 'error' in parsedScript ? parsedScript.error : null;

  // Додає перенесення в основний скрипт: дод. сигнатура = шифр,
  // а поля архів/фонд/опис/справа очищаються
  const transferToScript = () => {
    const signature = transferValue.trim();
    if (!signature) return;
    setKeepValues((prev) => {
      // Дод. сигнатур може бути кілька, тож шифр додаємо до вже обраних, а не
      // затираємо їх. Якщо поле ще не чіпали — беремо найпоширеніше значення.
      const current = toSignatureList(
        prev[ADDITIONAL_FIELD] ?? countVariants(records, ADDITIONAL_FIELD)[0]?.[0] ?? ''
      );
      const next = current.includes(signature) ? current : [...current, signature];
      return {
        ...prev,
        [ADDITIONAL_FIELD]: next.join(LIST_SEPARATOR),
        archive: '',
        fonds: '',
        series: '',
        record: '',
      };
    });
    onToast('✅ Додано в скрипт оновлення', 'success');
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Не вдалося скопіювати:', err);
      onToast('❌ Не вдалося скопіювати — виділіть текст вручну', 'error');
    }
  };

  // Застосовує оновлення до всіх записів справи, ховає блок і переходить далі
  const applyUpdate = async (
    group: CaseGroup,
    update: Record<string, any>,
    signature: string,
    approvedOnly: boolean
  ) => {
    setExecuting(true);
    let query = supabase.from('records').update(update).eq('case_signature', signature);
    if (approvedOnly) query = query.eq('approved', true);
    const { error } = await query;
    setExecuting(false);

    if (error) {
      console.error('Помилка оновлення справи:', error);
      onToast('❌ Помилка оновлення: ' + error.message, 'error');
      return;
    }

    onToast(`✅ Оновлено записів: ${group.records_count}`, 'success');

    const nextResolved = new Set(resolved).add(group.signature_key);
    setResolved(nextResolved);

    // Наступний неопрацьований блок у видимому списку
    const idx = visibleGroups.findIndex((g) => g.signature_key === group.signature_key);
    const next = visibleGroups
      .slice(idx + 1)
      .find((g) => !nextResolved.has(g.signature_key));

    if (next) {
      openGroup(next);
    } else {
      setOpenKey(null);
      setRecords([]);
      setKeepValues({});
    }
  };

  const executeUpdate = async () => {
    const group = groups.find((g) => g.signature_key === openKey);
    if (!group) return;

    if (!parsedScript) return;
    if ('error' in parsedScript) {
      onToast('❌ Скрипт не розібрано: ' + parsedScript.error, 'error');
      return;
    }

    const { update, signature, approvedOnly } = parsedScript;
    const fieldList = Object.keys(update)
      .map((k) => CASE_FIELDS.find((f) => f.key === k)?.label ?? k)
      .join(', ');

    const confirmed = window.confirm(
      `Оновити записи справи ${signature}?\n\n` +
        `Поля: ${fieldList}\n` +
        (approvedOnly ? '' : '\nУВАГА: без умови approved = true — зачепить і прибрані записи.\n') +
        (scriptDirty ? '\nСкрипт відредаговано вручну.\n' : '') +
        '\nЗміни застосуються до всіх записів з цим шифром і незворотні.'
    );
    if (!confirmed) return;

    await applyUpdate(group, update, signature, approvedOnly);
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
          <span className="text-gray-600 dark:text-gray-400 font-normal">
            {' '}
            · відкритих: {openCount}
            {resolvedCount > 0 ? ` · опрацьовано: ${resolvedCount}` : ''}
          </span>
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
            const isResolved = resolved.has(group.signature_key);

            return (
              <section
                key={group.signature_key}
                className={`rounded-lg border ${
                  isResolved
                    ? 'border-gray-200 dark:border-[#2A2F3A] bg-gray-100 dark:bg-[#161B24] opacity-60'
                    : 'border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]'
                }`}
              >
                <div className="flex items-start gap-[10px] p-[15px]">
                  <button
                    type="button"
                    onClick={() => openGroup(group)}
                    className="flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-baseline gap-[10px]">
                      <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                        {group.case_signature}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 text-[14px]">
                        записів: {group.records_count}
                      </span>
                      {isResolved && (
                        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded bg-[#14AE5C] text-white text-[12px]">
                          <Check className="w-3 h-3" strokeWidth={2} />
                          опрацьовано
                        </span>
                      )}
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
                  <a
                    href={`/case?case_signature=${encodeURIComponent(group.case_signature)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-[6px] text-[#2563EB] hover:underline text-[14px] whitespace-nowrap"
                  >
                    Сторінка справи
                    <ExternalLink className="w-4 h-4" strokeWidth={2} />
                  </a>
                </div>

                {isOpen && (
                  <div className="px-[15px] pb-[15px]">
                    {/* Варіанти значень по кожному полю: найпоширеніше зверху,
                        решта підсвічена як відхилення */}
                    <div className="flex flex-col gap-[12px] mb-[18px]">
                      {diffFields.map((f) => {
                        const variants = countVariants(records, f.key);
                        return (
                          <div
                            key={f.key}
                            className="rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] p-[10px]"
                          >
                            <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-semibold mb-[6px]">
                              {f.label} — {variants.length} різних значень.{' '}
                              <span className="font-normal text-gray-600 dark:text-gray-400">
                                Оберіть, що лишити
                              </span>
                            </p>
                            <div className="flex flex-col gap-[4px]">
                              {variants.map(([value, count], i) => (
                                <label
                                  key={value}
                                  className={`flex items-start gap-[8px] text-[13px] px-[8px] py-[4px] rounded cursor-pointer ${
                                    keepValues[f.key] === value
                                      ? 'bg-green-100 dark:bg-[#14301F] ring-1 ring-[#14AE5C]'
                                      : i === 0
                                        ? 'bg-gray-100 dark:bg-[#1F2937]'
                                        : 'bg-amber-100 dark:bg-[#4A3413]'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`keep-${group.signature_key}-${f.key}`}
                                    checked={keepValues[f.key] === value}
                                    onChange={() =>
                                      setKeepValues((prev) => ({ ...prev, [f.key]: value }))
                                    }
                                    className="mt-[3px] w-[14px] h-[14px] accent-[#14AE5C]"
                                  />
                                  <span
                                    className={`whitespace-nowrap font-medium ${
                                      i === 0
                                        ? 'text-gray-600 dark:text-gray-400'
                                        : 'text-amber-900 dark:text-amber-200'
                                    }`}
                                  >
                                    {count} зап.
                                    {i === 0 ? ' · більшість' : ''}
                                  </span>
                                  <span className="text-gray-900 dark:text-[#F3F4F6] min-w-0">
                                    <FieldValue value={value} />
                                  </span>
                                </label>
                              ))}
                              <label className="flex items-center gap-[8px] text-[13px] px-[8px] py-[4px] cursor-pointer">
                                <input
                                  type="radio"
                                  name={`keep-${group.signature_key}-${f.key}`}
                                  checked={keepValues[f.key] === undefined}
                                  onChange={() =>
                                    setKeepValues((prev) => {
                                      const next = { ...prev };
                                      delete next[f.key];
                                      return next;
                                    })
                                  }
                                  className="w-[14px] h-[14px] accent-gray-500"
                                />
                                <span className="text-gray-600 dark:text-gray-400">
                                  не чіпати це поле
                                </span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
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
                                  const value = fieldText(f.key, record[f.key]);
                                  const majority = countVariants(records, f.key)[0]?.[0];
                                  const deviates = value !== majority;
                                  return (
                                    <td
                                      key={f.key}
                                      className={`p-[8px] align-top max-w-[420px] ${
                                        deviates
                                          ? 'bg-amber-100 dark:bg-[#4A3413] text-amber-900 dark:text-amber-200 font-medium'
                                          : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <FieldValue value={value} />
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

                    {/* Перенесення окремого шифру в дод. сигнатуру.
                        Лише коли архів/фонд/опис/справа справді розходяться (заповнені
                        в частині записів) — інакше це коректні координати всієї справи,
                        які чіпати не треба. */}
                    {composedSignatures.length > 0 &&
                      ['archive', 'fonds', 'series', 'record'].some((k) => group.diffs?.[k]) && (
                      <div className="mt-[18px] p-[12px] rounded-lg border border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]">
                        <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-semibold mb-[4px]">
                          Перенести шифр у «Дод. сигнатура»
                        </p>
                        <p className="text-gray-700 dark:text-gray-300 text-[13px] mb-[10px]">
                          У полях архів/фонд/опис/справа заповнено окремий шифр. «Додати в
                          скрипт» впише його в дод. сигнатуру, а самі поля очистить — усе це
                          потрапить у скрипт оновлення нижче, який виконується однією кнопкою.
                        </p>

                        {composedSignatures.length > 1 && (
                          <div className="flex flex-col gap-[4px] mb-[10px]">
                            {composedSignatures.map((sig) => (
                              <label
                                key={sig}
                                className="flex items-center gap-[8px] text-[13px] cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={`transfer-${group.signature_key}`}
                                  checked={transferValue === sig}
                                  onChange={() => setTransferValue(sig)}
                                  className="w-[14px] h-[14px] accent-[#2563EB]"
                                />
                                <span className="text-gray-900 dark:text-[#F3F4F6]">{sig}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-[8px] mb-[10px]">
                          <input
                            type="text"
                            value={transferValue}
                            onChange={(e) => setTransferValue(e.target.value)}
                            placeholder="Дод. сигнатура"
                            className="flex-1 min-w-[240px] h-[36px] px-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[14px]"
                          />
                          <button
                            type="button"
                            onClick={transferToScript}
                            disabled={!transferValue.trim()}
                            className="flex items-center gap-[6px] h-[36px] px-[14px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-[13px]"
                          >
                            <ArrowRightLeft className="w-4 h-4" strokeWidth={2} />
                            Додати в скрипт
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Скрипт оновлення — показуємо, не виконуємо */}
                    <div className="mt-[18px]">
                      <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[8px]">
                        <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-semibold">
                          Скрипт оновлення
                          {scriptDirty && (
                            <span className="ml-[8px] font-normal text-amber-700 dark:text-amber-300 text-[13px]">
                              змінено вручну
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-[8px]">
                          {scriptDirty && (
                            <button
                              type="button"
                              onClick={() => {
                                setScriptDraft(updateScript);
                                setScriptDirty(false);
                              }}
                              className="flex items-center gap-[6px] h-[34px] px-[12px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px]"
                            >
                              <RotateCcw className="w-4 h-4" strokeWidth={2} />
                              Скинути
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={copyScript}
                            disabled={!scriptDraft.trim()}
                            className="flex items-center gap-[6px] h-[34px] px-[12px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[13px] disabled:opacity-40"
                          >
                            <ClipboardCopy className="w-4 h-4" strokeWidth={2} />
                            {copied ? 'Скопійовано' : 'Копіювати'}
                          </button>
                          <button
                            type="button"
                            onClick={executeUpdate}
                            disabled={!scriptDraft.trim() || !!scriptError || executing}
                            className="flex items-center gap-[6px] h-[34px] px-[12px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] disabled:opacity-40 text-white text-[13px]"
                          >
                            <Play className="w-4 h-4" strokeWidth={2} />
                            {executing ? 'Виконання...' : 'Виконати'}
                          </button>
                        </div>
                      </div>
                      {scriptDraft.trim() ? (
                        <>
                          <textarea
                            value={scriptDraft}
                            onChange={(e) => {
                              setScriptDraft(e.target.value);
                              setScriptDirty(true);
                            }}
                            spellCheck={false}
                            rows={Math.max(6, scriptDraft.split('\n').length + 1)}
                            className={`w-full p-[12px] rounded border font-mono bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[13px] ${
                              scriptError
                                ? 'border-red-500'
                                : 'border-gray-300 dark:border-[#374151]'
                            }`}
                          />
                          {scriptError ? (
                            <p className="text-red-600 dark:text-red-400 text-[12px] mt-[6px]">
                              {scriptError} — «Виконати» недоступне. Для складніших змін
                              скопіюйте скрипт і запустіть у Supabase → SQL Editor.
                            </p>
                          ) : (
                            <p className="text-gray-600 dark:text-gray-400 text-[12px] mt-[6px]">
                              Скрипт можна правити перед виконанням. «Виконати» застосує саме те,
                              що написано тут; змінювати можна лише поля справи.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-600 dark:text-gray-400 text-[13px]">
                          Жодне поле не обране для оновлення.
                        </p>
                      )}
                    </div>
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
