import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { isAdminUser } from '../lib/adminUsers';
import CaseInconsistencies from '../components/CaseInconsistencies';
import { formatSignatureList, fromSignatureList, normalizeSignatureFields } from '../lib/caseSignature';
import {
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
  SkipForward,
  CheckCheck,
  RotateCcw,
  Crown,
  Merge,
  Save,
  Download,
} from 'lucide-react';

type Mode = 'A' | 'B' | 'C' | 'D';

const MODES: { key: Mode; title: string; hint: string }[] = [
  {
    key: 'A',
    title: 'Точні дублі',
    hint: 'Усі ключові поля збігаються після нормалізації (регістр, пробіли, латинські гомогліфи)',
  },
  {
    key: 'B',
    title: 'НП + справа + рік',
    hint: 'Той самий населений пункт, шифр справи і рік. Старі назви та їх тип не враховуються',
  },
  {
    key: 'C',
    title: 'Підозри',
    hint: 'Той самий населений пункт і рік, але РІЗНІ шифри справ. Перевіряти вручну',
  },
  {
    key: 'D',
    title: 'Додаткова сигнатура',
    hint: 'Шифр однієї справи дорівнює додатковому шифру іншої — автор сам зазначив, що це та сама справа',
  },
];

interface DuplicateGroup {
  group_key: string;
  records_count: number;
  first_created: string;
  record_ids: string[];
  label: string;
  scope_l4: string[] | null;
  scope_l3: string[] | null;
  scope_l2: string[] | null;
  scope_l1: string[] | null;
  scope_sig: string[] | null;
  archives: string[] | null;
}

// Рівні «обсягу» для масової відмітки «не дублі».
// Група підпадає під обсяг, лише якщо ВСІ її записи в ньому — тобто на цьому
// рівні в групі рівно одне значення, і воно збігається з обраним.
type ScopeLevel = 'l4' | 'l3' | 'l2' | 'l1' | 'sig';

const SCOPE_LEVELS: { key: ScopeLevel; field: keyof DuplicateGroup; title: string }[] = [
  { key: 'l4', field: 'scope_l4', title: 'архів, фонд, опис, справа' },
  { key: 'l3', field: 'scope_l3', title: 'архів, фонд, опис' },
  { key: 'l2', field: 'scope_l2', title: 'архів, фонд' },
  { key: 'l1', field: 'scope_l1', title: 'архів' },
  { key: 'sig', field: 'scope_sig', title: 'шифр справи' },
];

// Значення обсягу придатне, лише якщо всі його складові заповнені:
// 'цдіал|146|19' — так, '||' або 'цдіал||' — ні
const isValidScopeValue = (value: string) =>
  !!value && !value.split('|').some((part) => part.trim() === '');

const scopeValuesOf = (group: DuplicateGroup, field: keyof DuplicateGroup): string[] | null => {
  const values = group[field] as string[] | null;
  if (!values || values.length === 0) return null;
  if (values.some((v) => !isValidScopeValue(v))) return null;
  return [...values].sort();
};

const scopeLabel = (value: string) => value.split('|').join(' · ');

// Усі поля запису з підписами. Порядок = порядок показу в картці.
const FIELDS: { key: string; label: string }[] = [
  { key: 'current_country', label: 'Країна' },
  { key: 'current_region', label: 'Область' },
  { key: 'current_district', label: 'Район' },
  { key: 'current_community', label: 'Громада' },
  { key: 'current_settlement_type', label: 'Тип НП' },
  { key: 'current_settlement_name', label: 'Назва НП' },
  { key: 'latitude', label: 'Широта' },
  { key: 'longitude', label: 'Довгота' },
  { key: 'mark_type', label: 'Тип позначки' },
  { key: 'old_province', label: 'Воєводство (губернія)' },
  { key: 'old_district', label: 'Повіт' },
  { key: 'old_community', label: 'Ключ (староство)' },
  { key: 'old_settlement_type', label: 'Тип НП (старий)' },
  { key: 'old_settlement_name', label: 'Назва НП (стара)' },
  { key: 'archive', label: 'Архів' },
  { key: 'fonds', label: 'Фонд' },
  { key: 'series', label: 'Опис' },
  { key: 'record', label: 'Справа' },
  { key: 'case_signature', label: 'Шифр справи' },
  { key: 'additional_case_signature', label: 'Дод. шифри справи' },
  { key: 'case_title', label: 'Назва справи' },
  { key: 'case_date', label: 'Дати справи' },
  { key: 'inventory_year', label: 'Рік складання інвентаря' },
  { key: 'inventory_type', label: 'Тип документа' },
  { key: 'pages_count', label: 'К-ть сторінок' },
  { key: 'inventory_start_page', label: 'Сторінка початку інвентаря' },
  { key: 'scans_url', label: 'Посилання на скани' },
  { key: 'notes', label: 'Примітки' },
  { key: 'cobook_link', label: 'Кобук' },
  { key: 'cobook_transcript', label: 'Транскрипт' },
  { key: 'email', label: 'Email автора' },
  { key: 'created_by', label: 'Автор (user_id)' },
  { key: 'created_at', label: 'Додано' },
];

// Поля, які можна перенести в запит на редагування.
// id / created_at / created_by / approved лишаються від запису, який зберігаємо,
// email підставляється від адміна, що створює запит (як у звичайній формі редагування).
const MERGEABLE = FIELDS.map((f) => f.key).filter(
  (k) => !['email', 'created_by', 'created_at'].includes(k)
);

