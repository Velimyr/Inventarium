import { type ReactNode, useEffect, useState } from 'react';
import Header from '../components/header';
import Toast from '../components/Toast';
import AdminSectionTabs, { APPROVE_SECTION_TITLE, APPROVE_TABS, withCount } from '../components/AdminSectionTabs';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabaseClient';
import { approveUnverifiedRecord } from '../lib/adminApproveUtils';
import {
  CheckCheck,
  FileStack,
  FolderTree,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

type AdminUserRow = {
  id: string;
  email: string | null;
  role: string | null;
};

type AuthorGroup = {
  key: string;
  email: string;
  normalizedEmail: string;
  role: string | null;
  isSuperRole: boolean;
  isAdminRole: boolean;
  canApproveWithoutConfirm: boolean;
  isSuperadmin: boolean;
  records: any[];
};

type DivisionCommunity = {
  name: string;
  count: number;
};

type DivisionDistrict = {
  name: string;
  count: number;
  communities: DivisionCommunity[];
};

type DivisionRegion = {
  name: string;
  count: number;
  districts: DivisionDistrict[];
};

type BulkRunItem = {
  recordId: string;
  status: 'approved' | 'duplicate' | 'error';
  message: string;
};

const normalizeEmail = (email: string | null | undefined) => (email || '').trim().toLowerCase();

const getRoleRank = (role: string | null | undefined) => {
  const normalized = (role || '').trim().toLowerCase();
  if (normalized === 'superadmin') return 3;
  if (normalized === 'superuser') return 2;
  if (normalized === 'admin') return 1;
  return 0;
};

const buildAuthorGroups = (records: any[], adminUsers: AdminUserRow[]) => {
  const adminByEmail = new Map<string, AdminUserRow>();

  for (const adminUser of adminUsers) {
    const normalizedEmail = normalizeEmail(adminUser.email);
    if (!normalizedEmail) continue;

    const current = adminByEmail.get(normalizedEmail);
    if (!current || getRoleRank(adminUser.role) > getRoleRank(current.role)) {
      adminByEmail.set(normalizedEmail, adminUser);
    }
  }

  const groups = new Map<string, AuthorGroup>();

  for (const record of records) {
    const normalizedEmail = normalizeEmail(record.email);
    const fallbackKey = `missing-email:${record.created_by || record.id}`;
    const key = normalizedEmail || fallbackKey;
    const matchedAdmin = normalizedEmail ? adminByEmail.get(normalizedEmail) : null;
    const role = matchedAdmin?.role || null;
    const normalizedRole = (role || '').trim().toLowerCase();
    const isSuperRole = normalizedRole === 'superuser' || normalizedRole === 'superadmin';
    const isAdminRole = normalizedRole === 'admin';
    const canApproveWithoutConfirm = isSuperRole || isAdminRole;
    const isSuperadmin = normalizedRole === 'superadmin';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        email: record.email?.trim() || 'Без email',
        normalizedEmail,
        role,
        isSuperRole,
        isAdminRole,
        canApproveWithoutConfirm,
        isSuperadmin,
        records: [],
      });
    }

    groups.get(key)!.records.push(record);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.isSuperRole !== b.isSuperRole) return a.isSuperRole ? -1 : 1;
    if (a.isAdminRole !== b.isAdminRole) return a.isAdminRole ? -1 : 1;
    if (a.records.length !== b.records.length) return b.records.length - a.records.length;
    return a.email.localeCompare(b.email, 'uk');
  });
};

