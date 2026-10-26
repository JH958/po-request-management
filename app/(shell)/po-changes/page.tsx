/**
 * PO 변경 페이지 — 기간별 변경 이벤트·사유 입력, 분할/합배송·품목코드 변경 후보 확인, 요청 연결·요청 없는 변경, 재등록 대기 (영업관리팀·관리자)
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
import { ReasonDialog } from '@/components/po-changes/ReasonDialog';
import { RequestLinkDialog } from '@/components/po-changes/RequestLinkDialog';
import { UnregisteredQueue } from '@/components/po-changes/UnregisteredQueue';
import { useAuth } from '@/hooks/use-auth';
import { usePoChanges } from '@/hooks/use-po-changes';
import { useLanguage } from '@/context/LanguageContext';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { isSalesTeam } from '@/lib/dashboard-scope';
import {
  clearChangeReasons,
  dismissChanges,
  restoreChanges,
  reviewChangeGroup,
  setChangeReasons,
  setChangeTypes,
  hasManagedCustomers,
  setOrderDestination,
} from '@/lib/po-changes-api';
import {
  clearChangeExemptions,
  linkChangeRequest,
  rematchChangeRequests,
  setChangeExemptions,
  unlinkChangeRequest,
} from '@/lib/po-request-links-api';
import {
  REASON_FILTER_MISSING,
  countMissingReasons,
  countRegistration,
  countStatUnits,
  filterEvents,
  filterGroups,
  getDefaultRange,
  isIsoDate,
  type PoStatUnit,
} from '@/lib/po-changes-utils';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { cn } from '@/lib/utils';
import type { ChangeGroupStatus, ChangeReasonInput, ChangeRequestLink, MatchCandidate, PoChangeFilters } from '@/types/po-changes';

type PoChangesTab = 'review' | 'events' | 'unregistered' | 'pending';

/**
 * 변경 1건 키별로 묶기
 */
const groupByKey = <T,>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  });
  return map;
};

/** "내 담당 고객처만" 선택 기억 (브라우저별 편의 기능) */
const MINE_ONLY_KEY = 'purchaseOnPoChangesMineOnly';

/**
 * 저장된 "내 담당 고객처만" 선택 — 한 번도 고르지 않았으면 null (담당 고객처가 있으면 켠 채로 시작)
 */
