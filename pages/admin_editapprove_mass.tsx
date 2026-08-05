import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import Toast from '../components/Toast';
import AdminSectionTabs, { EDIT_SECTION_TITLE, EDIT_TABS, withCount } from '../components/AdminSectionTabs';
import { useUser } from '../contexts/UserContext';
import { sendNotification } from '../components/notifications';
import { isAdminUser } from '../lib/adminUsers';
import { AlertTriangle, Check, ExternalLink, KeyRound, MapPin, X } from 'lucide-react';
import {
  approveEdits,
  computeChanges,
  displayValue,
  extraChanges,
  groupEdits,
  rejectEdits,
  settlementName,
  settlementPath,
  type EditGroup,
  type EditGroupTone,
  type EditItem,
} from '../lib/editApprove';

const TONE = {
  ready: {
    label: 'Однакова правка в усіх записах',
    short: 'Однакова правка',
    stripe: 'border-l-[#14AE5C]',
    dot: 'bg-[#14AE5C]',
    pill: 'bg-[#DCFCE7] dark:bg-[#14AE5C]/20 text-[#0F7038] dark:text-[#86EFAC]',
  },
  // manual — у частини записів є власні правки понад спільні; підтверджувати
  // пачкою можна, але хвости варто переглянути або зняти галочку

  warn: {
    label: 'Нічого не змінюють',
    short: 'Нічого не змінює',
    stripe: 'border-l-[#D97706]',
    dot: 'bg-[#D97706]',
    pill: 'bg-[#FEF3C7] dark:bg-[#D97706]/20 text-[#92400E] dark:text-[#FCD34D]',
  },
  manual: {
    label: 'Є власні правки понад спільні',
    short: 'Є власні правки',
    stripe: 'border-l-[#2563EB]',
    dot: 'bg-[#2563EB]',
    pill: 'bg-[#DBEAFE] dark:bg-[#1D4ED8]/30 text-[#1D4ED8] dark:text-[#BFDBFE]',
  },
} as const;

const COLLAPSED_ROWS = 6;

// Запис без спільної частини міняє два десятки полів, і вивалювати їх усі
// в комірку — та сама стіна теґів, від якої ця сторінка мала рятувати.
const MAX_TAGS = 4;

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const dateUA = (iso: string) => (iso || '').slice(0, 10).split('-').reverse().join('.');