const formatValue = (key: string, value: any) => {
  if (value === null || value === undefined || value === '') return '—';
  // Дод. сигнатури — масив: показуємо через кому, порожній вважаємо незаповненим
  if (key === 'additional_case_signature') return formatSignatureList(value) || '—';
  if (key === 'created_at') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('uk-UA');
  }
  if (key === 'cobook_transcript') {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  return String(value);
};

// Для порівняння між записами групи: порожні значення вважаємо однаковими
const comparable = (value: any) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return formatSignatureList(value);
  return String(value).trim();
};

// У картинку, якою діляться, не тягнемо контакти й ідентифікатори авторів
const IMAGE_SKIP_FIELDS = ['email', 'created_by'];

const IMAGE = {
  width: 1000,
  pad: 32,
  bg: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#D1D5DB',
  highlight: '#FEF3C7',
  keep: '#14AE5C',
  dup: '#DC2626',
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
};

export default function AdminDuplicatesPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<'duplicates' | 'cases'>('duplicates');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [counts, setCounts] = useState<Record<Mode, number | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const [mode, setMode] = useState<Mode>('B');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [index, setIndex] = useState(0);

  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reviewedCount, setReviewedCount] = useState<number | null>(null);

  const [bulkScope, setBulkScope] = useState<ScopeLevel | null>(null);
  const [scopeSelected, setScopeSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeChoices, setMergeChoices] = useState<Record<string, string>>({});
  const [mergeComment, setMergeComment] = useState('');

  // Стабільна функція тостів: інлайн-стрілка мінялась щорендеру й перезапускала
  // ефект завантаження у вкладці «Неповні дані справ», скидаючи її стан
  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => setToast({ message, type }),
    []
  );

  const currentGroup = groups[index] ?? null;

  // Найраніший запис групи — за замовчуванням саме його лишаємо в реєстрі
  const earliestId = records.length
    ? records.reduce((acc, r) => (new Date(r.created_at) < new Date(acc.created_at) ? r : acc)).id
    : null;

  // Поля, значення яких у групі не збігаються — підсвічуємо, щоб було видно різницю
  const differingFields = useMemo(() => {
    const diff = new Set<string>();
    if (records.length < 2) return diff;
    for (const field of FIELDS) {
      const values = new Set(records.map((r) => comparable(r[field.key])));
      if (values.size > 1) diff.add(field.key);
    }
    return diff;
  }, [records]);

  // Записи, дані яких можна взяти в запит на редагування: той, що лишається, + обрані дублі
  const mergeCandidates = useMemo(
    () => records.filter((r) => r.id === keepId || selected.has(r.id)),
    [records, keepId, selected]
  );

  // Поля, які в цих записах відрізняються — тільки для них є що обирати
  const mergeFields = useMemo(() => {
    if (mergeCandidates.length < 2) return [] as { key: string; label: string }[];
    return FIELDS.filter((f) => {
      if (!MERGEABLE.includes(f.key)) return false;
      const values = new Set(mergeCandidates.map((r) => comparable(r[f.key])));
      return values.size > 1;
    });
  }, [mergeCandidates]);

  // Обсяги, доступні для поточної групи. На кожному рівні може бути кілька
  // значень — наприклад, група з записами і ЦДІАЛ, і ЛННБ дає два фонди,
  // і тоді обсягом стає їх об'єднання.
  const availableScopes = useMemo(() => {
    if (!currentGroup) return [];
    return SCOPE_LEVELS.map((level) => {
      const values = scopeValuesOf(currentGroup, level.field);
      if (!values) return null;
      return { ...level, values };
    }).filter(Boolean) as {
      key: ScopeLevel;
      field: keyof DuplicateGroup;
      title: string;
      values: string[];
    }[];
  }, [currentGroup]);

  const activeScope = availableScopes.find((s) => s.key === bulkScope) ?? null;

  // Група потрапляє під дію, лише якщо КОЖЕН її запис належить хоча б одному
  // з обраних значень обсягу
  const affectedGroups = useMemo(() => {
    if (!activeScope || scopeSelected.size === 0) return [] as DuplicateGroup[];
    return groups.filter((g) => {
      const values = scopeValuesOf(g, activeScope.field);
      return !!values && values.every((v) => scopeSelected.has(v));
    });
  }, [activeScope, scopeSelected, groups]);

  const loadReviewedCount = useCallback(async (nextMode: Mode) => {
    const { count, error: countError } = await supabase
      .from('records_duplicate_reviewed')
      .select('*', { count: 'exact', head: true })
      .eq('mode', nextMode);

    if (countError) {
      console.error('Помилка підрахунку переглянутих груп:', countError);
      setReviewedCount(null);
      return;
    }

    setReviewedCount(count ?? 0);
  }, []);

  const loadGroups = useCallback(
    async (nextMode: Mode) => {
      setGroupsLoading(true);
      const { data, error: rpcError } = await supabase.rpc('find_duplicate_groups', {
        p_mode: nextMode,
      });

      if (rpcError) {
        console.error('Помилка пошуку дублів:', rpcError);
        setToast({ message: '❌ Помилка пошуку дублів: ' + rpcError.message, type: 'error' });
        setGroups([]);
        setCounts((prev) => ({ ...prev, [nextMode]: null }));
      } else {
        const nextGroups = (data as DuplicateGroup[]) || [];
        setGroups(nextGroups);
        setCounts((prev) => ({ ...prev, [nextMode]: nextGroups.length }));
      }

      setIndex(0);
      setGroupsLoading(false);
      await loadReviewedCount(nextMode);
    },
    [loadReviewedCount]
  );

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const init = async () => {
      const hasAdminAccess = await isAdminUser(supabase, user.id);

      if (!hasAdminAccess) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // Один прохід по всіх критеріях: одразу маємо і лічильники, і групи
      // для типового режиму 'B', тож повторний запит не потрібен
      const results = await Promise.all(
        MODES.map(async (m) => {
          const { data, error: rpcError } = await supabase.rpc('find_duplicate_groups', {
            p_mode: m.key,
          });
          if (rpcError) {
            console.error(`Помилка підрахунку груп (${m.key}):`, rpcError);
            return { key: m.key, groups: null as DuplicateGroup[] | null };
          }
          return { key: m.key, groups: (data as DuplicateGroup[]) || [] };
        })
      );

      setCounts(
        Object.fromEntries(results.map((r) => [r.key, r.groups?.length ?? null])) as Record<
          Mode,
          number | null
        >
      );
      setGroups(results.find((r) => r.key === 'B')?.groups || []);
      setIndex(0);
      await loadReviewedCount('B');
      setLoading(false);
    };

    init();
  }, [user, userLoading, loadReviewedCount]);

  // Записи поточної групи
  useEffect(() => {
    if (!currentGroup) {
      setRecords([]);
      setSelected(new Set());
      setKeepId(null);
      return;
    }

    let cancelled = false;

    const fetchRecords = async () => {
      setRecordsLoading(true);
      setSelected(new Set());
      setMergeOpen(false);
      setBulkScope(null);
      setScopeSelected(new Set());

      const { data, error: fetchError } = await supabase
        .from('records')
        .select('*')
        .in('id', currentGroup.record_ids)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        console.error('Помилка завантаження записів групи:', fetchError);
        setToast({ message: '❌ Помилка завантаження записів групи', type: 'error' });
        setRecords([]);
        setKeepId(null);
      } else {
        const rows = data || [];
        setRecords(rows);
        setKeepId(rows.length ? rows[0].id : null);
      }

      setRecordsLoading(false);
    };

    fetchRecords();

    return () => {
      cancelled = true;
    };
  }, [currentGroup]);

  // Значення за замовчуванням для об'єднання: беремо з запису, що лишається,
  // а якщо в нього поле порожнє — перше непорожнє з обраних дублів
  useEffect(() => {
    if (mergeCandidates.length < 2 || !keepId) {
      setMergeChoices({});
      return;
    }

    const defaults: Record<string, string> = {};
    for (const field of mergeFields) {
      const keepRecord = mergeCandidates.find((r) => r.id === keepId);
      if (keepRecord && comparable(keepRecord[field.key]) !== '') {
        defaults[field.key] = keepId;
        continue;
      }
      const donor = mergeCandidates.find((r) => comparable(r[field.key]) !== '');
      defaults[field.key] = donor ? donor.id : keepId;
    }
    setMergeChoices(defaults);
  }, [mergeFields, mergeCandidates, keepId]);

  const changeMode = async (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    await loadGroups(nextMode);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const changeKeep = (id: string) => {
    setKeepId(id);
    // запис, який лишаємо, не може бути водночас дублем
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    setIndex(nextIndex);
  };

  const dropCurrentGroup = () => {
    const nextGroups = groups.filter((_, i) => i !== index);
    setGroups(nextGroups);
    setIndex(Math.min(index, Math.max(nextGroups.length - 1, 0)));
    setCounts((prev) => ({
      ...prev,
      [mode]: prev[mode] === null ? null : Math.max((prev[mode] as number) - 1, 0),
    }));
  };

  const markAsDuplicates = async () => {
    if (!currentGroup || selected.size === 0) return;

    if (selected.size >= records.length) {
      setToast({
        message: '❌ Не можна позначити дублями всі записи групи — один має лишитися в реєстрі',
        type: 'error',
      });
      return;
    }

    const ids = Array.from(selected);
    const confirmed = window.confirm(
      `Позначити ${ids.length} запис(ів) як дублі?\n\n` +
        'Записи не видаляються з бази — їм проставляється approved = false, ' +
        'після чого вони зникають з реєстру, пошуку, карти та статистики.'
    );
    if (!confirmed) return;

    setSaving(true);

    const { error: updateError } = await supabase
      .from('records')
      .update({ approved: false })
      .in('id', ids);

    setSaving(false);

    if (updateError) {
      console.error('Помилка позначення дублів:', updateError);
      setToast({ message: '❌ Помилка збереження: ' + updateError.message, type: 'error' });
      return;
    }

    setToast({ message: `✅ Позначено дублями: ${ids.length}`, type: 'success' });
    dropCurrentGroup();
  };

  // Запит на редагування для запису, який лишається: збирає значення полів
  // із нього самого та з обраних дублів і кладе в records_edit
  const createEditRequest = async () => {
    if (!keepId || mergeCandidates.length < 2) return;

    const keepRecord = records.find((r) => r.id === keepId);
    if (!keepRecord) return;

    const merged: Record<string, any> = {};
    for (const key of MERGEABLE) {
      const sourceId = mergeChoices[key] ?? keepId;
      const source = records.find((r) => r.id === sourceId) ?? keepRecord;
      const value = source[key];
      merged[key] =
        key === 'additional_case_signature'
          ? fromSignatureList(value)
          : value === '' ? null : (value ?? null);
    }

    setSaving(true);

    // Запит на редагування — один рядок на запис, тож попереджаємо,
    // якщо на цей інвентар уже є неопрацьоване редагування
    const { data: existingEdit, error: existingError } = await supabase
      .from('records_edit')
      .select('id')
      .eq('id', keepId)
      .maybeSingle();

    if (existingError) {
      setSaving(false);
      console.error('Помилка перевірки наявних редагувань:', existingError);
      setToast({ message: '❌ Помилка перевірки: ' + existingError.message, type: 'error' });
      return;
    }

    if (existingEdit) {
      const overwrite = window.confirm(
        'На цей інвентар уже є запит на редагування, який чекає на перевірку.\n\n' +
          'Створити новий — означає замінити той запит цим. Продовжити?'
      );
      if (!overwrite) {
        setSaving(false);
        return;
      }
    }

    // Шифри чистимо від зайвих пробілів — те саме правило, що й на решті
    // шляхів запису (див. normalizeSignature у lib/caseSignature.ts)
    const mergedClean = normalizeSignatureFields(merged);

    const payload = {
      id: keepId,
      ...mergedClean,
      is_ukrainian_archive: mergedClean.archive ? 'Так' : 'Ні',
      email: user?.email ?? keepRecord.email ?? null,
      comment: mergeComment.trim(),
      json_full_data: { ...mergedClean, id: keepId },
    };

    const { error: upsertError } = await supabase
      .from('records_edit')
      .upsert(payload, { onConflict: 'id' });

    setSaving(false);

    if (upsertError) {
      console.error('Помилка створення запиту на редагування:', upsertError);
      setToast({ message: '❌ Помилка збереження: ' + upsertError.message, type: 'error' });
      return;
    }

    setMergeOpen(false);
    setToast({
      message: '✅ Запит на редагування створено — підтвердити його можна в «Редаговані інвентарі»',
      type: 'success',
    });
  };

  const markAsReviewed = async () => {
    if (!currentGroup) return;

    setSaving(true);

    const { error: insertError } = await supabase.from('records_duplicate_reviewed').upsert(
      { mode, group_key: currentGroup.group_key, reviewed_by: user?.id ?? null },
      // ON CONFLICT DO NOTHING: повторна відмітка тієї ж групи не помилка
      { onConflict: 'mode,group_key', ignoreDuplicates: true }
    );

    setSaving(false);

    if (insertError) {
      console.error('Помилка збереження відмітки:', insertError);
      setToast({ message: '❌ Помилка збереження: ' + insertError.message, type: 'error' });
      return;
    }

    setReviewedCount((prev) => (prev === null ? null : prev + 1));
    setToast({ message: '✅ Групу позначено як «не дублі»', type: 'success' });
    dropCurrentGroup();
  };

  // Масова відмітка «не дублі» для всіх груп обраного обсягу
  const markScopeReviewed = async () => {
    if (!activeScope || affectedGroups.length === 0) return;

    const confirmed = window.confirm(
      `Позначити «не дублі» ${affectedGroups.length} груп(и) за обсягом ` +
        `${activeScope.title}:\n` +
        Array.from(scopeSelected).map(scopeLabel).join('\n') +
        '\n\nЦі групи зникнуть зі списку. Записи в реєстрі не змінюються — ' +
        'повернути групи можна кнопкою «Очистити список переглянутих».'
    );
    if (!confirmed) return;

    setSaving(true);

    const rows = affectedGroups.map((g) => ({
      mode,
      group_key: g.group_key,
      reviewed_by: user?.id ?? null,
    }));

    // Вставляємо порціями: груп може бути кілька сотень
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insertError } = await supabase
        .from('records_duplicate_reviewed')
        .upsert(rows.slice(i, i + CHUNK), {
          onConflict: 'mode,group_key',
          ignoreDuplicates: true,
        });

      if (insertError) {
        setSaving(false);
        console.error('Помилка масової відмітки:', insertError);
        setToast({ message: '❌ Помилка збереження: ' + insertError.message, type: 'error' });
        return;
      }
    }

    setSaving(false);

    const markedKeys = new Set(affectedGroups.map((g) => g.group_key));
    const nextGroups = groups.filter((g) => !markedKeys.has(g.group_key));

    setGroups(nextGroups);
    setIndex(Math.min(index, Math.max(nextGroups.length - 1, 0)));
    setCounts((prev) => ({ ...prev, [mode]: nextGroups.length }));
    setReviewedCount((prev) => (prev === null ? null : prev + markedKeys.size));
    setBulkScope(null);
    setScopeSelected(new Set());
    setToast({ message: `✅ Позначено «не дублі»: ${markedKeys.size} груп(и)`, type: 'success' });
  };

  const clearReviewed = async () => {
    const confirmed = window.confirm(
      `Очистити список переглянутих груп за критерієм ${mode}?\n\n` +
        'Групи, які ви позначили як «не дублі», знову з\'являться у списку. ' +
        'Записи, вже позначені дублями, це не змінює.'
    );
    if (!confirmed) return;

    setSaving(true);

    const { error: deleteError } = await supabase
      .from('records_duplicate_reviewed')
      .delete()
      .eq('mode', mode);

    setSaving(false);

    if (deleteError) {
      console.error('Помилка очищення списку:', deleteError);
      setToast({ message: '❌ Помилка очищення: ' + deleteError.message, type: 'error' });
      return;
    }

    setToast({ message: '✅ Список переглянутих очищено', type: 'success' });
    await loadGroups(mode);
  };

  // Малюємо картку групи на canvas і віддаємо PNG. Власне малювання, а не знімок
  // екрана: так картинка однакова в темній і світлій темі, без службових кнопок,
  // і в неї не потрапляють email та id авторів.
  const saveGroupImage = () => {
    if (!currentGroup || records.length === 0) return;

    const dpr = 2;
    const { width: W, pad } = IMAGE;
    const inner = W - pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = 6000 * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setToast({ message: '❌ Не вдалося створити зображення', type: 'error' });
      return;
    }

    ctx.scale(dpr, dpr);
    ctx.fillStyle = IMAGE.bg;
    ctx.fillRect(0, 0, W, 6000);
    ctx.textBaseline = 'top';

    const font = (size: number, weight = '400') =>
      `${weight} ${size}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

    let y = pad;

    ctx.fillStyle = IMAGE.text;
    ctx.font = font(24, '700');
    ctx.fillText('Inventarium — можливі дублі', pad, y);
    y += 34;

    ctx.fillStyle = IMAGE.muted;
    ctx.font = font(15);
    const modeTitle = MODES.find((m) => m.key === mode)?.title ?? mode;
    ctx.fillText(`Критерій ${mode}. ${modeTitle}`, pad, y);
    y += 26;

    ctx.fillStyle = IMAGE.text;
    ctx.font = font(17, '600');
    for (const line of wrapText(ctx, currentGroup.label, inner)) {
      ctx.fillText(line, pad, y);
      y += 24;
    }

    ctx.fillStyle = IMAGE.muted;
    ctx.font = font(14);
    ctx.fillText(`Записів у групі: ${records.length}`, pad, y);
    y += 30;

    for (const record of records) {
      const isKeep = record.id === keepId;
      const isDup = selected.has(record.id);
      const blockTop = y;
      const blockPad = 14;

      y += blockPad;

      ctx.fillStyle = IMAGE.text;
      ctx.font = font(16, '700');
      ctx.fillText(
        `${record.current_settlement_type ?? ''} ${record.current_settlement_name ?? ''}`.trim(),
        pad + blockPad,
        y
      );

      if (isKeep || isDup) {
        ctx.fillStyle = isDup ? IMAGE.dup : IMAGE.keep;
        ctx.font = font(13, '700');
        const badge = isDup ? 'ДУБЛЬ' : 'ОСНОВНИЙ';
        ctx.fillText(badge, W - pad - blockPad - ctx.measureText(badge).width, y + 2);
      }
      y += 24;

      ctx.fillStyle = IMAGE.muted;
      ctx.font = font(13);
      ctx.fillText(`/record/${record.id}`, pad + blockPad, y);
      y += 22;

      const labelWidth = 210;
      for (const field of FIELDS) {
        if (IMAGE_SKIP_FIELDS.includes(field.key)) continue;

        const value = formatValue(field.key, record[field.key]);
        if (value === '—') continue;

        ctx.font = font(13);
        const valueLines = wrapText(ctx, value, inner - blockPad * 2 - labelWidth);
        const rowHeight = valueLines.length * 18;

        if (differingFields.has(field.key)) {
          ctx.fillStyle = IMAGE.highlight;
          ctx.fillRect(pad + blockPad - 4, y - 2, inner - blockPad * 2 + 8, rowHeight + 4);
        }

        ctx.fillStyle = IMAGE.muted;
        ctx.font = font(13);
        ctx.fillText(field.label, pad + blockPad, y);

        ctx.fillStyle = IMAGE.text;
        valueLines.forEach((line, i) => {
          ctx.fillText(line, pad + blockPad + labelWidth, y + i * 18);
        });

        y += rowHeight + 4;
      }

      y += blockPad;

      ctx.strokeStyle = isDup ? IMAGE.dup : isKeep ? IMAGE.keep : IMAGE.border;
      ctx.lineWidth = isKeep || isDup ? 2 : 1;
      ctx.strokeRect(pad, blockTop, inner, y - blockTop);
      y += 14;
    }

    ctx.fillStyle = IMAGE.muted;
    ctx.font = font(12);
    ctx.fillText(
      `Підсвічені поля — ті, що в межах групи відрізняються · ${new Date().toLocaleDateString('uk-UA')}`,
      pad,
      y
    );
    y += 20 + pad;

    // Обрізаємо полотно по фактичній висоті
    const out = document.createElement('canvas');
    out.width = W * dpr;
    out.height = Math.round(y * dpr);
    const outCtx = out.getContext('2d');
    if (!outCtx) {
      setToast({ message: '❌ Не вдалося створити зображення', type: 'error' });
      return;
    }
    outCtx.drawImage(canvas, 0, 0);

    out.toBlob((blob) => {
      if (!blob) {
        setToast({ message: '❌ Не вдалося створити зображення', type: 'error' });
        return;
      }

      const name = `${records[0]?.current_settlement_name ?? 'group'}-${
        records[0]?.inventory_year ?? ''
      }`.replace(/[^\wА-Яа-яЇїІіЄєҐґ-]+/g, '_');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventarium-dubli-${mode}-${name}.png`;
      link.click();
      // Звільняти URL одразу після click() не можна: у частині браузерів
      // завантаження стартує асинхронно і встигає отримати вже мертве посилання
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setToast({ message: '✅ Зображення збережено', type: 'success' });
    }, 'image/png');
  };

  const openMerge = () => {
    const keepRecord = records.find((r) => r.id === keepId);
    const donors = records.filter((r) => selected.has(r.id));
    setMergeComment(
      `Об'єднання дублів: до запису перенесено дані з ${donors.length} запис(ів) — ` +
        donors.map((r) => r.case_signature || r.id).join(', ') +
        (keepRecord ? `. Залишено: ${keepRecord.case_signature || keepRecord.id}` : '')
    );
    setMergeOpen(true);
  };

  if (userLoading || loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (error || !isAdmin) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400 text-[16px]">
            {error || '⛔ У вас немає доступу до цієї сторінки'}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          <div className="flex items-center gap-[10px] mb-[15px]">
            <Copy className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Пошук помилок в реєстрі
            </h1>
          </div>

          {/* Вкладки */}
          <div className="flex gap-[4px] border-b border-gray-300 dark:border-[#374151] mb-[20px]">
            {(
              [
                { key: 'duplicates', title: 'Дублі в реєстрі' },
                { key: 'cases', title: 'Неповні дані справ' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-[18px] h-[42px] text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-[#F3F4F6]'
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>

          {tab === 'cases' ? (
            <CaseInconsistencies onToast={showToast} />
          ) : (
            <>
          <p className="text-gray-700 dark:text-gray-300 text-[14px] mb-[20px] lg:mb-[30px]">
            Записи не видаляються фізично: обраним проставляється{' '}
            <code className="px-1 rounded bg-gray-100 dark:bg-[#374151]">approved = false</code>.
            Поля, які в межах групи відрізняються, підсвічені.
          </p>

          {/* Критерії */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[15px] mb-[20px]">
            {MODES.map((m) => {
              const active = m.key === mode;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => changeMode(m.key)}
                  disabled={groupsLoading}
                  className={`text-left p-[15px] rounded-lg border transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]'
                      : 'border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] hover:border-[#2563EB]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-[10px]">
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                      {m.key}. {m.title}
                    </span>
                    <span className="text-gray-900 dark:text-white text-[24px] font-bold">
                      {counts[m.key] ?? '—'}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-[13px] mt-[6px]">{m.hint}</p>
                </button>
              );
            })}
          </div>

          {/* Список переглянутих груп за поточним критерієм */}
          <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[20px] p-[12px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
            <p className="text-gray-700 dark:text-gray-300 text-[14px]">
              Позначено «не дублі» за критерієм {mode}:{' '}
              <span className="font-semibold text-gray-900 dark:text-[#F3F4F6]">
                {reviewedCount ?? '—'}
              </span>{' '}
              — ці групи приховані зі списку
            </p>
            <button
              type="button"
              onClick={clearReviewed}
              disabled={saving || groupsLoading || !reviewedCount}
              className="flex items-center gap-[6px] h-[36px] px-[14px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] text-[14px] disabled:opacity-40"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2} />
              Очистити список переглянутих
            </button>
          </div>

          {groupsLoading ? (
            <p className="text-gray-900 dark:text-white text-[16px]">Пошук дублів...</p>
          ) : groups.length === 0 ? (
            <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
              <p className="text-gray-900 dark:text-white text-[16px]">
                За цим критерієм дублів не знайдено.
              </p>
            </div>
          ) : (
            <>
              {/* Навігація по групах */}
              <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[15px]">
                <div>
                  <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                    Група {index + 1} з {groups.length}
                  </p>
                  {currentGroup && (
                    <>
                      <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                        {currentGroup.label} · записів: {currentGroup.records_count}
                      </p>
                      {currentGroup.archives && currentGroup.archives.length > 0 && (
                        <p
                          className={`inline-block mt-[4px] px-[8px] py-[2px] rounded text-[13px] ${
                            currentGroup.archives.length > 1
                              ? 'bg-amber-100 dark:bg-[#4A3413] text-amber-900 dark:text-amber-200'
                              : 'bg-gray-200 dark:bg-[#374151] text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {currentGroup.archives.length > 1
                            ? `${currentGroup.archives.length} архіви: `
                            : 'Архів: '}
                          {currentGroup.archives.join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-[10px]">
                  <button
                    type="button"
                    onClick={() => goTo(index - 1)}
                    disabled={index === 0}
                    className="flex items-center gap-[6px] h-[40px] px-[14px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                    <span className="text-[14px]">Назад</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(index + 1)}
                    disabled={index >= groups.length - 1}
                    className="flex items-center gap-[6px] h-[40px] px-[14px] rounded border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] disabled:opacity-40"
                  >
                    <span className="text-[14px]">Далі</span>
                    <ChevronRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Записи групи */}
              {recordsLoading ? (
                <p className="text-gray-900 dark:text-white text-[16px]">Завантаження записів...</p>
              ) : (
                <div className="flex flex-col gap-[15px]">
                  {records.map((r) => {
                    const isKeep = r.id === keepId;
                    const isSelected = selected.has(r.id);
                    return (
                      <section
                        key={r.id}
                        className={`p-[15px] rounded-lg border ${
                          isSelected
                            ? 'border-red-500 bg-red-50 dark:bg-[#3B1D1D]'
                            : isKeep
                              ? 'border-[#14AE5C] bg-green-50 dark:bg-[#14301F]'
                              : 'border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-[15px] flex-wrap">
                          <div className="flex flex-col gap-[8px]">
                            <span className="flex items-center gap-[8px] flex-wrap">
                              <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                                {r.current_settlement_type} {r.current_settlement_name}
                              </span>
                              {r.id === earliestId && (
                                <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded bg-gray-200 dark:bg-[#374151] text-gray-800 dark:text-gray-200 text-[12px]">
                                  <Crown className="w-3 h-3" strokeWidth={2} />
                                  найраніший
                                </span>
                              )}
                            </span>

                            <div className="flex items-center gap-[18px] flex-wrap">
                              <label className="flex items-center gap-[7px] cursor-pointer">
                                <input
                                  type="radio"
                                  name={`keep-${currentGroup?.group_key}`}
                                  checked={isKeep}
                                  onChange={() => changeKeep(r.id)}
                                  className="w-[16px] h-[16px] accent-[#14AE5C]"
                                />
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px]">
                                  Залишити в реєстрі
                                </span>
                              </label>
                              <label
                                className={`flex items-center gap-[7px] ${isKeep ? 'opacity-40' : 'cursor-pointer'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isKeep}
                                  onChange={() => toggleSelected(r.id)}
                                  className="w-[16px] h-[16px] accent-red-600"
                                />
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px]">
                                  Це дубль
                                </span>
                              </label>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-[6px]">
                            <a
                              href={`/record/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-[6px] text-[#2563EB] hover:underline text-[14px] whitespace-nowrap"
                            >
                              Відкрити запис
                              <ExternalLink className="w-4 h-4" strokeWidth={2} />
                            </a>
                            {r.case_signature && (
                              <a
                                href={`/case?case_signature=${encodeURIComponent(r.case_signature)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-[6px] text-[#2563EB] hover:underline text-[14px] whitespace-nowrap"
                              >
                                Сторінка справи
                                <ExternalLink className="w-4 h-4" strokeWidth={2} />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Повний склад запису */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-[20px] gap-y-[4px] mt-[12px]">
                          {FIELDS.map((f) => {
                            const differs = differingFields.has(f.key);
                            return (
                              <p
                                key={f.key}
                                className={`text-[13px] px-[4px] rounded ${
                                  differs
                                    ? 'bg-amber-100 dark:bg-[#4A3413] text-amber-900 dark:text-amber-200'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                <span className="opacity-70">{f.label}: </span>
                                {f.key === 'scans_url' && r[f.key] ? (
                                  <a
                                    href={r[f.key]}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[#2563EB] hover:underline break-all"
                                  >
                                    {formatValue(f.key, r[f.key])}
                                  </a>
                                ) : (
                                  <span className="break-words">{formatValue(f.key, r[f.key])}</span>
                                )}
                              </p>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Швидке опрацювання: «не дублі» одразу для всього фонду/опису/справи */}
              {!recordsLoading && availableScopes.length > 0 && (
                <div className="mt-[20px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold mb-[5px]">
                    Не дублі — одразу для всього обсягу
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-[13px] mb-[12px]">
                    Група потрапляє в обсяг, лише якщо кожен її запис належить до одного з
                    відмічених значень. Якщо в групі кілька архівів чи фондів — відмітьте всі
                    потрібні, і обсягом стане їх об'єднання.
                  </p>
                  <div className="flex flex-wrap gap-[10px]">
                    {availableScopes.map((scope) => (
                      <button
                        key={scope.key}
                        type="button"
                        onClick={() => {
                          if (bulkScope === scope.key) {
                            setBulkScope(null);
                            setScopeSelected(new Set());
                          } else {
                            setBulkScope(scope.key);
                            // за замовчуванням беремо всі значення поточної групи
                            setScopeSelected(new Set(scope.values));
                          }
                        }}
                        disabled={saving}
                        className={`text-left px-[14px] py-[10px] rounded border text-[14px] transition-colors disabled:opacity-40 ${
                          bulkScope === scope.key
                            ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F] text-gray-900 dark:text-[#F3F4F6]'
                            : 'border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] hover:border-[#2563EB]'
                        }`}
                      >
                        <span className="block font-medium">{scope.title}</span>
                        <span className="block text-gray-600 dark:text-gray-400 text-[13px]">
                          {scope.values.length === 1
                            ? scopeLabel(scope.values[0])
                            : `значень у групі: ${scope.values.length}`}
                        </span>
                      </button>
                    ))}
                  </div>

                  {activeScope && (
                    <div className="mt-[15px] pt-[15px] border-t border-gray-300 dark:border-[#374151]">
                      <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium mb-[6px]">
                        Що входить в обсяг
                      </p>
                      <div className="flex flex-col gap-[4px] mb-[12px]">
                        {activeScope.values.map((value) => (
                          <label
                            key={value}
                            className="flex items-center gap-[8px] cursor-pointer text-[14px]"
                          >
                            <input
                              type="checkbox"
                              checked={scopeSelected.has(value)}
                              onChange={() =>
                                setScopeSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(value)) {
                                    next.delete(value);
                                  } else {
                                    next.add(value);
                                  }
                                  return next;
                                })
                              }
                              className="w-[16px] h-[16px] accent-[#2563EB]"
                            />
                            <span className="text-gray-700 dark:text-gray-300">
                              {scopeLabel(value)}
                            </span>
                          </label>
                        ))}
                      </div>

                      <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] mb-[8px]">
                        Буде позначено «не дублі»: {affectedGroups.length} груп(и)
                      </p>
                      <div className="max-h-[260px] overflow-y-auto rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] divide-y divide-gray-200 dark:divide-[#374151]">
                        {affectedGroups.map((g) => (
                          <p
                            key={g.group_key}
                            className={`px-[10px] py-[6px] text-[13px] ${
                              g.group_key === currentGroup?.group_key
                                ? 'text-[#2563EB] font-medium'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {g.label} · записів: {g.records_count}
                          </p>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={markScopeReviewed}
                        disabled={saving || affectedGroups.length === 0}
                        className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] mt-[12px] bg-[#14AE5C] hover:bg-[#0F8A4A] disabled:opacity-40 text-white rounded transition-colors"
                      >
                        <CheckCheck className="w-5 h-5" strokeWidth={2} />
                        <span className="text-[15px] font-medium">
                          {saving
                            ? 'Збереження...'
                            : `Не дублі — підтвердити для ${affectedGroups.length} груп(и)`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Об'єднання даних у запит на редагування */}
              {mergeOpen && mergeCandidates.length > 1 && (
                <div className="mt-[20px] p-[15px] rounded-lg border border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]">
                  <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] font-semibold mb-[5px]">
                    Дані для запиту на редагування
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300 text-[14px] mb-[15px]">
                    Оберіть, з якого запису брати значення для кожного поля, що відрізняється.
                    Решта полів береться із запису, який лишається в реєстрі.
                  </p>

                  {mergeFields.length === 0 ? (
                    <p className="text-gray-700 dark:text-gray-300 text-[14px]">
                      Обрані записи не мають розбіжностей у полях — переносити нічого.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-[12px]">
                      {mergeFields.map((f) => (
                        <div
                          key={f.key}
                          className="p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937]"
                        >
                          <p className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium mb-[6px]">
                            {f.label}
                          </p>
                          <div className="flex flex-col gap-[4px]">
                            {mergeCandidates.map((r) => (
                              <label
                                key={r.id}
                                className="flex items-start gap-[8px] cursor-pointer text-[13px]"
                              >
                                <input
                                  type="radio"
                                  name={`merge-${f.key}`}
                                  checked={mergeChoices[f.key] === r.id}
                                  onChange={() =>
                                    setMergeChoices((prev) => ({ ...prev, [f.key]: r.id }))
                                  }
                                  className="mt-[3px] w-[14px] h-[14px] accent-[#2563EB]"
                                />
                                <span className="text-gray-700 dark:text-gray-300 break-words">
                                  {formatValue(f.key, r[f.key])}
                                  <span className="opacity-60">
                                    {' '}
                                    ({r.id === keepId ? 'залишається' : 'дубль'},{' '}
                                    {r.case_signature || r.id.slice(0, 8)})
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="block mt-[15px]">
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] font-medium">
                      Коментар до запиту
                    </span>
                    <textarea
                      value={mergeComment}
                      onChange={(e) => setMergeComment(e.target.value)}
                      rows={3}
                      className="w-full mt-[5px] p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[14px]"
                    />
                  </label>

                  <div className="flex flex-wrap gap-[12px] mt-[15px]">
                    <button
                      type="button"
                      onClick={createEditRequest}
                      disabled={saving}
                      className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white rounded transition-colors"
                    >
                      <Save className="w-5 h-5" strokeWidth={2} />
                      <span className="text-[15px] font-medium">
                        {saving ? 'Збереження...' : 'Створити запит на редагування'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeOpen(false)}
                      className="flex items-center justify-center h-[44px] px-[18px] border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] rounded"
                    >
                      <span className="text-[15px] font-medium">Скасувати</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Дії */}
              <div className="flex flex-wrap items-center gap-[12px] mt-[20px]">
                <button
                  type="button"
                  onClick={openMerge}
                  disabled={saving || recordsLoading || selected.size === 0 || mergeOpen}
                  className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white rounded transition-colors"
                >
                  <Merge className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[15px] font-medium">Перенести дані в запис</span>
                </button>
                <button
                  type="button"
                  onClick={markAsDuplicates}
                  disabled={saving || selected.size === 0 || recordsLoading}
                  className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 text-white rounded transition-colors"
                >
                  <Trash2 className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[15px] font-medium">
                    {saving ? 'Збереження...' : `Позначити дублями (${selected.size})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={markAsReviewed}
                  disabled={saving || recordsLoading || !currentGroup}
                  className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] bg-[#14AE5C] hover:bg-[#0F8A4A] disabled:opacity-40 text-white rounded transition-colors"
                >
                  <CheckCheck className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[15px] font-medium">Це не дублі</span>
                </button>
                <button
                  type="button"
                  onClick={() => goTo(index + 1)}
                  disabled={index >= groups.length - 1}
                  className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] rounded disabled:opacity-40"
                >
                  <SkipForward className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[15px] font-medium">Пропустити</span>
                </button>
                <button
                  type="button"
                  onClick={saveGroupImage}
                  disabled={recordsLoading || records.length === 0}
                  className="flex items-center justify-center gap-[8px] h-[44px] px-[18px] border border-gray-300 dark:border-[#374151] text-gray-900 dark:text-[#F3F4F6] rounded disabled:opacity-40"
                >
                  <Download className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[15px] font-medium">Зберегти зображенням</span>
                </button>
              </div>
            </>
          )}
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
