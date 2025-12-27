import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import { X, Search, ChevronDown, ChevronLeft, ChevronRight, Check, Plus } from 'lucide-react';
import { useRouter } from 'next/router';

const PAGE_SIZE = 20;

export default function Home() {
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<any>({
    search: '',
    inventory_year_from: '',
    inventory_year_to: '',
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // Ініціалізація пошуку з URL параметра
  useEffect(() => {
    if (router.isReady && !isInitialized) {
      const { q } = router.query;
      if (q && typeof q === 'string') {
        setFilters(prev => ({
          ...prev,
          search: q
        }));
      }
      setIsInitialized(true);
    }
  }, [router.isReady, router.query, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    
    const shouldSearch = filters.search && filters.search.trim().length >= 3;
    if (shouldSearch) {
      loadRecords();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setRecords([]);
    }
  }, [page, filters, isInitialized]);

  const loadRecords = async () => {
    if (!filters.search || filters.search.trim() === '') {
      setRecords([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('records')
      .select('*', { count: 'exact' })
      .eq('approved', true);

    const textFields = [
      'old_province',
      'old_district',
      'old_community',
      'current_region',
      'current_district',
      'current_community'
    ];

    textFields.forEach(field => {
      if (filters[field]) {
        query = query.ilike(field, `%${filters[field]}%`);
      }
    });

    if (filters.inventory_year_from) {
      query = query.gte('inventory_year', Number(filters.inventory_year_from));
    }
    if (filters.inventory_year_to) {
      query = query.lte('inventory_year', Number(filters.inventory_year_to));
    }

    query = query.or([
      `old_settlement_name.ilike.%${filters.search}%`,
      `current_settlement_name.ilike.%${filters.search}%`,
      `case_title.ilike.%${filters.search}%`,
      `notes.ilike.%${filters.search}%`,
      `case_signature.ilike.%${filters.search}%`,
    ].join(','));

    query = query.order('inventory_year', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Помилка при завантаженні:', error);
      setRecords([]);
      setTotalCount(0);
    } else {
      setRecords(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updated = { ...filters, [name]: value };
    setFilters(updated);
    setPage(0);
  };

  const clearFilters = () => {
    const cleared = {
      search: '',
      inventory_year_from: '',
      inventory_year_to: '',
    };
    setFilters(cleared);
    setPage(0);
  };

  const hasActiveFilters = filters.inventory_year_from || filters.inventory_year_to;

  return (
    <>
      <Header />
      
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Header Section */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-[10px] lg:mb-[16px]">
            <div>
              <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                Пошук у реєстрі Інвентаріуму
              </h1>
             {/*  <p className="text-gray-700 dark:text-white text-[14px] lg:text-[16px] opacity-80">
                Введіть населений пункт, назву або сигнатуру справи для пошуку потрібного вам інвентарю
              </p> */}
            </div>

            <div className="flex flex-wrap items-center gap-[15px]">
              <button 
                onClick={() => window.location.href = '/add_inventory'}
                className="flex items-center gap-[10px] px-[15px] h-[40px] rounded bg-[#2563EB] whitespace-nowrap hover:bg-[#1D4ED8] transition-colors"
              >
                <Plus className="w-4 h-4 text-white" strokeWidth={1.6} />
                <span className="text-white text-[14px] lg:text-[16px] font-medium">
                  Додати інвентар
                </span>
              </button>
              <button 
                onClick={() => window.location.href = '/unidentified'}
                className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
              >
                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
                  Неідентифіковані інвентарі
                </span>
              </button>
            </div>
          </div>

          {/* Search Bar with Filters */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-[15px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
            <div className="flex items-center gap-[10px] flex-1 min-w-0 w-full lg:w-auto px-[10px] py-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937]">
              <Search className="w-4 h-4 text-gray-400 dark:text-white flex-shrink-0" strokeWidth={1.6} />
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleChange}
                placeholder="Наприклад, Яблунівка або ЦДІАЛ 100-1-95"
                className="bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[14px] outline-none flex-1 min-w-0"
              />
            </div>

            {/* Filter Chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-[10px]">
                {(filters.inventory_year_from || filters.inventory_year_to) && (
                  <FilterChip 
                    label={`Роки: ${filters.inventory_year_from || '...'} - ${filters.inventory_year_to || '...'}`}
                    onRemove={() => {
                      setFilters({...filters, inventory_year_from: '', inventory_year_to: ''});
                      setPage(0);
                    }}
                  />
                )}
              </div>
            )}

            {/* Year Filter Inputs (collapsed) */}
            <div className="flex items-center gap-2">
              <input
                name="inventory_year_from"
                placeholder="Рік з..."
                value={filters.inventory_year_from}
                onChange={handleChange}
                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-[#374151] rounded text-[13px] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white"
              />
              <span className="text-gray-500 dark:text-gray-400 text-sm">-</span>
              <input
                name="inventory_year_to"
                placeholder="по..."
                value={filters.inventory_year_to}
                onChange={handleChange}
                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-[#374151] rounded text-[13px] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Results Count */}
          {totalCount > 0 && !loading && (
            <p className="text-gray-900 dark:text-[#F3F4F6] text-[16px] lg:text-[18px] mb-[15px]">
              Знайдено {totalCount} {totalCount === 1 ? 'інвентар' : totalCount < 5 ? 'інвентарі' : 'інвентарів'}
            </p>
          )}

          {loading && (
            <div className="text-center py-8">
              <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto mb-[15px]">
            <div className="min-w-full border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[2fr_2fr_1fr_1.5fr_2fr_1fr] border-b border-gray-300 dark:border-[#374151]">
                <TableHeader label="Адміністративний поділ (на час складання)" />
                <TableHeader label="Адміністративний поділ (сучасний)" />
                <TableHeader label="Рік" />
                <TableHeader label="Сигнатура справи" />
                <TableHeader label="Назва справи" />
                <TableHeader label="Скани" isLast />
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                {records.length === 0 && !loading && (
                  <div className="text-center py-8">
                    <p className="text-blue-600 dark:text-[#2563EB] text-[14px] lg:text-[16px]">
                      Введіть населений пункт, назву або сигнатуру справи для пошуку потрібного вам інвентарю
                    </p>
                  </div>
                )}
                {records.map((record, index) => (
                  <div
                    key={record.id}
                    className={`grid grid-cols-[2fr_2fr_1fr_1.5fr_2fr_1fr] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors ${
                      index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                    }`}
                    onClick={() => window.location.href = `/record/${record.id}`}
                  >
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {[record.old_province, record.old_district, record.old_community]
                          .filter(Boolean)
                          .map((item, idx) => <div key={`old-${idx}`}>{item}</div>)}
                        {(record.old_settlement_type || record.old_settlement_name) && (
                          <div className="font-bold italic">
                            {[record.old_settlement_type, record.old_settlement_name]
                              .filter(Boolean)
                              .join(' ')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {[
                          record.current_region ? `${record.current_region} область` : null,
                          record.current_district ? `${record.current_district} район` : null,
                          record.current_community ? `${record.current_community} громада` : null
                        ]
                          .filter(Boolean)
                          .map((item, idx) => <div key={`current-${idx}`}>{item}</div>)}
                        {(record.current_settlement_type || record.current_settlement_name) && (
                          <div className="font-bold italic">
                            {[record.current_settlement_type, record.current_settlement_name]
                              .filter(Boolean)
                              .join(' ')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{record.inventory_year ?? '-'}</TableCell>
                    <TableCell>{record.case_signature || '-'}</TableCell>
                    <TableCell>{record.case_title || '-'}</TableCell>
                    <div className="flex items-center justify-center p-[10px]">
                      {record.scans_url ? (
                        <StatusBadge label="онлайн" variant="success" />
                      ) : (
                        <StatusBadge label="відсутні" variant="danger" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="block lg:hidden space-y-4 mb-[15px]">
            {records.length === 0 && !loading && (
              <div className="text-center p-6 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937]">
                <p className="text-blue-600 dark:text-[#2563EB] text-[14px]">
                  Введіть населений пункт, назву або сигнатуру справи для пошуку потрібного вам інвентарю
                </p>
              </div>
            )}
            {records.map(record => (
              <div
                key={record.id}
                className="p-4 border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#1F2937] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                onClick={() => window.location.href = `/record/${record.id}`}
              >
                <div className="space-y-3">
                  <div>
                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                      Адміністративний поділ (на час складання)
                    </div>
                    <div className="text-[13px] text-gray-900 dark:text-white">
                      {[record.old_province, record.old_district, record.old_community]
                        .filter(Boolean).join(', ') || '-'}
                    </div>
                    {(record.old_settlement_type || record.old_settlement_name) && (
                      <div className="text-[13px] text-gray-900 dark:text-white font-bold italic">
                        {[record.old_settlement_type, record.old_settlement_name].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">
                      Адміністративний поділ (сучасний)
                    </div>
                    <div className="text-[13px] text-gray-900 dark:text-white">
                      {[
                        record.current_region ? `${record.current_region} область` : null,
                        record.current_district ? `${record.current_district} район` : null,
                        record.current_community ? `${record.current_community} громада` : null
                      ].filter(Boolean).join(', ') || '-'}
                    </div>
                    {(record.current_settlement_type || record.current_settlement_name) && (
                      <div className="text-[13px] text-gray-900 dark:text-white font-bold italic">
                        {[record.current_settlement_type, record.current_settlement_name].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Рік</div>
                      <div className="text-[13px] text-gray-900 dark:text-white">{record.inventory_year ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Скани</div>
                      {record.scans_url ? (
                        <StatusBadge label="онлайн" variant="success" />
                      ) : (
                        <StatusBadge label="відсутні" variant="danger" />
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Сигнатура справи</div>
                    <div className="text-[13px] text-gray-900 dark:text-white">{record.case_signature || '-'}</div>
                  </div>

                  <div>
                    <div className="text-[12px] font-medium text-gray-700 dark:text-gray-400 mb-1">Назва справи</div>
                    <div className="text-[13px] text-gray-900 dark:text-white">{record.case_title || '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-[15px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827]">
              <div className="flex items-center gap-[20px]">
                <button 
                  className="flex items-center gap-[5px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === 0 || loading}
                  onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                >
                  <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                  <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Назад</span>
                </button>

                <div className="flex items-center gap-[5px]">
                  {Array.from({ length: Math.ceil(totalCount / PAGE_SIZE) }, (_, i) => i).map((pageNum) => (
                    <PageNumber 
                      key={pageNum} 
                      number={pageNum + 1} 
                      isActive={pageNum === page}
                      onClick={() => setPage(pageNum)}
                    />
                  ))}
                </div>

                <button 
                  className="flex items-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE) - 1 || loading}
                  onClick={() => setPage(prev => prev + 1)}
                >
                  <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px]">Вперед</span>
                  <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-center gap-[5px] px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] whitespace-nowrap">
      <span className="text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] text-center">{label}</span>
      <button className="hover:opacity-80 transition-opacity" onClick={onRemove}>
        <X className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
      </button>
    </div>
  );
}

function TableHeader({ label, isLast = false }: { label: string; isLast?: boolean }) {
  return (
    <div className={`flex items-center justify-center gap-[5px] p-[10px] ${isLast ? '' : 'border-r border-gray-200 dark:border-[#374151]'} bg-gray-100 dark:bg-[#1F2937] min-h-[50px]`}>
      <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold text-center">{label}</span>
      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
    </div>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center p-[10px] border-r border-gray-200 dark:border-[#374151] min-h-[50px]">
      <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px] text-center">{children}</span>
    </div>
  );
}

function StatusBadge({ label, variant }: { label: string; variant: "success" | "danger" }) {
  const bgColor = variant === "success" ? "bg-[#14AE5C]" : "bg-[#EC221F]";
  const Icon = variant === "success" ? Check : X;

  return (
    <div className={`inline-flex items-center justify-center gap-[5px] px-[10px] py-[5px] rounded ${bgColor}`}>
      <Icon className="w-4 h-4 text-white" strokeWidth={1.6} />
      <span className="text-white text-[13px] lg:text-[14px] leading-[100%]">{label}</span>
    </div>
  );
}

function PageNumber({ number, isActive, onClick }: { number: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center px-[12px] py-[8px] rounded-lg ${
        isActive ? 'bg-gray-200 dark:bg-[#1F2937]' : ''
      } hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors`}
    >
      <span className={`text-[14px] lg:text-[16px] ${isActive ? 'text-gray-900 dark:text-[#F5F5F5] font-medium' : 'text-gray-700 dark:text-white'}`}>
        {number}
      </span>
    </button>
  );
}