const buildDivisionStats = (records: any[]): DivisionRegion[] => {
  const regionMap = new Map<
    string,
    {
      name: string;
      count: number;
      districts: Map<string, { name: string; count: number; communities: Map<string, { name: string; count: number }> }>;
    }
  >();

  for (const record of records) {
    const regionName = record.current_region?.trim() || 'Не вказано область';
    const districtName = record.current_district?.trim() || 'Не вказано район';
    const communityName = record.current_community?.trim() || 'Не вказано громаду';

    if (!regionMap.has(regionName)) {
      regionMap.set(regionName, {
        name: regionName,
        count: 0,
        districts: new Map(),
      });
    }

    const regionNode = regionMap.get(regionName)!;
    regionNode.count += 1;

    if (!regionNode.districts.has(districtName)) {
      regionNode.districts.set(districtName, {
        name: districtName,
        count: 0,
        communities: new Map(),
      });
    }

    const districtNode = regionNode.districts.get(districtName)!;
    districtNode.count += 1;

    if (!districtNode.communities.has(communityName)) {
      districtNode.communities.set(communityName, {
        name: communityName,
        count: 0,
      });
    }

    districtNode.communities.get(communityName)!.count += 1;
  }

  return Array.from(regionMap.values())
    .map((region) => ({
      name: region.name,
      count: region.count,
      districts: Array.from(region.districts.values())
        .map((district) => ({
          name: district.name,
          count: district.count,
          communities: Array.from(district.communities.values())
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'))
            .map((community) => ({
              name: community.name,
              count: community.count,
            })),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk')),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'));
};

const buildSignatureStats = (records: any[]) => {
  const counts = new Map<string, number>();

  for (const record of records) {
    const signature = record.case_signature?.trim() || 'Без сигнатури';
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'));
};

const hasScans = (record: any) => !!record.scans_url?.toString().trim();

export default function AdminApproveMassPage() {
  const { user, loading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [authors, setAuthors] = useState<AuthorGroup[]>([]);
  const [selectedAuthorKey, setSelectedAuthorKey] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastBulkRun, setLastBulkRun] = useState<BulkRunItem[]>([]);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setError('⛔ Ви не авторизовані');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      const { data: adminAccess } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!adminAccess) {
        setError('⛔ У вас немає доступу до цієї сторінки');
        setLoading(false);
        return;
      }

      const [{ data: adminUsersData, error: adminUsersError }, { data: recordsData, error: recordsError }] = await Promise.all([
        supabase.from('admin_users').select('id, email, role'),
        supabase.from('records_unverified').select('*').order('created_at', { ascending: true }),
      ]);

      if (adminUsersError || recordsError) {
        console.error(adminUsersError || recordsError);
        setError('❌ Не вдалося завантажити дані для масового підтвердження');
        setLoading(false);
        return;
      }

      const nextAdminUsers = adminUsersData || [];
      const nextRecords = recordsData || [];
      const nextAuthors = buildAuthorGroups(nextRecords, nextAdminUsers);

      setAdminUsers(nextAdminUsers);
      setRecords(nextRecords);
      setAuthors(nextAuthors);
      setSelectedAuthorKey((prev) =>
        prev && nextAuthors.some((author) => author.key === prev) ? prev : nextAuthors[0]?.key || ''
      );
      setLoading(false);
    };

    loadData();
  }, [user, userLoading]);

  const selectedAuthor = authors.find((author) => author.key === selectedAuthorKey) || null;
  const selectedRecords = selectedAuthor?.records || [];
  const divisionStats = buildDivisionStats(selectedRecords);
  const signatureStats = buildSignatureStats(selectedRecords);
  const recordsWithScans = selectedRecords.filter(hasScans).length;
  const superRoleAuthors = authors.filter((author) => author.isSuperRole);
  const adminRoleAuthors = authors.filter((author) => author.isAdminRole);
  const otherAuthors = authors.filter((author) => !author.isSuperRole && !author.isAdminRole);

  const refreshGroups = (nextRecords: any[]) => {
    const nextAuthors = buildAuthorGroups(nextRecords, adminUsers);
    setRecords(nextRecords);
    setAuthors(nextAuthors);
    setSelectedAuthorKey((prev) =>
      prev && nextAuthors.some((author) => author.key === prev) ? prev : nextAuthors[0]?.key || ''
    );
  };

  const handleBulkApprove = async () => {
    if (!user?.id || !selectedAuthor || selectedRecords.length === 0) return;

    if (!selectedAuthor.canApproveWithoutConfirm) {
      const confirmed = window.confirm(
        `Користувач ${selectedAuthor.email} не має ролі admin, superuser або superadmin. Ви впевнені, що хочете підтвердити всі його записи?`
      );

      if (!confirmed) return;
    }

    setProcessing(true);
    setLastBulkRun([]);

    const runResults: BulkRunItem[] = [];

    for (const record of selectedRecords) {
      const result = await approveUnverifiedRecord({
        record,
        adminUserId: user.id,
        origin: window.location.origin,
      });

      runResults.push(result);
    }

    const approvedIds = new Set(
      runResults.filter((item) => item.status === 'approved').map((item) => item.recordId)
    );
    const nextRecords = records.filter((record) => !approvedIds.has(record.id));
    const approvedCount = runResults.filter((item) => item.status === 'approved').length;
    const duplicateCount = runResults.filter((item) => item.status === 'duplicate').length;
    const errorCount = runResults.filter((item) => item.status === 'error').length;

    refreshGroups(nextRecords);
    setLastBulkRun(runResults);
    setProcessing(false);

    if (approvedCount > 0 && duplicateCount === 0 && errorCount === 0) {
      setToast({
        message: `✅ Успішно підтверджено ${approvedCount} записів.`,
        type: 'success',
      });
      return;
    }

    setToast({
      message:
        `Обробку завершено. Підтверджено: ${approvedCount}. ` +
        `Дублікатів: ${duplicateCount}. Помилок: ${errorCount}.`,
      type: errorCount > 0 ? 'error' : 'success',
    });
  };

  if (loading || userLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
          <p className="text-gray-900 dark:text-white text-[16px]">Завантаження...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-4">
          <p className="text-red-600 dark:text-red-400 text-center text-[18px] font-medium">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          <AdminSectionTabs
            title={APPROVE_SECTION_TITLE}
            tabs={withCount(APPROVE_TABS, '/admin_approve_mass', records.length)}
            activeHref="/admin_approve_mass"
            description="Оберіть автора, перегляньте зведення по його записах і підтвердьте їх однією дією з тією ж логікою перевірок, що й на сторінці поштучного підтвердження."
          />

          <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-[20px]">
            <aside className="space-y-[20px]">
              <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <ShieldCheck className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />
                  <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold">
                    Superuser
                  </h2>
                </div>

                {superRoleAuthors.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-300 text-[14px]">Немає записів від користувачів з цими ролями.</p>
                ) : (
                  <div className="space-y-[10px]">
                    {superRoleAuthors.map((author) => (
                      <AuthorCard
                        key={author.key}
                        author={author}
                        selected={author.key === selectedAuthorKey}
                        onSelect={() => setSelectedAuthorKey(author.key)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <Shield className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />
                  <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold">
                    Admin
                  </h2>
                </div>

                {adminRoleAuthors.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-300 text-[14px]">Немає записів від користувачів з роллю admin.</p>
                ) : (
                  <div className="space-y-[10px]">
                    {adminRoleAuthors.map((author) => (
                      <AuthorCard
                        key={author.key}
                        author={author}
                        selected={author.key === selectedAuthorKey}
                        onSelect={() => setSelectedAuthorKey(author.key)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                <div className="flex items-center gap-[10px] mb-[15px]">
                  <UserRound className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />
                  <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold">
                    Інші автори
                  </h2>
                </div>

                {otherAuthors.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-300 text-[14px]">Інших авторів без спеціальної ролі немає.</p>
                ) : (
                  <div className="space-y-[10px]">
                    {otherAuthors.map((author) => (
                      <AuthorCard
                        key={author.key}
                        author={author}
                        selected={author.key === selectedAuthorKey}
                        onSelect={() => setSelectedAuthorKey(author.key)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>

            <section className="space-y-[20px]">
              {!selectedAuthor ? (
                <div className="p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                  <p className="text-gray-700 dark:text-gray-300 text-[16px]">Немає записів для масового підтвердження.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-[15px] p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                    <div>
                      <p className="text-gray-700 dark:text-gray-300 text-[14px] mb-[6px]">Обраний автор</p>
                      <div className="flex flex-wrap items-center gap-[10px]">
                        <span className="text-gray-900 dark:text-white text-[18px] lg:text-[20px] font-semibold">
                          {selectedAuthor.email}
                        </span>
                        {selectedAuthor.role && (
                          <span className="inline-flex items-center rounded-full px-[10px] py-[4px] bg-[#DBEAFE] dark:bg-[#1D4ED8]/30 text-[#1D4ED8] dark:text-[#BFDBFE] text-[12px] font-semibold">
                            {selectedAuthor.role}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handleBulkApprove}
                      disabled={processing || selectedRecords.length === 0}
                      className="inline-flex items-center justify-center gap-[10px] px-[16px] h-[44px] rounded bg-[#14AE5C] hover:bg-[#0F8A4A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCheck className="w-4 h-4 text-white" strokeWidth={1.8} />
                      <span className="text-white text-[14px] lg:text-[16px] font-medium">
                        {processing ? 'Підтвердження триває...' : 'Підтвердити всі'}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
                    <SummaryCard
                      icon={<FileStack className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />}
                      title="Всього записів додано"
                      value={selectedRecords.length}
                      description={`З них зі сканами: ${recordsWithScans}`}
                    />
                    <SummaryCard
                      icon={<Shield className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />}
                      title="Статус автора"
                      value={selectedAuthor.role || 'Без спеціальної ролі'}
                      description={selectedAuthor.canApproveWithoutConfirm ? 'Масове підтвердження без додаткового попапу' : undefined}
                    />
                  </div>

                  <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                    <div className="flex items-center gap-[10px] mb-[15px]">
                      <FolderTree className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />
                      <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold">
                        За сучасним адмінподілом
                      </h2>
                    </div>

                    {divisionStats.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-300 text-[14px]">Немає даних для побудови розбивки.</p>
                    ) : (
                      <div className="space-y-[12px]">
                        {divisionStats.map((region) => (
                          <div key={region.name} className="rounded-lg border border-gray-200 dark:border-[#374151] bg-white dark:bg-[#111827] p-[15px]">
                            <div className="flex items-center justify-between gap-[12px]">
                              <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-semibold">
                                {region.name}
                              </p>
                              <CountBadge count={region.count} />
                            </div>

                            <div className="mt-[12px] space-y-[10px]">
                              {region.districts.map((district) => (
                                <div key={`${region.name}-${district.name}`} className="pl-[14px] border-l-2 border-[#BFDBFE] dark:border-[#1D4ED8]">
                                  <div className="flex items-center justify-between gap-[12px]">
                                    <p className="text-gray-800 dark:text-gray-100 text-[14px] font-medium">{district.name}</p>
                                    <CountBadge count={district.count} />
                                  </div>

                                  <div className="mt-[8px] flex flex-wrap gap-[8px]">
                                    {district.communities.map((community) => (
                                      <span
                                        key={`${district.name}-${community.name}`}
                                        className="inline-flex items-center gap-[8px] rounded-full px-[10px] py-[5px] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 text-[#1E40AF] dark:text-[#BFDBFE] text-[12px]"
                                      >
                                        <span>{community.name}</span>
                                        <strong>{community.count}</strong>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                    <div className="flex items-center gap-[10px] mb-[15px]">
                      <FileStack className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={1.8} />
                      <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold">
                        За сигнатурами справ
                      </h2>
                    </div>

                    {signatureStats.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-300 text-[14px]">Немає даних для розбивки за сигнатурами.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                        {signatureStats.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between gap-[12px] rounded-lg border border-gray-200 dark:border-[#374151] bg-white dark:bg-[#111827] px-[14px] py-[12px]"
                          >
                            <p className="text-gray-900 dark:text-white text-[14px] break-all">{item.name}</p>
                            <CountBadge count={item.count} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {lastBulkRun.length > 0 && (
                    <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
                      <h2 className="text-gray-900 dark:text-white text-[18px] font-semibold mb-[15px]">
                        Результат останнього запуску
                      </h2>

                      <div className="space-y-[10px] max-h-[360px] overflow-y-auto pr-[4px]">
                        {lastBulkRun.map((item) => (
                          <div
                            key={`${item.recordId}-${item.status}`}
                            className="rounded-lg border border-gray-200 dark:border-[#374151] bg-white dark:bg-[#111827] px-[14px] py-[12px]"
                          >
                            <div className="flex flex-wrap items-center gap-[10px] mb-[6px]">
                              <span className="text-gray-900 dark:text-white text-[13px] font-semibold">
                                ID: {item.recordId}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-[10px] py-[4px] text-[12px] font-semibold ${
                                  item.status === 'approved'
                                    ? 'bg-[#DCFCE7] text-[#166534] dark:bg-[#14532D] dark:text-[#BBF7D0]'
                                    : item.status === 'duplicate'
                                      ? 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]'
                                      : 'bg-[#FEE2E2] text-[#991B1B] dark:bg-[#7F1D1D] dark:text-[#FECACA]'
                                }`}
                              >
                                {item.status === 'approved'
                                  ? 'Підтверджено'
                                  : item.status === 'duplicate'
                                    ? 'Дублікат'
                                    : 'Помилка'}
                              </span>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-[14px]">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

function AuthorCard({
  author,
  selected,
  onSelect,
}: {
  author: AuthorGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-[14px] py-[12px] transition-colors ${
        selected
          ? 'border-[#2563EB] bg-[#EFF6FF] dark:border-[#60A5FA] dark:bg-[#1E3A8A]/30'
          : 'border-gray-200 bg-white hover:bg-gray-100 dark:border-[#374151] dark:bg-[#111827] dark:hover:bg-[#182033]'
      }`}
      type="button"
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <p className="text-gray-900 dark:text-white text-[14px] font-medium break-all">{author.email}</p>
          {author.role && (
            <p className="text-[#2563EB] dark:text-[#93C5FD] text-[12px] mt-[4px]">
              Роль: {author.role}
            </p>
          )}
        </div>
        <CountBadge count={author.records.length} />
      </div>
    </button>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  description,
}: {
  icon: ReactNode;
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937]">
      <div className="flex items-center gap-[10px] mb-[12px]">
        {icon}
        <h2 className="text-gray-900 dark:text-white text-[17px] font-semibold">{title}</h2>
      </div>
      <p className="text-gray-900 dark:text-white text-[28px] lg:text-[32px] font-bold mb-[8px]">{value}</p>
      {description && (
        <p className="text-gray-700 dark:text-gray-300 text-[14px] lg:text-[15px]">{description}</p>
      )}
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[34px] h-[28px] rounded-full px-[10px] bg-[#E5E7EB] dark:bg-[#374151] text-gray-900 dark:text-white text-[13px] font-semibold">
      {count}
    </span>
  );
}
