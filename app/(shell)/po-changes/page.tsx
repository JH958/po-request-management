/**
 * PO 변경 페이지 — 기간별 변경 이벤트, 분할/합배송·품목코드 변경 후보 확인, 재등록 대기 (관리자 전용)
 */
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PoChangesFilterBar } from '@/components/po-changes/PoChangesFilterBar';
import { PoChangesSummaryCards } from '@/components/po-changes/PoChangesSummaryCards';
import { ReviewQueue } from '@/components/po-changes/ReviewQueue';
import { ChangeEventsTable } from '@/components/po-changes/ChangeEventsTable';
import { PendingLinesTable } from '@/components/po-changes/PendingLinesTable';
import { useAuth } from '@/hooks/use-auth';
import { usePoChanges } from '@/hooks/use-po-changes';
import { useLanguage } from '@/context/LanguageContext';
import { canAccessAdminSettings } from '@/lib/dashboard-scope';
import { reviewChangeGroup } from '@/lib/po-changes-api';
import { countStatUnits, filterEvents, filterGroups, getDefaultRange, isIsoDate } from '@/lib/po-changes-utils';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { cn } from '@/lib/utils';
import type { ChangeGroupStatus, PoChangeFilters } from '@/types/po-changes';

type PoChangesTab = 'review' | 'events' | 'pending';

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
  </div>
);

/**
 * 페이지 본문 (useSearchParams 사용으로 Suspense 안에서 렌더링)
 */
const PoChangesContent = ({ userId }: { userId: string }) => {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  // 업로드 이력에서 들어오면 그 기준일 하루, 아니면 최근 7일
  const [filters, setFilters] = useState<PoChangeFilters>(() => {
    const range = isIsoDate(dateParam) ? { from: dateParam, to: dateParam } : getDefaultRange();
    return { ...range, changeType: 'all', productClass: 'all', search: '', includeExcluded: false };
  });
  const [tab, setTab] = useState<PoChangesTab>('review');

  const { events, groups, changeTypes, pendingLines, uploadDays, loading, error, refresh } = usePoChanges(filters.from, filters.to);

  const visibleEvents = useMemo(() => filterEvents(events, filters), [events, filters]);
  const visibleGroups = useMemo(() => filterGroups(groups, filters), [groups, filters]);
  const statCount = useMemo(() => countStatUnits(visibleEvents), [visibleEvents]);
  const reviewCount = visibleGroups.filter((g) => g.status === 'pending').length;
  const newOrders = uploadDays
    .filter((d) => d.snapshot_date >= filters.from && d.snapshot_date <= filters.to)
    .reduce((sum, d) => sum + d.new_orders, 0);

  const handleReview = async (groupId: string, status: ChangeGroupStatus, note: string | null) => {
    try {
      await reviewChangeGroup(groupId, status, note);
      toast.success(
        status === 'approved'
          ? t('승인했습니다.', 'Approved.')
          : status === 'rejected'
            ? t('반려했습니다.', 'Rejected.')
            : t('확인 전으로 되돌렸습니다.', 'Moved back to review.')
      );
      await refresh();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('후보 묶음 처리 실패:', err);
      }
      toast.error(t('처리하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
    }
  };

  const tabs: { id: PoChangesTab; label: string }[] = [
    { id: 'review', label: t(`확인 필요 ${reviewCount}`, `To review ${reviewCount}`) },
    { id: 'events', label: t(`변경 이벤트 ${visibleEvents.length}`, `Change events ${visibleEvents.length}`) },
    { id: 'pending', label: t(`재등록 대기 ${pendingLines.length}`, `Pending re-registration ${pendingLines.length}`) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('PO 변경', 'PO Changes')}
        description={t(
          'DO 비교로 찾아낸 PO 변경을 확인하고, 분할/합배송·품목코드 변경 후보를 승인하거나 반려합니다.',
          'Review PO changes detected from DO comparisons and approve or reject split shipment and item code candidates.'
        )}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {t('새로고침', 'Refresh')}
          </Button>
        }
      />

      <PoChangesFilterBar filters={filters} uploadDays={uploadDays} changeTypes={changeTypes} onChange={setFilters} />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <PoChangesSummaryCards
        changeCount={statCount}
        reviewCount={reviewCount}
        newOrders={newOrders}
        pendingCount={pendingLines.length}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((item) => (
          <Button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            variant="outline"
            className={cn(
              'h-10 rounded-xl border-[#D6DDE7] bg-white px-5 font-semibold text-[#5A6778] shadow-none hover:bg-[#F8FAFC] hover:text-[#253143]',
              tab === item.id && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white'
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {loading && events.length === 0 ? (
        <Spinner />
      ) : tab === 'review' ? (
        <ReviewQueue groups={visibleGroups} currentUserId={userId} onReview={handleReview} />
      ) : tab === 'events' ? (
        <ChangeEventsTable events={visibleEvents} changeTypes={changeTypes} statCount={statCount} from={filters.from} to={filters.to} />
      ) : (
        <PendingLinesTable lines={pendingLines} />
      )}
    </div>
  );
};

export default function PoChangesPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const hasAccess = profile && canAccessAdminSettings(profile.department, profile.role);

  useEffect(() => {
    if (!loading && profile && !hasAccess) {
      router.replace('/');
    }
  }, [loading, profile, hasAccess, router]);

  if (loading || !user || !profile) return <Spinner />;
  if (!hasAccess) return null;

  return (
    <Suspense fallback={<Spinner />}>
      <PoChangesContent userId={user.id} />
    </Suspense>
  );
}