const readMineOnly = (): boolean | null => {
  try {
    const value = window.localStorage.getItem(MINE_ONLY_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
};

const writeMineOnly = (value: boolean) => {
  try {
    window.localStorage.setItem(MINE_ONLY_KEY, value ? '1' : '0');
  } catch {
    // 저장소를 쓸 수 없으면 기억만 하지 않음
  }
};

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
  </div>
);

/**
 * 페이지 본문 (useSearchParams 사용으로 Suspense 안에서 렌더링)
 */
const PoChangesContent = ({ userId, userEmail }: { userId: string; userEmail: string | null }) => {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  // PO 현황 막대에서 들어오면 기간·조건(유형·고객처·사유·출처)을 그대로
  const drill = {
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    type: searchParams.get('type'),
    customer: searchParams.get('customer'),
    reason: searchParams.get('reason'),
    origin: searchParams.get('origin'),
  };
  const fromDashboard = isIsoDate(drill.from) && isIsoDate(drill.to);

  // 업로드 이력에서 들어오면 그 기준일 하루, PO 현황에서 들어오면 그 기간, 아니면 최근 7일
  const [filters, setFilters] = useState<PoChangeFilters>(() => {
    const range = fromDashboard
      ? { from: drill.from as string, to: drill.to as string }
      : isIsoDate(dateParam)
        ? { from: dateParam, to: dateParam }
        : getDefaultRange();
    return {
      ...range,
      changeType: fromDashboard && drill.type ? drill.type : 'all',
      productClass: 'all',
      search: fromDashboard && drill.customer ? drill.customer : '',
      includeExcluded: false,
      // PO 현황에서 들어오면 전체 고객처 기준으로 보여 줌
      myEmail: !fromDashboard && readMineOnly() === true ? userEmail : null,
      reasonFilter: fromDashboard && drill.reason ? drill.reason : 'all',
      originFilter: fromDashboard && drill.origin ? drill.origin : 'all',
      includeDismissed: false,
      registrationFilter: 'all',
    };
  });
  const [tab, setTab] = useState<PoChangesTab>(fromDashboard ? 'events' : 'review');
  const [reasonUnits, setReasonUnits] = useState<PoStatUnit[] | null>(null);
  const [linkUnit, setLinkUnit] = useState<PoStatUnit | null>(null);

  // 처음 여는 사람(선택 기록 없음)이 담당 고객처가 있으면 "내 담당 고객처만"을 켠 채로 시작
  useEffect(() => {
    if (fromDashboard || !userEmail || readMineOnly() !== null) return;
    let cancelled = false;
    void hasManagedCustomers(userEmail).then((has) => {
      if (!cancelled && has) setFilters((prev) => ({ ...prev, myEmail: userEmail }));
    });
    return () => {
      cancelled = true;
    };
  }, [fromDashboard, userEmail]);
  const { requestReasons } = useRequestConfig();

  const { events, groups, changeTypes, origins, pendingLines, uploadDays, links, candidates, unreflected, loading, error, refresh } =
    usePoChanges(filters.from, filters.to);
  const linksByUnit = useMemo(() => groupByKey<ChangeRequestLink>(links, (l) => l.unit_key), [links]);
  const candidatesByUnit = useMemo(() => groupByKey<MatchCandidate>(candidates, (c) => c.stat_unit_key), [candidates]);

  const visibleEvents = useMemo(() => filterEvents(events, filters), [events, filters]);
  const visibleGroups = useMemo(() => filterGroups(groups, filters), [groups, filters]);
  const statCount = useMemo(() => countStatUnits(visibleEvents), [visibleEvents]);
  // 사유 미입력 건수는 사유 필터와 관계없이 (다른 필터는 적용)
  const missingReasonCount = useMemo(
    () => countMissingReasons(filterEvents(events, { ...filters, reasonFilter: 'all' })),
    [events, filters]
  );
  const reviewCount = visibleGroups.filter((g) => g.status === 'pending').length;
  // 사전 요청률·요청 없는 변경은 요청 연결 필터와 관계없이 (다른 필터는 적용)
  const eventsAnyRegistration = useMemo(() => filterEvents(events, { ...filters, registrationFilter: 'all' }), [events, filters]);
  const registration = useMemo(() => countRegistration(eventsAnyRegistration), [eventsAnyRegistration]);
  const newOrders = uploadDays
    .filter((d) => d.snapshot_date >= filters.from && d.snapshot_date <= filters.to)
    .reduce((sum, d) => sum + d.new_orders, 0);

  const handleReview = async (
    groupId: string,
    status: ChangeGroupStatus,
    note: string | null,
    reason?: ChangeReasonInput | null,
    typeCode?: string | null
  ) => {
    try {
      await reviewChangeGroup(groupId, status, note, reason, typeCode);
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

  /**
   * 사유 저장 — 성공하면 true (창 닫기)
   */
  const handleSaveReasons = async (keys: string[], input: ChangeReasonInput): Promise<boolean> => {
    try {
      const count = await setChangeReasons(keys, input);
      toast.success(t(`변경 ${count}건의 사유를 저장했습니다.`, `Saved the reason for ${count} changes.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('변경 사유 저장 실패:', err);
      }
      toast.error(t('사유를 저장하지 못했습니다.', 'Could not save the reason.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 변경 유형 고치기 — 성공하면 true
   */
  const handleSetTypes = async (keys: string[], typeCode: string): Promise<boolean> => {
    try {
      const count = await setChangeTypes(keys, typeCode);
      toast.success(t(`변경 ${count}건의 유형을 저장했습니다.`, `Saved the type for ${count} changes.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('변경 유형 저장 실패:', err);
      }
      toast.error(t('변경 유형을 저장하지 못했습니다.', 'Could not save the change type.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 사유 지우기 — 성공하면 true (창 닫기)
   */
  const handleClearReasons = async (keys: string[]): Promise<boolean> => {
    try {
      const count = await clearChangeReasons(keys);
      toast.success(t(`변경 ${count}건의 사유를 지웠습니다.`, `Cleared the reason on ${count} changes.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('변경 사유 지우기 실패:', err);
      }
      toast.error(t('사유를 지우지 못했습니다.', 'Could not clear the reason.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * "변경 아님(정정)" 처리 — 성공하면 true (창 닫기)
   */
  const handleDismiss = async (keys: string[], note: string): Promise<boolean> => {
    try {
      const count = await dismissChanges(keys, note);
      toast.success(t(`변경 ${count}건을 "변경 아님"으로 처리했습니다.`, `Marked ${count} as not a change.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('변경 아님 처리 실패:', err);
      }
      toast.error(t('처리하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * "변경 아님" 해제 — 성공하면 true (창 닫기)
   */
  const handleRestore = async (keys: string[]): Promise<boolean> => {
    try {
      const count = await restoreChanges(keys);
      toast.success(t(`변경 ${count}건을 다시 변경으로 셉니다.`, `${count} counted as changes again.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('변경 아님 해제 실패:', err);
      }
      toast.error(t('처리하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 요청과 변경 연결 — 성공하면 true
   */
  const handleLink = async (key: string, candidate: MatchCandidate, note: string): Promise<boolean> => {
    try {
      await linkChangeRequest(key, candidate.request_id, candidate.item_key, note);
      toast.success(t('요청과 연결했습니다.', 'Linked to the request.'));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 연결 실패:', err);
      }
      toast.error(t('연결하지 못했습니다.', 'Could not link.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 연결 해제 — 성공하면 true
   */
  const handleUnlink = async (linkId: string, note: string): Promise<boolean> => {
    try {
      await unlinkChangeRequest(linkId, note);
      toast.success(t('연결을 해제했습니다.', 'Unlinked.'));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 연결 해제 실패:', err);
      }
      toast.error(t('해제하지 못했습니다.', 'Could not unlink.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 예외 처리 — 성공하면 true
   */
  const handleExempt = async (keys: string[], note: string): Promise<boolean> => {
    try {
      const count = await setChangeExemptions(keys, note);
      toast.success(t(`변경 ${count}건을 예외 처리했습니다.`, `Exempted ${count} changes.`));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('예외 처리 실패:', err);
      }
      toast.error(t('처리하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 예외 처리 해제 — 성공하면 true
   */
  const handleClearExempt = async (keys: string[]): Promise<boolean> => {
    try {
      await clearChangeExemptions(keys);
      toast.success(t('예외 처리를 해제했습니다.', 'Exemption removed.'));
      await refresh();
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('예외 처리 해제 실패:', err);
      }
      toast.error(t('처리하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
      return false;
    }
  };

  /**
   * 다시 매칭 — 자동 연결 조건에 맞는 짝을 찾아 연결
   */
  const handleRematch = async () => {
    try {
      const count = await rematchChangeRequests();
      toast.success(
        count
          ? t(`새로 ${count}건을 자동 연결했습니다.`, `Auto-linked ${count} new changes.`)
          : t('새로 연결할 짝이 없습니다. 후보는 직접 골라 연결해주세요.', 'Nothing new to link. Pick candidates by hand.')
      );
      await refresh();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('다시 매칭 실패:', err);
      }
      toast.error(t('다시 매칭하지 못했습니다.', 'Could not match again.'), { description: getReadableErrorMessage(err) });
    }
  };

  /**
   * 경유 고객처 주문의 실제 고객처 지정·해제
   */
  const handleSetDestination = async (orderNo: string, target: string | null) => {
    try {
      await setOrderDestination(orderNo, target);
      toast.success(target ? t(`${orderNo} 실제 고객처: ${target}`, `${orderNo} actual customer: ${target}`) : t('실제 고객처 선택을 해제했습니다.', 'Cleared the actual customer.'));
      await refresh();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('실제 고객처 지정 실패:', err);
      }
      toast.error(t('지정하지 못했습니다.', 'Could not update.'), { description: getReadableErrorMessage(err) });
    }
  };

  const tabs: { id: PoChangesTab; label: string }[] = [
    { id: 'review', label: t(`확인 필요 ${reviewCount}`, `To review ${reviewCount}`) },
    { id: 'events', label: t(`변경 이벤트 ${statCount}`, `Change events ${statCount}`) },
    {
      id: 'unregistered',
      label: t(`요청 없는 변경 ${registration.unregistered + registration.waiting}`, `No request ${registration.unregistered + registration.waiting}`),
    },
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

      <PoChangesFilterBar
        filters={filters}
        uploadDays={uploadDays}
        changeTypes={changeTypes}
        origins={origins}
        reasons={requestReasons}
        userEmail={userEmail}
        onChange={(next) => {
          writeMineOnly(Boolean(next.myEmail));
          setFilters(next);
        }}
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <PoChangesSummaryCards
        changeCount={statCount}
        reviewCount={reviewCount}
        newOrders={newOrders}
        pendingCount={pendingLines.length}
        missingReasonCount={missingReasonCount}
        onShowMissingReasons={() => {
          setFilters({ ...filters, reasonFilter: REASON_FILTER_MISSING });
          setTab('events');
        }}
        registration={registration}
        onShowUnregistered={() => setTab('unregistered')}
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
        <ReviewQueue
          groups={visibleGroups}
          currentUserId={userId}
          reasons={requestReasons}
          origins={origins}
          changeTypes={changeTypes}
          onReview={handleReview}
        />
      ) : tab === 'events' ? (
        <ChangeEventsTable
          onEditReasons={setReasonUnits}
          onSetDestination={handleSetDestination}
          events={visibleEvents}
          changeTypes={changeTypes}
          statCount={statCount}
          from={filters.from}
          to={filters.to}
          linksByUnit={linksByUnit}
          candidatesByUnit={candidatesByUnit}
          onOpenLinks={setLinkUnit}
        />
      ) : tab === 'unregistered' ? (
        <UnregisteredQueue
          events={eventsAnyRegistration}
          candidatesByUnit={candidatesByUnit}
          unreflected={unreflected}
          changeTypes={changeTypes}
          onOpen={setLinkUnit}
          onLink={handleLink}
          onRematch={handleRematch}
        />
      ) : (
        <PendingLinesTable lines={pendingLines} />
      )}

      <ReasonDialog
        units={reasonUnits}
        reasons={requestReasons}
        origins={origins}
        changeTypes={changeTypes}
        onClose={() => setReasonUnits(null)}
        onSubmit={handleSaveReasons}
        onSetType={handleSetTypes}
        onClear={handleClearReasons}
        onDismiss={handleDismiss}
        onRestore={handleRestore}
      />

      <RequestLinkDialog
        unit={linkUnit}
        links={linkUnit ? linksByUnit.get(linkUnit.key) ?? [] : []}
        candidates={linkUnit ? candidatesByUnit.get(linkUnit.key) ?? [] : []}
        changeTypes={changeTypes}
        onClose={() => setLinkUnit(null)}
        onLink={handleLink}
        onUnlink={handleUnlink}
        onExempt={handleExempt}
        onClearExempt={handleClearExempt}
      />
    </div>
  );
};

export default function PoChangesPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const hasAccess = profile && isSalesTeam(profile.department, profile.role);

  useEffect(() => {
    if (!loading && profile && !hasAccess) {
      router.replace('/');
    }
  }, [loading, profile, hasAccess, router]);

  if (loading || !user || !profile) return <Spinner />;
  if (!hasAccess) return null;

  return (
    <Suspense fallback={<Spinner />}>
      <PoChangesContent userId={user.id} userEmail={user.email ?? null} />
    </Suspense>
  );
}
