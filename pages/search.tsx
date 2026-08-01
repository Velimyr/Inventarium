import { supabase } from '../lib/supabaseClient';
import { apostropheTolerant } from '../lib/textSearch';
import {
  fetchRegionStructure, listCountries, listRegions, listDistricts, listCommunities,
  isNamedLevel,
  levelNames, capitalize,
  type NestedStructure,
} from '../components/keys/regionData';
import Header from '../components/header';
import { useEffect, useState } from 'react';
import { X, Search, ChevronDown, ChevronLeft, ChevronRight, Check, Plus, Filter } from 'lucide-react';
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
    case_signature: '',
    current_country: '',
    current_region: '',
    current_district: '',
    current_community: '',
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Region structure data
  const [nestedData, setNestedData] = useState<NestedStructure | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);

  // Load region structure
  useEffect(() => {
    fetchRegionStructure()
      .then((json) => setNestedData(json))
      .catch((err) => console.error('Failed to load region_structure.json', err));
  }, []);

  // Update regions when country changes
  useEffect(() => {
    setRegions(listRegions(nestedData, filters.current_country));
    if (filters.current_country) {
      setFilters(prev => ({ ...prev, current_region: '', current_district: '', current_community: '' }));
    }
  }, [filters.current_country, nestedData]);

  // Update districts when region changes
  useEffect(() => {
    setDistricts(listDistricts(nestedData, filters.current_country, filters.current_region));
    if (filters.current_region) {
      setFilters(prev => ({ ...prev, current_district: '', current_community: '' }));
    }
  }, [filters.current_region, filters.current_country, nestedData]);

  // Update communities when district changes
  useEffect(() => {
    setCommunities(listCommunities(
      nestedData, filters.current_country, filters.current_region, filters.current_district,
    ));
    if (filters.current_district) {
      setFilters(prev => ({ ...prev, current_community: '' }));
    }
  }, [filters.current_district, filters.current_region, filters.current_country, nestedData]);

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
    if (!filters.search || filters.search.trim().length < 3) {
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

    // Фільтри по адмінподілу. Апостроф у назві («Кам’янець-Подільський») може
    // відрізнятися від збереженого в записі, тому шукаємо толерантно до нього.
    if (filters.current_country) {
      query = query.ilike('current_country', `%${apostropheTolerant(filters.current_country)}%`);
    }
    if (filters.current_region) {
      query = query.ilike('current_region', `%${apostropheTolerant(filters.current_region)}%`);
    }
    if (filters.current_district) {
      query = query.ilike('current_district', `%${apostropheTolerant(filters.current_district)}%`);
    }
    if (filters.current_community) {
      query = query.ilike('current_community', `%${apostropheTolerant(filters.current_community)}%`);
    }

    // Фільтри по роках
    if (filters.inventory_year_from) {
      query = query.gte('inventory_year', Number(filters.inventory_year_from));
    }
    if (filters.inventory_year_to) {
      query = query.lte('inventory_year', Number(filters.inventory_year_to));
    }

    // Фільтр по сигнатурі справи
    if (filters.case_signature) {
      query = query.ilike('case_signature', `%${filters.case_signature}%`);
    }

    // Основний пошук (обов'язковий)
    const term = apostropheTolerant(filters.search);
    query = query.or([
      `old_settlement_name.ilike.%${term}%`,
      `current_settlement_name.ilike.%${term}%`,
      `case_title.ilike.%${term}%`,
      `notes.ilike.%${term}%`,
      `case_signature.ilike.%${term}%`,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const updated = { ...filters, [name]: value };
    setFilters(updated);
    setPage(0);
  };

  const clearFilters = () => {
    const cleared = {
      search: filters.search, // Зберігаємо пошук
      inventory_year_from: '',
      inventory_year_to: '',
      case_signature: '',
      current_country: '',
      current_region: '',
      current_district: '',
      current_community: '',
    };
    setFilters(cleared);
    setPage(0);
  };

  const hasActiveFilters =
    filters.inventory_year_from ||
    filters.inventory_year_to ||
    filters.case_signature ||
    filters.current_country ||
    filters.current_region ||
    filters.current_district ||
    filters.current_community;

  const activeFiltersCount = [
    filters.inventory_year_from || filters.inventory_year_to,
    filters.case_signature,
    filters.current_country,
    filters.current_region,
    filters.current_district,
    filters.current_community,
  ].filter(isNamedLevel).length;

  const lv = levelNames(filters.current_country);


  return (
    <>
      <Header />
      
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="w-full px-4 md:px-8 lg:px-[52px] py-[20px] lg:py-[30px]">
          {/* Header Section */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-[10px] lg:mb-[16px]">
            <div>
              <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[10px]">
                Пошук у реєстрі Інвентаріуму
              </h1>
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
          <div className="flex flex-col gap-[15px] p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
            {/* Search Line - Always Visible */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[15px]">
              {/* Search Input */}
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

              {/* Filter Toggle Button */}
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="flex items-center justify-center gap-[10px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors whitespace-nowrap"
              >
                <Filter className="w-4 h-4 text-gray-900 dark:text-white" strokeWidth={1.6} />
                <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px]">
                  Фільтри {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                </span>
                <ChevronDown 
                  className={`w-4 h-4 text-gray-900 dark:text-white transition-transform ${filtersExpanded ? 'rotate-180' : ''}`} 
                  strokeWidth={1.6} 
                />
              </button>
            </div>

            {/* Expanded Filters */}
            {filtersExpanded && (
              <div className="flex flex-col gap-[15px]">
                {/* First Row: Country, Region, District, Community */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[15px]">
                  <FilterSelect
                    name="current_country"
                    value={filters.current_country}
                    onChange={handleChange}
                    placeholder="Країна"
                  >
                    {listCountries(nestedData).map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    name="current_region"
                    value={filters.current_region}
                    onChange={handleChange}
                    placeholder={capitalize(lv.region)}
                    disabled={!regions.length}
                  >
                    {[...regions].sort().map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    name="current_district"
                    value={filters.current_district}
                    onChange={handleChange}
                    placeholder={capitalize(lv.district)}
                    disabled={!districts.length}
                  >
                    {districts.sort().map((district) => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    name="current_community"
                    value={filters.current_community}
                    onChange={handleChange}
                    placeholder={capitalize(lv.community)}
                    disabled={!communities.length}
                  >
                    {communities.sort().map((comm) => (
                      <option key={comm} value={comm}>{comm}</option>
                    ))}
                  </FilterSelect>
                </div>

                {/* Second Row: Year From/To, Case Signature */}
                <div className="grid grid-cols-1 md:grid-cols-[120px_120px_1fr] gap-[15px]">
                  <input
                    name="inventory_year_from"
                    placeholder="Рік з..."
                    value={filters.inventory_year_from}
                    onChange={handleChange}
                    className="px-[10px] py-[8px] border border-gray-300 dark:border-[#374151] rounded text-[13px] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-[#2563EB] transition-colors"
                  />
                  <input
                    name="inventory_year_to"
                    placeholder="по..."
                    value={filters.inventory_year_to}
                    onChange={handleChange}
                    className="px-[10px] py-[8px] border border-gray-300 dark:border-[#374151] rounded text-[13px] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-[#2563EB] transition-colors"
                  />
                  <input
                    name="case_signature"
                    placeholder="Сигнатура справи"
                    value={filters.case_signature}
                    onChange={handleChange}
                    className="px-[10px] py-[8px] border border-gray-300 dark:border-[#374151] rounded text-[13px] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-[#2563EB] transition-colors"
                  />
                </div>

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <div className="flex justify-end">
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-[5px] px-[12px] py-[6px] rounded text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                    >
                      <X className="w-4 h-4" strokeWidth={1.6} />
                      <span>Очистити фільтри</span>
                    </button>
                  </div>
                )}
              </div>
            )}
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
              <div className="grid grid-cols-[2fr_2fr_1fr_1.5fr_2fr_100px] border-b border-gray-300 dark:border-[#374151]">
                <TableHeader label="Історичний адмінподіл" />
                <TableHeader label="Сучасний адмінподіл" />
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
                    className={`grid grid-cols-[2fr_2fr_1fr_1.5fr_2fr_100px] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors ${
                      index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-[#1F2937]'
                    }`}
                  >
                    <div 
                      className="flex items-start justify-start p-[10px] border-r border-gray-200 dark:border-[#374151] min-h-[50px] cursor-pointer"
                      onClick={() => window.open(`/record/${record.id}`, '_blank')}
                    >
                      <div 
                        className="flex flex-col text-gray-900 dark:text-white text-[13px] lg:text-[14px]"
                        title={[
                          record.old_settlement_type && record.old_settlement_name 
                            ? `${record.old_settlement_type} ${record.old_settlement_name}` 
                            : null,
                          [record.old_province, record.old_district, record.old_community]
                            .filter(isNamedLevel)
                            .join(', ')
                        ].filter(isNamedLevel).join(', ')}
                      >
                        {(record.old_settlement_type || record.old_settlement_name) && (
                          <div className="font-bold">
                            {(() => {
                              const settlement = [record.old_settlement_type, record.old_settlement_name]
                                .filter(isNamedLevel)
                                .join(' ');
                              return settlement.length > 80 
                                ? `${settlement.substring(0, 80)}...` 
                                : settlement;
                            })()}
                          </div>
                        )}
                        {[record.old_province, record.old_district, record.old_community]
                          .filter(isNamedLevel)
                          .length > 0 && (
                          <div>
                            {(() => {
                              const adminDiv = [record.old_province, record.old_district, record.old_community]
                                .filter(isNamedLevel)
                                .join(', ');
                              return adminDiv.length > 80 
                                ? `${adminDiv.substring(0, 80)}...` 
                                : adminDiv;
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div 
                      className="flex items-start justify-start p-[10px] border-r border-gray-200 dark:border-[#374151] min-h-[50px] cursor-pointer"
                      onClick={() => window.open(`/record/${record.id}`, '_blank')}
                    >
                      <div 
                        className="flex flex-col text-gray-900 dark:text-white text-[13px] lg:text-[14px]"
                        title={[
                          record.current_settlement_type && record.current_settlement_name 
                            ? `${record.current_settlement_type} ${record.current_settlement_name}` 
                            : null,
                          [
                            record.current_country,
                            record.current_region,
                            record.current_district,
                            record.current_community
                          ]
                            .filter(isNamedLevel)
                            .join(', ')
                        ].filter(Boolean).join(', ')}
                      >
                        {(record.current_settlement_type || record.current_settlement_name) && (
                          <div className="font-bold">
                            {(() => {
                              const settlement = [record.current_settlement_type, record.current_settlement_name]
                                .filter(Boolean)
                                .join(' ');
                              return settlement.length > 80 
                                ? `${settlement.substring(0, 80)}...` 
                                : settlement;
                            })()}
                          </div>
                        )}
                        {[
                          record.current_country,
                          record.current_region,
                          record.current_district,
                          record.current_community
                        ]
                          .filter(isNamedLevel)
                          .length > 0 && (
                          <div>
                            {(() => {
                              const adminDiv = [
                                record.current_country,
                                record.current_region,
                                record.current_district,
                                record.current_community
                              ]
                                .filter(isNamedLevel)
                                .join(', ');
                              return adminDiv.length > 80 
                                ? `${adminDiv.substring(0, 80)}...` 
                                : adminDiv;
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    <TableCell>
                      <div 
                        className="cursor-pointer" 
                        onClick={() => window.open(`/record/${record.id}`, '_blank')}
                      >
                        {record.inventory_year ?? '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div 
                        className="cursor-pointer" 
                        onClick={() => window.open(`/record/${record.id}`, '_blank')}
                      >
                        {record.case_signature || '-'}
                      </div>
                    </TableCell>
                    <div 
                      className="flex items-start justify-start p-[10px] border-r border-gray-200 dark:border-[#374151] min-h-[50px] cursor-pointer"
                      onClick={() => window.open(`/record/${record.id}`, '_blank')}
                      title={record.case_title || ''}
                    >
                      <span className="text-gray-900 dark:text-white text-[13px] lg:text-[14px]">
                        {record.case_title 
                          ? record.case_title.length > 80 
                            ? `${record.case_title.substring(0, 80)}...` 
                            : record.case_title
                          : '-'
                        }
                      </span>
                    </div>
                    <div 
                      className="flex items-center justify-center p-[10px] cursor-pointer"
                      onClick={() => window.open(`/record/${record.id}`, '_blank')}
                    >
                      {record.scans_url ? (
                        <div className="flex items-center justify-center w-[32px] h-[32px] rounded bg-[#ECFEF5] dark:bg-[#065E44]">
                          <Check className="w-4 h-4 text-[#065E44] dark:text-[#ECFEF5]" strokeWidth={1.6} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-[32px] h-[32px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                          <X className="w-4 h-4 text-[#880E16] dark:text-[#FEE2E2]" strokeWidth={1.6} />
                        </div>
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
                        record.current_country,
                        record.current_region,
                        record.current_district,
                        record.current_community
                      ].filter(isNamedLevel).join(', ') || '-'}
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
                        <div className="inline-flex items-center justify-center w-[32px] h-[32px] rounded bg-[#ECFEF5] dark:bg-[#065E44]">
                          <Check className="w-4 h-4 text-[#065E44] dark:text-[#ECFEF5]" strokeWidth={1.6} />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-[32px] h-[32px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                          <X className="w-4 h-4 text-[#880E16] dark:text-[#FEE2E2]" strokeWidth={1.6} />
                        </div>
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

function FilterSelect({ 
  name, 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  children 
}: { 
  name: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  placeholder: string; 
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
    </div>
  );
}

function TableHeader({ label, isLast = false }: { label: string; isLast?: boolean }) {
  return (
    <div className={`flex items-center justify-center gap-[5px] p-[10px] ${isLast ? '' : 'border-r border-gray-200 dark:border-[#374151]'} bg-gray-100 dark:bg-[#1F2937] min-h-[50px]`}>
      <span className="text-gray-900 dark:text-white text-[14px] lg:text-[16px] font-semibold text-center">{label}</span>
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