import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Header from '../components/header';
import ClientOnly from '../components/clientonly';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';
import { isAdminUser } from '../lib/adminUsers';
import {
  CASE_DETAIL_FIELDS,
  findSettlementYearMatches,
  findSignatureDetailDiffs,
  findSimilarSignatureMatches,
} from '../lib/duplicateCheck';
import { formatSignatureList } from '../lib/caseSignature';
import { ExternalLink } from 'lucide-react';

const CaseMapComponent = dynamic(() => import('../components/CaseMapComponent'), { ssr: false });

const num = (v: any) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const isUrl = (v: string) => /^https?:\/\//i.test(v);

// Значення поля справи для показу в таблиці діфу. URL-значення (напр. посилання
// на скани) робимо клікабельними.
const renderDetail = (field: string, value: any) => {
  if (field === 'additional_case_signature') return formatSignatureList(value) || '—';
  const s = value === null || value === undefined ? '' : String(value).trim();
  if (s === '') return '—';
  if (isUrl(s)) {
    return (
      <a href={s} target="_blank" rel="noreferrer" className="text-[#2563EB] hover:underline break-all">
        {s}
      </a>
    );
  }
  return s;
};

const settlementLabel = (r: any) =>
  [
    r.current_region ? `${r.current_region} обл.` : null,
    r.current_district ? `${r.current_district} р-н` : null,
    r.current_community ? `${r.current_community} гром.` : null,
    [r.current_settlement_type, r.current_settlement_name].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

export default function AdminComparePage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const mode = (router.query.mode as string) || 'settlement';
  const storageKey = router.query.key as string | undefined;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [candidate, setCandidate] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [settlementMatches, setSettlementMatches] = useState<any[]>([]);
  const [signatureDiffs, setSignatureDiffs] = useState<{ record: any; diffs: string[] }[]>([]);
  const [similarMatches, setSimilarMatches] = useState<any[]>([]);

  // Роль адміністратора
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    isAdminUser(supabase, user.id).then(setIsAdmin);
  }, [user, userLoading]);

  // Кандидат із localStorage (його поклала сторінка підтвердження)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCandidate(JSON.parse(raw));
    } catch (e) {
      console.error('Не вдалося прочитати кандидата:', e);
    }
  }, [storageKey]);

  // Завантаження збігів
  useEffect(() => {
    if (isAdmin !== true || !candidate) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (mode === 'signature') {
          const diffs = await findSignatureDetailDiffs(candidate);
          if (!cancelled) setSignatureDiffs(diffs);
        } else if (mode === 'similar') {
          const matches = await findSimilarSignatureMatches(candidate);
          if (!cancelled) setSimilarMatches(matches);
        } else {
          const matches = await findSettlementYearMatches(candidate);
          if (!cancelled) setSettlementMatches(matches);
        }
      } catch (e) {
        console.error('Помилка завантаження збігів:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, candidate, mode]);

  const candidateForMap = useMemo(() => {
    if (!candidate) return [];
    const lat = num(candidate.latitude);
    const lon = num(candidate.longitude);
    if (lat === null || lon === null) return [];
    return [{ ...candidate, id: candidate.id || 'candidate', latitude: lat, longitude: lon }];
  }, [candidate]);

  if (userLoading || isAdmin === null) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">⛔ У вас немає доступу до цієї сторінки</p>
        </div>
      </>
    );
  }

  if (!candidate) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">
            Немає даних для порівняння. Відкрийте цю сторінку кнопкою «Переглянути» зі сторінки підтвердження.
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
          {mode === 'signature' ? (
            <>
              <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[22px] md:text-[26px] lg:text-[30px] font-bold mb-[6px]">
                Порівняння за шифром справи
              </h1>
              <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[16px] mb-[20px]">
                Шифр <span className="font-mono">{candidate.case_signature || '—'}</span> уже є в реєстрі, але
                деякі характеристики справи відрізняються від того, що додається.
              </p>

              {loading ? (
                <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
              ) : signatureDiffs.length === 0 ? (
                <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                  <p className="text-gray-900 dark:text-white text-[16px]">Розбіжностей не знайдено.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-[#374151]">
                  <table className="min-w-full text-[13px] lg:text-[14px]">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-[#111827]">
                        <th className="text-left p-[10px] border-b border-gray-300 dark:border-[#374151] text-gray-900 dark:text-white font-semibold whitespace-nowrap">
                          Поле
                        </th>
                        <th className="text-left p-[10px] border-b border-gray-300 dark:border-[#374151] text-[#14AE5C] font-semibold whitespace-nowrap">
                          Додається
                        </th>
                        {signatureDiffs.map(({ record }, i) => (
                          <th
                            key={record.id}
                            className="text-left p-[10px] border-b border-l border-gray-300 dark:border-[#374151] text-gray-900 dark:text-white font-semibold whitespace-nowrap"
                          >
                            <a
                              href={`/record/${record.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-[4px] text-[#2563EB] hover:underline"
                            >
                              У реєстрі #{i + 1}
                              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                            </a>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CASE_DETAIL_FIELDS.map((f) => {
                        return (
                          <tr key={f.key} className="border-b border-gray-200 dark:border-[#374151] last:border-b-0">
                            <td className="p-[10px] text-gray-700 dark:text-gray-300 font-medium align-top whitespace-nowrap">
                              {f.label}
                            </td>
                            <td className="p-[10px] text-gray-900 dark:text-white align-top">
                              {renderDetail(f.key, candidate[f.key])}
                            </td>
                            {signatureDiffs.map(({ record, diffs }) => {
                              const differs = diffs.includes(f.key);
                              return (
                                <td
                                  key={record.id}
                                  className={`p-[10px] align-top border-l border-gray-200 dark:border-[#374151] ${
                                    differs
                                      ? 'bg-amber-100 dark:bg-[#4A3413] text-amber-900 dark:text-amber-200 font-medium'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {renderDetail(f.key, record[f.key])}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : mode === 'similar' ? (
            <>
              <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[22px] md:text-[26px] lg:text-[30px] font-bold mb-[6px]">
                Схожі шифри справи
              </h1>
              <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[16px] mb-[20px]">
                Шифр <span className="font-mono">{candidate.case_signature || '—'}</span> має ті самі
                цифри, що й наявні записи цього населеного пункту, але з іншими літерами — імовірно, це
                та сама справа.
              </p>

              {loading ? (
                <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
              ) : similarMatches.length === 0 ? (
                <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                  <p className="text-gray-900 dark:text-white text-[16px]">Схожих шифрів не знайдено.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-[#374151]">
                  <table className="min-w-full text-[13px] lg:text-[14px]">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-[#111827]">
                        <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Шифр справи</th>
                        <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Назва справи</th>
                        <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Рік</th>
                        <th className="p-[10px]" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-gray-200 dark:border-[#374151] bg-green-50 dark:bg-[#14301F]">
                        <td className="p-[10px] text-[#14AE5C] font-mono font-medium">{candidate.case_signature || '—'}</td>
                        <td className="p-[10px] text-gray-900 dark:text-white">{candidate.case_title || '—'}</td>
                        <td className="p-[10px] text-gray-900 dark:text-white">{candidate.inventory_year || '—'}</td>
                        <td className="p-[10px] text-[#14AE5C] font-medium whitespace-nowrap">додається</td>
                      </tr>
                      {similarMatches.map((r) => (
                        <tr key={r.id} className="border-t border-gray-200 dark:border-[#374151]">
                          <td className="p-[10px] font-mono"><a href={`/record/${r.id}`} target="_blank" rel="noreferrer" className="text-[#2563EB] hover:underline">{r.case_signature || '—'}</a></td>
                          <td className="p-[10px] text-gray-900 dark:text-white">{r.case_title || '—'}</td>
                          <td className="p-[10px] text-gray-900 dark:text-white">{r.inventory_year || '—'}</td>
                          <td className="p-[10px] whitespace-nowrap">
                            <a
                              href={`/record/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-[4px] text-[#2563EB] hover:underline"
                            >
                              Відкрити
                              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[22px] md:text-[26px] lg:text-[30px] font-bold mb-[6px]">
                Порівняння за населеним пунктом і роком
              </h1>
              <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[16px] mb-[16px]">
                {settlementLabel(candidate) || '—'} · рік {candidate.inventory_year || '—'}. Зелений маркер —
                запис, що додається; сині/червоні — наявні в реєстрі.
              </p>

              <div
                className="rounded-lg border border-gray-300 dark:border-[#374151] overflow-hidden mb-[20px]"
                style={{ height: '460px' }}
              >
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-[#1F2937]">
                    <span className="text-gray-900 dark:text-white text-[15px]">Завантаження карти...</span>
                  </div>
                ) : (
                  <ClientOnly>
                    <CaseMapComponent records={settlementMatches} candidateRecords={candidateForMap} />
                  </ClientOnly>
                )}
              </div>

              {!loading && (
                <>
                  <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] mb-[12px]">
                    Наявних у реєстрі за цей рік і населений пункт: {settlementMatches.length}
                  </p>
                  {settlementMatches.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-[#374151]">
                      <table className="min-w-full text-[13px] lg:text-[14px]">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-[#111827]">
                            <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Шифр справи</th>
                            <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Назва справи</th>
                            <th className="text-left p-[10px] text-gray-900 dark:text-white font-semibold">Рік</th>
                            <th className="p-[10px]" />
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-gray-200 dark:border-[#374151] bg-green-50 dark:bg-[#14301F]">
                            <td className="p-[10px] text-[#14AE5C] font-mono font-medium">{candidate.case_signature || '—'}</td>
                            <td className="p-[10px] text-gray-900 dark:text-white">{candidate.case_title || '—'}</td>
                            <td className="p-[10px] text-gray-900 dark:text-white">{candidate.inventory_year || '—'}</td>
                            <td className="p-[10px] text-[#14AE5C] font-medium whitespace-nowrap">додається</td>
                          </tr>
                          {settlementMatches.map((r) => (
                            <tr key={r.id} className="border-t border-gray-200 dark:border-[#374151]">
                              <td className="p-[10px] font-mono"><a href={`/record/${r.id}`} target="_blank" rel="noreferrer" className="text-[#2563EB] hover:underline">{r.case_signature || '—'}</a></td>
                              <td className="p-[10px] text-gray-900 dark:text-white">{r.case_title || '—'}</td>
                              <td className="p-[10px] text-gray-900 dark:text-white">{r.inventory_year || '—'}</td>
                              <td className="p-[10px] whitespace-nowrap">
                                <a
                                  href={`/record/${r.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-[4px] text-[#2563EB] hover:underline"
                                >
                                  Відкрити
                                  <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