export default function MassEditApprovePage() {
  const { user, loading: userLoading } = useUser();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EditItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | EditGroupTone>('all');
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    isAdminUser(supabase, user.id).then((hasAdminAccess) => {
      setIsAdmin(hasAdminAccess);
      if (!hasAdminAccess) setLoading(false);
    });
  }, [user, userLoading]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      setLoading(true);

      const { data: edits, error: editError } = await supabase.from('records_edit').select('*');
      if (editError) {
        setToast({ message: '❌ Помилка завантаження змін', type: 'error' });
        setLoading(false);
        return;
      }

      const pending = (edits || []).filter((row: any) =>
        Object.entries(row).some(
          ([key, value]) => key !== 'id' && key !== 'email' && value !== null && value !== undefined
        )
      );

      if (pending.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: originals, error: originalError } = await supabase
        .from('records')
        .select('*')
        .in('id', pending.map((row: any) => row.id));

      if (originalError) {
        setToast({ message: '❌ Помилка завантаження оригіналів', type: 'error' });
        setLoading(false);
        return;
      }

      const originalById = new Map<string, any>((originals || []).map((row: any) => [row.id, row]));
      const nextItems: EditItem[] = pending.map((edit: any) => {
        const original = originalById.get(edit.id) || {};
        return { id: edit.id, edit, original, changes: computeChanges(edit, original) };
      });

      setItems(nextItems);
      setSelected(new Set(nextItems.map((item) => item.id)));
      setLoading(false);
    };

    fetchData();
  }, [isAdmin]);

  const groups = useMemo(() => groupEdits(items), [items]);

  const visibleGroups = useMemo(
    () => (filter === 'all' ? groups : groups.filter((group) => group.tone === filter)),
    [groups, filter]
  );

  // Відфільтрували все до нуля — повертаємось до повного списку, а не в порожній екран
  useEffect(() => {
    if (filter !== 'all' && !groups.some((group) => group.tone === filter)) setFilter('all');
  }, [groups, filter]);

  const selectedIn = (group: EditGroup) => group.items.filter((item) => selected.has(item.id));

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setGroupSelection = (group: EditGroup, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const notify = user
    ? (params: { toUserId: string; messageType: any; messageText: string }) =>
        sendNotification({ fromUserId: user.id, ...params })
    : undefined;

  const dropItems = (ids: string[]) => {
    const removed = new Set(ids);
    setItems((prev) => prev.filter((item) => !removed.has(item.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const reportResult = (result: { applied: string[]; failed: { place: string; message: string }[] }, verb: string) => {
    dropItems(result.applied);

    if (result.failed.length === 0) {
      setToast({ message: `✅ ${verb}: ${result.applied.length}`, type: 'success' });
      return;
    }

    const first = result.failed[0];
    setToast({
      message:
        result.applied.length > 0
          ? `⚠️ ${verb}: ${result.applied.length}. Не вдалося: ${result.failed.length} — ${first.place}: ${first.message}`
          : `❌ Не вдалося: ${first.place} — ${first.message}`,
      type: result.applied.length > 0 ? 'success' : 'error',
    });
  };

  const handleApprove = async (group: EditGroup) => {
    const chosen = selectedIn(group);
    if (chosen.length === 0 || processing) return;

    if (chosen.length > 1 && !window.confirm(`Підтвердити редагувань: ${chosen.length}?`)) return;

    setProcessing(true);
    const result = await approveEdits(supabase, chosen, { notify });
    setProcessing(false);
    reportResult(result, 'Підтверджено');
  };

  const handleReject = async (group: EditGroup) => {
    const chosen = selectedIn(group);
    if (chosen.length === 0 || processing) return;

    if (!window.confirm(`Відхилити редагувань: ${chosen.length}? Вони будуть видалені з черги.`)) return;
    const reason = window.prompt('Вкажіть причину відхилення (необов\'язково):') || '';

    setProcessing(true);
    const result = await rejectEdits(supabase, chosen, { notify, reason });
    setProcessing(false);
    reportResult(result, 'Відхилено');
  };

  const screen = (message: string) => (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-4">
        <p className="text-gray-900 dark:text-white text-[16px] text-center">{message}</p>
      </div>
    </>
  );

  if (userLoading || loading) return screen('Завантаження...');
  if (!user) return screen('⛔ Ви не авторизовані');
  if (!isAdmin) return screen('⛔ У вас немає доступу до цієї сторінки');

  const oldest = items.map((item) => item.edit.created_at).filter(Boolean).sort()[0];
  const authors = new Set(items.map((item) => item.edit.email).filter(Boolean)).size;

  const filters: { key: 'all' | EditGroupTone; label: string; count: number }[] = [
    { key: 'all', label: 'Усі редагування', count: groups.length },
    { key: 'ready', label: TONE.ready.label, count: groups.filter((g) => g.tone === 'ready').length },
    { key: 'warn', label: TONE.warn.label, count: groups.filter((g) => g.tone === 'warn').length },
    { key: 'manual', label: TONE.manual.label, count: groups.filter((g) => g.tone === 'manual').length },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          <AdminSectionTabs
            title={EDIT_SECTION_TITLE}
            tabs={withCount(EDIT_TABS, '/admin_editapprove_mass', items.length)}
            activeHref="/admin_editapprove_mass"
            description="Редагування згруповані за спільною частиною — шифром справи або населеним пунктом. Спільне показане один раз угорі групи, варіативне — списком нижче."
          />

          {items.length === 0 ? (
            <p className="text-gray-700 dark:text-gray-300 text-[16px]">Немає змін для перевірки</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-[10px] p-[12px] lg:p-[14px] mb-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                {filters.map((item) => {
                  const active = filter === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={item.count === 0}
                      onClick={() => setFilter(item.key)}
                      aria-pressed={active}
                      className={[
                        'inline-flex items-center gap-[7px] h-[32px] px-[14px] rounded-full text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        active
                          ? 'bg-gray-900 dark:bg-[#F3F4F6] text-white dark:text-[#111827] font-semibold'
                          : 'border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 font-medium',
                      ].join(' ')}
                    >
                      {item.key !== 'all' && (
                        <i className={`w-[8px] h-[8px] rounded-sm ${TONE[item.key as EditGroupTone].dot}`} />
                      )}
                      {item.label}
                    </button>
                  );
                })}

                <span className="ml-auto text-gray-500 dark:text-gray-400 text-[12.5px] tabular-nums">
                  {items.length} {plural(items.length, 'редагування', 'редагування', 'редагувань')} у черзі
                  {oldest ? ` · найдавніше з ${dateUA(oldest)}` : ''} · {plural(authors, 'автор', 'автори', 'авторів')}: {authors}
                </span>
              </div>

              <div className="flex flex-col gap-[20px]">
                {visibleGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    selected={selected}
                    expanded={!!expanded[group.id]}
                    processing={processing}
                    onToggleItem={toggleItem}
                    onToggleExpand={() =>
                      setExpanded((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                    }
                    onSelectAll={(checked) => setGroupSelection(group, checked)}
                    onApprove={() => handleApprove(group)}
                    onReject={() => handleReject(group)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} duration={5000} />}
    </>
  );
}

type GroupCardProps = {
  group: EditGroup;
  selected: Set<string>;
  expanded: boolean;
  processing: boolean;
  onToggleItem: (id: string) => void;
  onToggleExpand: () => void;
  onSelectAll: (checked: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
};

function GroupCard({
  group,
  selected,
  expanded,
  processing,
  onToggleItem,
  onToggleExpand,
  onSelectAll,
  onApprove,
  onReject,
}: GroupCardProps) {
  const tone = TONE[group.tone];
  const total = group.items.length;
  const chosen = group.items.filter((item) => selected.has(item.id)).length;
  const rows = expanded ? group.items : group.items.slice(0, COLLAPSED_ROWS);
  const byPlace = group.variantBy === 'place';

  // У групі з повним збігом правок колонка змін друкувала б те саме слово в
  // кожному рядку — спільний блок уже все сказав. Показуємо її лише коли є
  // що показати: власні хвости або взагалі відсутній спільний блок.
  const showChangesColumn = group.hasExtras || group.shared.length === 0;

  const authors = Array.from(new Set(group.items.map((item) => item.edit.email).filter(Boolean)));
  const dates = Array.from(
    new Set(group.items.map((item) => dateUA(item.edit.created_at)).filter(Boolean))
  ).sort();
  const comments = Array.from(new Set(group.items.map((item) => item.edit.comment).filter(Boolean)));

  return (
    <article
      className={`rounded-lg border border-gray-300 dark:border-[#374151] border-l-[3px] ${tone.stripe} bg-white dark:bg-[#111827] overflow-hidden`}
    >
      <div className="flex flex-wrap items-start gap-[14px] p-[16px] lg:p-[20px]">
        <div className="flex-1 min-w-[280px]">
          <p className="flex items-center gap-[6px] text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-[0.08em]">
            {group.basis === 'settlement' ? (
              <MapPin className="w-[13px] h-[13px]" strokeWidth={2} />
            ) : (
              <KeyRound className="w-[13px] h-[13px]" strokeWidth={2} />
            )}
            {group.basis === 'signature' && 'Спільне: шифр справи'}
            {group.basis === 'settlement' && 'Спільне: населений пункт'}
            {group.basis === 'change' && 'Спільне: сама правка'}
            {group.basis === 'none' && 'Без спільної частини'}
          </p>

          <p
            className={`text-gray-900 dark:text-white text-[17px] lg:text-[18px] font-semibold mt-[6px] break-words ${
              group.basis === 'signature' ? 'font-mono' : ''
            }`}
          >
            {group.keyText}
          </p>

          {group.keySub && (
            <p className="text-gray-600 dark:text-gray-300 text-[13px] mt-[5px]">{group.keySub}</p>
          )}

          <p className="flex flex-wrap gap-x-[14px] gap-y-[4px] text-gray-500 dark:text-gray-400 text-[12.5px] mt-[9px]">
            <span>
              Автор: <b className="text-gray-700 dark:text-gray-300 font-semibold">{authors.join(', ')}</b>
            </span>
            <span>
              Надіслано:{' '}
              <b className="text-gray-700 dark:text-gray-300 font-semibold">
                {dates.length > 1 ? `${dates[0]} — ${dates[dates.length - 1]}` : dates[0] || '—'}
              </b>
            </span>
            {comments.length > 0 && (
              <span>
                Коментар:{' '}
                <b className="text-gray-700 dark:text-gray-300 font-semibold">«{comments.join('», «')}»</b>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-[8px]">
          <span className="inline-flex items-center rounded-full px-[10px] py-[4px] bg-gray-100 dark:bg-[#1F2937] text-gray-700 dark:text-gray-300 text-[12px] font-semibold tabular-nums">
            {total} {plural(total, 'запис', 'записи', 'записів')}
          </span>
          <span className={`inline-flex items-center rounded-full px-[10px] py-[4px] text-[12px] font-semibold ${tone.pill}`}>
            {tone.short}
          </span>
        </div>
      </div>

      {group.shared.length > 0 && (
        <div className="mx-[16px] lg:mx-[20px] mb-[16px] p-[14px] lg:p-[16px] rounded-lg border border-gray-200 dark:border-[#293241] bg-gray-50 dark:bg-[#1F2937]">
          <p className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-[0.08em] mb-[10px]">
            {group.shared.length === 1 ? 'Спільна правка' : `Спільні правки (${group.shared.length})`} — однакові в усіх{' '}
            {total} {plural(total, 'записі', 'записах', 'записах')} групи
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-[minmax(140px,190px)_1fr] gap-x-[16px] gap-y-[8px] items-baseline">
            {group.shared.map((change) => (
              <div key={change.field} className="contents">
                <dt className="text-gray-600 dark:text-gray-300 text-[13px]">{change.label}</dt>
                <dd className="flex flex-wrap items-center gap-[8px] m-0">
                  <span className="font-mono text-[12.5px] px-[7px] py-[2px] rounded bg-[#FEE2E2] dark:bg-[#DC2626]/20 text-[#B91C1C] dark:text-[#FCA5A5] line-through break-all">
                    {displayValue(change.field, change.oldValue)}
                  </span>
                  <span className="text-gray-400 text-[12px]">→</span>
                  <span className="font-mono text-[12.5px] px-[7px] py-[2px] rounded bg-[#DCFCE7] dark:bg-[#14AE5C]/20 text-[#0F7038] dark:text-[#86EFAC] font-semibold break-all">
                    {displayValue(change.field, change.newValue)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {group.tone === 'warn' && (
        <p className="flex items-start gap-[9px] mx-[16px] lg:mx-[20px] mb-[16px] p-[10px] lg:p-[12px] rounded-lg bg-[#FEF3C7] dark:bg-[#D97706]/20 text-[#92400E] dark:text-[#FCD34D] text-[13px]">
          <AlertTriangle className="w-4 h-4 flex-none mt-[1px]" strokeWidth={2} />
          <span>
            Жодне поле не відрізняється від чинного запису. Найімовірніше, автор хотів залишити примітку —
            її текст є лише в коментарі. Підтвердження нічого не змінить: перенесіть коментар у «Примітки»
            на сторінці поштучного розгляду або відхиліть пакетом.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[10px] px-[16px] lg:px-[20px] py-[10px] border-y border-gray-200 dark:border-[#293241] bg-gray-50 dark:bg-[#1F2937]">
        <span className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-[0.08em]">
          Варіативна частина · {byPlace ? 'населений пункт' : 'шифр справи'}
        </span>
        <button type="button" onClick={() => onSelectAll(true)} className="text-[#2563EB] dark:text-[#60A5FA] text-[13px] font-semibold">
          Обрати всі
        </button>
        <button type="button" onClick={() => onSelectAll(false)} className="text-[#2563EB] dark:text-[#60A5FA] text-[13px] font-semibold">
          Зняти
        </button>
        {total > COLLAPSED_ROWS && (
          <button type="button" onClick={onToggleExpand} className="text-[#2563EB] dark:text-[#60A5FA] text-[13px] font-semibold">
            {expanded ? 'Згорнути' : `Показати всі ${total}`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="w-[38px] p-[9px_12px] border-b border-gray-200 dark:border-[#293241]" />
              <th className="text-left text-gray-500 dark:text-gray-400 text-[11px] font-semibold uppercase tracking-[0.06em] p-[9px_12px] border-b border-gray-200 dark:border-[#293241] whitespace-nowrap">
                {byPlace ? 'Населений пункт' : 'Шифр справи'}
              </th>
              <th className="text-left text-gray-500 dark:text-gray-400 text-[11px] font-semibold uppercase tracking-[0.06em] p-[9px_12px] border-b border-gray-200 dark:border-[#293241] whitespace-nowrap">
                {byPlace ? 'Район · громада' : 'Населений пункт'}
              </th>
              {showChangesColumn && (
                <th className="text-left text-gray-500 dark:text-gray-400 text-[11px] font-semibold uppercase tracking-[0.06em] p-[9px_12px] border-b border-gray-200 dark:border-[#293241] whitespace-nowrap">
                  {group.shared.length > 0 ? 'Додатково до спільних правок' : 'Що змінює автор'}
                </th>
              )}
              <th className="p-[9px_12px] border-b border-gray-200 dark:border-[#293241]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const checked = selected.has(item.id);
              const extras = extraChanges(group, item);
              const place = settlementName(item.original) || '—';

              return (
                <tr
                  key={item.id}
                  className={`border-b border-gray-200 dark:border-[#293241] last:border-b-0 ${checked ? '' : 'opacity-40'}`}
                >
                  <td className="p-[9px_12px] align-top">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleItem(item.id)}
                      aria-label={`Обрати ${place}`}
                      className="w-4 h-4 accent-[#14AE5C] cursor-pointer mt-[2px]"
                    />
                  </td>
                  <td className="p-[9px_12px] align-top text-gray-900 dark:text-white">
                    {byPlace ? (
                      <span className="font-semibold">
                        {item.original?.current_settlement_name || '—'}{' '}
                        <span className="font-normal text-gray-500 dark:text-gray-400">
                          {item.original?.current_settlement_type || ''}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono">{item.original?.case_signature || '—'}</span>
                    )}
                  </td>
                  <td className="p-[9px_12px] align-top text-gray-500 dark:text-gray-400">
                    {byPlace
                      ? [item.original?.current_district, item.original?.current_community].filter(Boolean).join(' · ') || '—'
                      : `${place} · ${item.original?.case_date || '—'}`}
                  </td>
                  {showChangesColumn && (
                    <td className="p-[9px_12px] align-top">
                      {item.changes.length === 0 ? (
                        <span className="text-gray-500 dark:text-gray-400">без змін</span>
                      ) : extras.length === 0 ? (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-[4px]">
                          {extras.slice(0, MAX_TAGS).map((change) => (
                            <span
                              key={change.field}
                              title={`${displayValue(change.field, change.oldValue)} → ${displayValue(change.field, change.newValue)}`}
                              className="text-[11.5px] rounded px-[7px] py-[2px] bg-gray-100 dark:bg-[#1F2937] text-gray-700 dark:text-gray-300 whitespace-nowrap"
                            >
                              {group.shared.length > 0 ? `+ ${change.label}` : change.label}
                            </span>
                          ))}
                          {extras.length > MAX_TAGS && (
                            <span
                              title={extras.slice(MAX_TAGS).map((change) => change.label).join(', ')}
                              className="text-[11.5px] rounded px-[7px] py-[2px] text-gray-500 dark:text-gray-400 whitespace-nowrap"
                            >
                              та ще {extras.length - MAX_TAGS}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="p-[9px_12px] align-top">
                    <Link
                      href={`/record/${item.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-[4px] text-[#2563EB] dark:text-[#60A5FA] text-[12.5px] font-semibold whitespace-nowrap"
                    >
                      Відкрити
                      <ExternalLink className="w-[13px] h-[13px]" strokeWidth={2} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-[10px] px-[16px] lg:px-[20px] py-[13px] bg-gray-50 dark:bg-[#1F2937]">
        <span className="text-gray-600 dark:text-gray-300 text-[13px] tabular-nums">
          Обрано {chosen} з {total}
        </span>

        <Link
          href="/admin_editapprove"
          className="ml-auto inline-flex items-center justify-center h-[38px] px-[15px] rounded border border-gray-300 dark:border-[#374151] text-gray-700 dark:text-gray-300 text-[14px] font-semibold"
        >
          Розглянути поштучно
        </Link>

        <button
          type="button"
          onClick={onReject}
          disabled={processing || chosen === 0}
          className="inline-flex items-center gap-[7px] h-[38px] px-[15px] rounded border border-gray-300 dark:border-[#374151] text-[#B91C1C] dark:text-[#FCA5A5] text-[14px] font-semibold disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <X className="w-[15px] h-[15px]" strokeWidth={2.2} />
          Відхилити обрані
        </button>

        <button
          type="button"
          onClick={onApprove}
          disabled={processing || chosen === 0 || group.tone === 'warn'}
          title={group.tone === 'warn' ? 'У цих редагуваннях немає змін для перенесення' : undefined}
          className="inline-flex items-center gap-[7px] h-[38px] px-[15px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] text-white text-[14px] font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Check className="w-[15px] h-[15px]" strokeWidth={2.4} />
          {processing ? 'Обробка...' : `Підтвердити обрані (${chosen})`}
        </button>
      </div>
    </article>
  );
}
