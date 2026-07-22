import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import { useUser } from '../contexts/UserContext';
import { isAdminUser } from '../lib/adminUsers';
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
  FileText,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-react';

type Mode = 'A' | 'B' | 'C';

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
];

interface DuplicateGroup {
  group_key: string;
  records_count: number;
  first_created: string;
  record_ids: string[];
  label: string;
}

const GROUP_FIELDS = `
  id, created_at, created_by, email,
  current_region, current_district, current_community,
  current_settlement_type, current_settlement_name,
  old_province, old_district, old_community,
  old_settlement_type, old_settlement_name,
  archive, fonds, series, record, case_signature, additional_case_signature,
  case_title, case_date, inventory_year, pages_count, inventory_start_page,
  scans_url, notes, cobook_link, cobook_transcript
`;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export default function AdminDuplicatesPage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [counts, setCounts] = useState<Record<Mode, number | null>>({ A: null, B: null, C: null });
  const [mode, setMode] = useState<Mode>('B');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [index, setIndex] = useState(0);

  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reviewedCount, setReviewedCount] = useState<number | null>(null);

  const currentGroup = groups[index] ?? null;

  // Найраніший запис групи — «еталон», його підсвічуємо і не пропонуємо до видалення
  const earliestId = records.length
    ? records.reduce((acc, r) => (new Date(r.created_at) < new Date(acc.created_at) ? r : acc)).id
    : null;

  // Скільки груп цього критерію вже позначено як «не дублі»
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
  }, [user, userLoading]);

  // Записи поточної групи
  useEffect(() => {
    if (!currentGroup) {
      setRecords([]);
      setSelected(new Set());
      return;
    }

    let cancelled = false;

    const fetchRecords = async () => {
      setRecordsLoading(true);
      setSelected(new Set());

      const { data, error: fetchError } = await supabase
        .from('records')
        .select(GROUP_FIELDS)
        .in('id', currentGroup.record_ids)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        console.error('Помилка завантаження записів групи:', fetchError);
        setToast({ message: '❌ Помилка завантаження записів групи', type: 'error' });
        setRecords([]);
      } else {
        setRecords(data || []);
      }

      setRecordsLoading(false);
    };

    fetchRecords();

    return () => {
      cancelled = true;
    };
  }, [currentGroup]);

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

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    setIndex(nextIndex);
  };

  // Видаляє групу зі списку після обробки й лишається на тій самій позиції,
  // щоб адмін одразу бачив наступну групу
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

  // «Це не дублі»: запам'ятовуємо групу, щоб вона більше не з'являлася в списку
  const markAsReviewed = async () => {
    if (!currentGroup) return;

    setSaving(true);

    const { error: insertError } = await supabase
      .from('records_duplicate_reviewed')
      .upsert(
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
          <div className="flex items-center gap-[10px] mb-[10px]">
            <Copy className="w-6 h-6 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
            <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
              Пошук дублів у реєстрі
            </h1>
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-[14px] mb-[20px] lg:mb-[30px]">
            Записи не видаляються фізично: обраним проставляється{' '}
            <code className="px-1 rounded bg-gray-100 dark:bg-[#374151]">approved = false</code>.
          </p>

          {/* Критерії */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[15px] mb-[25px]">
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
              </span>
              {' '}— ці групи приховані зі списку
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
                    <p className="text-gray-600 dark:text-gray-400 text-[14px]">
                      {currentGroup.label} · записів: {currentGroup.records_count}
                    </p>
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
                    const isEarliest = r.id === earliestId;
                    const isSelected = selected.has(r.id);
                    return (
                      <section
                        key={r.id}
                        className={`p-[15px] rounded-lg border ${
                          isSelected
                            ? 'border-red-500 bg-red-50 dark:bg-[#3B1D1D]'
                            : isEarliest
                              ? 'border-[#14AE5C] bg-green-50 dark:bg-[#14301F]'
                              : 'border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-[15px] flex-wrap">
                          <label className="flex items-start gap-[10px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(r.id)}
                              className="mt-[4px] w-[18px] h-[18px] accent-red-600"
                            />
                            <span>
                              <span className="flex items-center gap-[8px] flex-wrap">
                                <span className="text-gray-900 dark:text-[#F3F4F6] text-[16px] font-semibold">
                                  {r.current_settlement_type} {r.current_settlement_name}
                                </span>
                                {isEarliest && (
                                  <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded bg-[#14AE5C] text-white text-[12px]">
                                    <Crown className="w-3 h-3" strokeWidth={2} />
                                    найраніший
                                  </span>
                                )}
                              </span>
                              <span className="block text-gray-600 dark:text-gray-400 text-[13px] mt-[2px]">
                                Додано {formatDate(r.created_at)} · {r.email || 'без email'}
                              </span>
                            </span>
                          </label>

                          <a
                            href={`/record/${r.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-[6px] text-[#2563EB] hover:underline text-[14px]"
                          >
                            Відкрити запис
                            <ExternalLink className="w-4 h-4" strokeWidth={2} />
                          </a>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-[20px] gap-y-[4px] mt-[12px] text-[14px]">
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Розташування: </span>
                            {r.current_region}, {r.current_district}, {r.current_community}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Стара назва: </span>
                            {r.old_settlement_type} {r.old_settlement_name}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Рік інвентаря: </span>
                            {r.inventory_year ?? '—'}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Шифр: </span>
                            {r.case_signature || '—'}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Архів: </span>
                            {[r.archive, r.fonds, r.series, r.record].filter(Boolean).join('-') || '—'}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300">
                            <span className="opacity-70">Сторінок: </span>
                            {r.pages_count || '—'}
                            {r.inventory_start_page ? ` (з ${r.inventory_start_page})` : ''}
                          </p>
                        </div>

                        {r.case_title && (
                          <p className="text-gray-700 dark:text-gray-300 text-[14px] mt-[8px]">
                            <span className="opacity-70">Назва справи: </span>
                            {r.case_title}
                          </p>
                        )}
                        {r.notes && (
                          <p className="text-gray-700 dark:text-gray-300 text-[14px] mt-[4px]">
                            <span className="opacity-70">Примітки: </span>
                            {r.notes}
                          </p>
                        )}

                        {/* Що втратимо, якщо позначити цей запис дублем */}
                        <div className="flex flex-wrap items-center gap-[10px] mt-[10px]">
                          {r.scans_url && (
                            <a
                              href={r.scans_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded bg-blue-100 dark:bg-[#1E3A5F] text-[#2563EB] dark:text-blue-300 text-[12px]"
                            >
                              <ImageIcon className="w-3 h-3" strokeWidth={2} />
                              є скани
                            </a>
                          )}
                          {r.cobook_link && (
                            <span className="inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded bg-purple-100 dark:bg-[#3B2A5F] text-purple-700 dark:text-purple-300 text-[12px]">
                              <BookOpen className="w-3 h-3" strokeWidth={2} />
                              є кобук
                            </span>
                          )}
                          {r.cobook_transcript && (
                            <span className="inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded bg-amber-100 dark:bg-[#4A3413] text-amber-800 dark:text-amber-300 text-[12px]">
                              <FileText className="w-3 h-3" strokeWidth={2} />
                              є транскрипт
                            </span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Дії */}
              <div className="flex flex-wrap items-center gap-[12px] mt-[20px]">
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
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
