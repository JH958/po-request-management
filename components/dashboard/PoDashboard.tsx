/**
 * PO 현황 대시보드 — 탭 2개(PO 변경 현황 / 요청 현황), 필터, 새로고침 (영업관리팀·관리자, 보기 전용)
 */
'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { ChangeStatusTab } from '@/components/dashboard/ChangeStatusTab';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { RequestStatusTab } from '@/components/dashboard/RequestStatusTab';
import { useLanguage } from '@/context/LanguageContext';
import { usePoDashboard } from '@/hooks/use-po-dashboard';
import { filterChangeRows, getCustomerGroup, getPresetRange } from '@/lib/po-dashboard-utils';
import { cn } from '@/lib/utils';
import type { DashboardFilters } from '@/types/po-dashboard';

type DashboardTab = 'changes' | 'requests';

export const PoDashboard = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<DashboardTab>('changes');
  const [filters, setFilters] = useState<DashboardFilters>(() => ({
    preset: 'month',
    ...getPresetRange('month'),
    customer: 'all',
    productClass: 'all',
    origin: 'all',
  }));
  const { changes, previousChanges, requests, changeTypes, loading, error, refresh } = usePoDashboard(filters.from, filters.to);

  const visibleChanges = useMemo(() => filterChangeRows(changes, filters, t), [changes, filters, t]);
  const visiblePrevious = useMemo(() => filterChangeRows(previousChanges, filters, t), [previousChanges, filters, t]);
  // 고객처 목록: 기간 안 건수 많은 순 (경유 고객처는 하나로)
  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    changes.forEach((r) => {
      const name = getCustomerGroup(r, t);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [changes, t]);

  const tabs: [DashboardTab, string][] = [
    ['changes', t('PO 변경 현황', 'PO changes')],
    ['requests', t('요청 현황', 'Requests')],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('PO 현황', 'PO Status')}
        description={t(
          'DO 비교로 찾아낸 PO 변경과 접수된 요청을 기간·고객처·요청 출처별로 봅니다.',
          'See detected PO changes and submitted requests by period, customer and requester.'
        )}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {t('새로고침', 'Refresh')}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant="outline"
            className={cn(
              'h-10 rounded-xl border-[#D6DDE7] bg-white px-5 font-semibold text-[#5A6778] shadow-none hover:bg-[#F8FAFC] hover:text-[#253143]',
              tab === key && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white'
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <DashboardFilterBar filters={filters} onChange={setFilters} customers={customers} showChangeFilters={tab === 'changes'} />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && changes.length === 0 && requests.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
        </div>
      ) : tab === 'changes' ? (
        <ChangeStatusTab rows={visibleChanges} previousRows={visiblePrevious} filters={filters} changeTypes={changeTypes} />
      ) : (
        <RequestStatusTab rows={requests} filters={filters} />
      )}
    </div>
  );
};
