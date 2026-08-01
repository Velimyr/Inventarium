import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import { ChevronDown, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { isNamedLevel } from '../components/keys/regionData';

const PAGE_SIZE = 20;

export default function SettlementRecordsPage() {
  const router = useRouter();
  const {
    current_settlement_name,
    current_settlement_type,
    current_community,
    current_district,
    current_region,
    current_country,
  } = router.query;

  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (
      current_settlement_name &&
      current_community &&
      current_district &&
      current_region
    ) {
      fetchRecords();
    }
  }, [current_settlement_name, current_community, current_district, current_region, page]);

  const fetchRecords = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Країну додаємо лише коли вона є в посиланні: збережені раніше URL її не мають
    const { data, error, count } = await supabase
      .from('records')
      .select('*', { count: 'exact' })
      .eq('approved', true)
      .match({
        current_settlement_name,
        current_community,
        current_district,
        current_region,
        ...(current_country ? { current_country } : {}),
      })
      .order('inventory_year', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Помилка:', error);
      setRecords([]);
      setTotalCount(0);
    } else {
      setRecords(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <Header />
      <div className="bg-white dark:bg-[#111827] min-h-screen">
        <div className="w-full px-4 md:px-8 lg:px-[52px] py-6 md:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-2xl md:text-[32px] font-bold mb-2 md:mb-[10px]">
            {current_settlement_name}
          </h1>
          <p className="text-gray-700 dark:text-white text-sm md:text-base opacity-80 mb-8 md:mb-[49px]">
            {/* Назви рівнів уже містять слово-тип, а «Немає» — це відсутній
                рівень (громада в Польщі, район для м.Києва), його не показуємо */}
            {[current_community, current_district, current_region, current_country]
              .map((v) => (Array.isArray(v) ? v[0] : v))
              .filter(isNamedLevel)
              .join(', ')}
          </p>

          {/* Found Count */}
          {!loading && (
            <div className="text-gray-900 dark:text-[#F3F4F6] text-base md:text-lg mb-4 md:mb-[15px]">
              Знайдено {totalCount} {totalCount === 1 ? 'інвентар' : totalCount < 5 ? 'інвентарі' : 'інвентарів'}
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-900 dark:text-white py-8">Завантаження...</p>
          ) : records.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">
              За вказаними параметрами записів не знайдено.
            </p>
          ) : (
            <>
              {/* Data Table - Desktop */}
              <div className="hidden lg:block mb-[15px] overflow-x-auto">
                <div className="border border-gray-300 dark:border-[#374151] rounded-lg overflow-hidden">
                  {/* Table Header */}
                  <div className="flex min-w-full bg-gray-100 dark:bg-[#1F2937]">
                    <div className="w-[180px] border-r border-gray-300 dark:border-[#374151] flex items-center justify-center gap-[5px] p-[10px]">
                      <span className="text-gray-900 dark:text-white text-base font-semibold">Сигнатура</span>
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6]" strokeWidth={2} />
                    </div>
                    <div className="w-[100px] border-r border-gray-300 dark:border-[#374151] flex items-center justify-center gap-[5px] p-[10px]">
                      <span className="text-gray-900 dark:text-white text-base font-semibold">Рік</span>
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6]" strokeWidth={2} />
                    </div>
                    <div className="flex-1 border-r border-gray-300 dark:border-[#374151] flex items-center justify-center gap-[5px] p-[10px]">
                      <span className="text-gray-900 dark:text-white text-base font-semibold">Назва справи</span>
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6]" strokeWidth={2} />
                    </div>
                    <div className="w-[140px] flex items-center justify-center gap-[5px] p-[10px]">
                      <span className="text-gray-900 dark:text-white text-base font-semibold">Скани</span>
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-[#F3F4F6]" strokeWidth={2} />
                    </div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-gray-200 dark:divide-[#374151]">
                    {records.map((record, index) => (
                      <div
                        key={record.id}
                        className={`flex min-w-full cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors ${
                          index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                        }`}
                        onClick={() => window.location.href = `/record/${record.id}`}
                      >
                        <div className="w-[180px] border-r border-gray-200 dark:border-[#374151] flex items-center justify-center p-3">
                          <span className="text-gray-900 dark:text-white text-sm text-center">
                            {record.case_signature || '-'}
                          </span>
                        </div>
                        <div className="w-[100px] border-r border-gray-200 dark:border-[#374151] flex items-center justify-center p-3">
                          <span className="text-gray-900 dark:text-white text-sm text-center">
                            {record.inventory_year || '-'}
                          </span>
                        </div>
                        <div className="flex-1 border-r border-gray-200 dark:border-[#374151] flex items-center justify-center p-3">
                          <span className="text-gray-900 dark:text-white text-sm text-center">
                            {record.case_title || '-'}
                          </span>
                        </div>
                        <div className="w-[140px] flex items-center justify-center p-[10px]">
                          {record.scans_url ? (
                            <div className="flex items-center gap-[5px] px-[10px] py-[5px] bg-[#ECFEF5] dark:bg-[#065E44] rounded">
                              <Check className="w-4 h-4 text-[#065E44] dark:text-[#ECFEF5]" strokeWidth={1.6} />
                              <span className="text-[#065E44] dark:text-[#ECFEF5] text-sm font-medium">онлайн</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-[5px] px-[10px] py-[5px] bg-[#FEE2E2] dark:bg-[#880E16] rounded">
                              <X className="w-4 h-4 text-[#880E16] dark:text-[#FEE2E2]" strokeWidth={1.6} />
                              <span className="text-[#880E16] dark:text-[#FEE2E2] text-sm font-medium">відсутні</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data Cards - Mobile/Tablet */}
              <div className="lg:hidden space-y-4 mb-6">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="bg-gray-50 dark:bg-[#1F2937] border border-gray-300 dark:border-[#374151] rounded-lg p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                    onClick={() => window.location.href = `/record/${record.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-gray-900 dark:text-white text-base font-semibold mb-2">
                          {record.case_title || '-'}
                        </h3>
                        <div className="space-y-1 text-sm">
                          <div className="flex gap-2">
                            <span className="text-gray-600 dark:text-gray-400">Рік:</span>
                            <span className="text-gray-900 dark:text-white">{record.inventory_year || '-'}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 dark:text-gray-400">Сигнатура:</span>
                            <span className="text-gray-900 dark:text-white">{record.case_signature || '-'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                        {record.scans_url ? (
                          <div className="flex items-center gap-1 px-3 py-1.5 bg-[#ECFEF5] dark:bg-[#065E44] rounded">
                            <Check className="w-3 h-3 text-[#065E44] dark:text-[#ECFEF5]" strokeWidth={1.6} />
                            <span className="text-[#065E44] dark:text-[#ECFEF5] text-xs font-medium">онлайн</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-3 py-1.5 bg-[#FEE2E2] dark:bg-[#880E16] rounded">
                            <X className="w-3 h-3 text-[#880E16] dark:text-[#FEE2E2]" strokeWidth={1.6} />
                            <span className="text-[#880E16] dark:text-[#FEE2E2] text-xs font-medium">відсутні</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center gap-4 p-4 md:p-[15px] border border-gray-300 dark:border-[#374151] rounded-lg bg-gray-50 dark:bg-[#111827]">
                  <button 
                    className="flex items-center gap-[10px] px-[15px] h-10 bg-white dark:bg-[#111827] border border-gray-300 dark:border-[#374151] rounded hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={page === 0 || loading}
                    onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-base">Назад</span>
                  </button>

                  <div className="flex items-center gap-[5px]">
                    {Array.from({ length: totalPages }, (_, i) => i).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          pageNum === page 
                            ? 'bg-gray-200 dark:bg-[#1F2937]' 
                            : 'hover:bg-gray-200 dark:hover:bg-[#374151]'
                        }`}
                      >
                        <span className={`text-base ${
                          pageNum === page 
                            ? 'text-gray-900 dark:text-[#F5F5F5] font-medium' 
                            : 'text-gray-700 dark:text-white'
                        }`}>
                          {pageNum + 1}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button 
                    className="flex items-center gap-[10px] px-[15px] h-10 bg-white dark:bg-[#111827] border border-gray-300 dark:border-[#374151] rounded hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={page >= totalPages - 1 || loading}
                    onClick={() => setPage(prev => prev + 1)}
                  >
                    <span className="text-gray-900 dark:text-[#F3F4F6] text-base">Вперед</span>
                    <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}