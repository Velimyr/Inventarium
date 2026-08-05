import Link from 'next/link';

// Заголовок розділу адмінки з перемиканням між режимами обробки.
// Розділи «Підтвердження нових» і «Редагування» мають по два режими —
// поштучний і масовий, — і це той самий набір даних, а не різні сторінки.

export type AdminTab = {
  href: string;
  label: string;
  /** К-ть записів у черзі. null — ще вантажиться, показуємо крапку-плейсхолдер. */
  count?: number | null;
};

type Props = {
  title: string;
  tabs: AdminTab[];
  activeHref: string;
  description?: string;
};

export default function AdminSectionTabs({ title, tabs, activeHref, description }: Props) {
  return (
    <div className="mb-[20px] lg:mb-[30px]">
      <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
        {title}
      </h1>

      {description && (
        <p className="text-gray-600 dark:text-gray-300 text-[14px] mt-[8px] max-w-[80ch]">{description}</p>
      )}

      <nav className="flex flex-wrap items-center gap-[8px] mt-[15px]" aria-label={title}>
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'inline-flex items-center gap-[8px] h-[38px] px-[16px] rounded-full text-[14px] transition-colors',
                active
                  ? 'bg-gray-900 dark:bg-[#F3F4F6] text-white dark:text-[#111827] font-semibold'
                  : 'border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-[#374151]',
              ].join(' ')}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={[
                    'text-[12px] font-semibold tabular-nums rounded-full px-[8px] py-[1px]',
                    active
                      ? 'bg-white/20 dark:bg-[#111827]/15'
                      : 'bg-gray-200 dark:bg-[#111827] text-gray-700 dark:text-gray-300',
                  ].join(' ')}
                >
                  {tab.count ?? '—'}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// Готові набори вкладок — щоб маршрути й підписи жили в одному місці.
export const EDIT_TABS: AdminTab[] = [
  { href: '/admin_editapprove', label: 'Поштучно' },
  { href: '/admin_editapprove_mass', label: 'Масово' },
];

export const APPROVE_TABS: AdminTab[] = [
  { href: '/admin_approve', label: 'Поштучно' },
  { href: '/admin_approve_mass', label: 'Масово' },
];

export const EDIT_SECTION_TITLE = 'Редагування інвентарів';
export const APPROVE_SECTION_TITLE = 'Підтвердження нових інвентарів';

/** Той самий набір вкладок, але з лічильником у активній. */
export const withCount = (tabs: AdminTab[], href: string, count: number | null): AdminTab[] =>
  tabs.map((tab) => (tab.href === href ? { ...tab, count } : tab));
