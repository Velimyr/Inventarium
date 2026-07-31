import { useEffect, useState } from 'react';
import { MapPin, FileWarning, ExternalLink, AlertTriangle } from 'lucide-react';
import {
  CASE_DETAIL_FIELDS,
  findSettlementYearMatches,
  findSignatureDetailDiffs,
  findSimilarSignatureMatches,
} from '../lib/duplicateCheck';

/**
 * Попередження на сторінках підтвердження інвентаря (додавання й редагування):
 *   1) у реєстрі вже є записи того самого населеного пункту й року;
 *   2) є записи з тим самим шифром, але з іншими характеристиками справи.
 * Кнопки відкривають /admin_compare у новій вкладці (кандидат — через localStorage).
 */
export default function DuplicateWarnings({
  record,
  showCompareButtons = true,
}: {
  record: any;
  // Кнопки «Переглянути» відкривають /admin_compare (лише для адмінів). На
  // користувацьких формах їх ховаємо — лишаються тексти попереджень.
  showCompareButtons?: boolean;
}) {
  const [settlementMatches, setSettlementMatches] = useState<any[]>([]);
  const [signatureDiffs, setSignatureDiffs] = useState<{ record: any; diffs: string[] }[]>([]);
  const [similarMatches, setSimilarMatches] = useState<any[]>([]);

  // Ключ ефекту — лише поля, що впливають на перевірки, щоб не бити в базу
  // на кожну зміну неповʼязаного поля. Плюс debounce на набір тексту.
  const key = JSON.stringify({
    id: record?.id ?? null,
    sig: record?.case_signature ?? null,
    year: record?.inventory_year ?? null,
    region: record?.current_region ?? null,
    district: record?.current_district ?? null,
    community: record?.current_community ?? null,
    stype: record?.current_settlement_type ?? null,
    sname: record?.current_settlement_name ?? null,
    details: CASE_DETAIL_FIELDS.map((f) => record?.[f.key] ?? null),
  });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [s, d, sim] = await Promise.all([
          findSettlementYearMatches(record),
          findSignatureDetailDiffs(record),
          findSimilarSignatureMatches(record),
        ]);
        if (!cancelled) {
          setSettlementMatches(s);
          setSignatureDiffs(d);
          setSimilarMatches(sim);
        }
      } catch (e) {
        console.error('Помилка перевірки збігів:', e);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const openCompare = (mode: 'settlement' | 'signature') => {
    const storageKey = 'admin_compare_candidate';
    localStorage.setItem(storageKey, JSON.stringify(record));
    window.open(`/admin_compare?mode=${mode}&key=${encodeURIComponent(storageKey)}`, '_blank');
  };

  // Унікальні поля, що розходяться, — для тексту банера
  const diffLabels = Array.from(
    new Set(signatureDiffs.flatMap((d) => d.diffs))
  ).map((k) => CASE_DETAIL_FIELDS.find((f) => f.key === k)?.label ?? k);

  if (settlementMatches.length === 0 && signatureDiffs.length === 0 && similarMatches.length === 0)
    return null;

  return (
    <div className="flex flex-col gap-[10px] mb-[20px]">
      {similarMatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-[12px] p-[14px] rounded-lg border border-[#EC221F] bg-red-50 dark:bg-[#3A1514]">
          <AlertTriangle className="w-5 h-5 text-[#EC221F] dark:text-[#F87171] flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 min-w-[240px] text-red-900 dark:text-red-100 text-[14px] lg:text-[15px]">
            У реєстрі є <b>{similarMatches.length}</b> запис(ів) цього населеного пункту з дуже
            схожим шифром (ті самі цифри, інші літери) —{' '}
            {similarMatches.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ', '}
                <a
                  href={`/record/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline hover:no-underline"
                >
                  {r.case_signature}
                </a>
              </span>
            ))}
            . Можливо, це та сама справа.
          </p>
        </div>
      )}

      {settlementMatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-[12px] p-[14px] rounded-lg border border-amber-300 dark:border-[#7A5B12] bg-amber-50 dark:bg-[#3A2E10]">
          <MapPin className="w-5 h-5 text-amber-700 dark:text-amber-300 flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 min-w-[240px] text-amber-900 dark:text-amber-100 text-[14px] lg:text-[15px]">
            У реєстрі вже є <b>{settlementMatches.length}</b> запис(ів) цього населеного пункту за той
            самий рік складання (<b>{record?.inventory_year || '—'}</b>). Можливо, це той самий інвентар.
          </p>
          {showCompareButtons && (
            <button
              type="button"
              onClick={() => openCompare('settlement')}
              className="inline-flex items-center gap-[6px] h-[36px] px-[14px] rounded bg-amber-600 hover:bg-amber-700 text-white text-[13px] lg:text-[14px] font-medium whitespace-nowrap"
            >
              Переглянути на карті
              <ExternalLink className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {signatureDiffs.length > 0 && (
        <div className="flex flex-wrap items-center gap-[12px] p-[14px] rounded-lg border border-[#2563EB] bg-blue-50 dark:bg-[#152B4A]">
          <FileWarning className="w-5 h-5 text-[#2563EB] dark:text-[#8AB4F8] flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 min-w-[240px] text-gray-900 dark:text-[#DCE7FA] text-[14px] lg:text-[15px]">
            У реєстрі є <b>{signatureDiffs.length}</b> запис(ів) з тим самим шифром справи, але
            відрізняються: <b>{diffLabels.join(', ')}</b>.
          </p>
          {showCompareButtons && (
            <button
              type="button"
              onClick={() => openCompare('signature')}
              className="inline-flex items-center gap-[6px] h-[36px] px-[14px] rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] lg:text-[14px] font-medium whitespace-nowrap"
            >
              Переглянути різницю
              <ExternalLink className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
