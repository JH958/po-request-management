/**
 * 일반 계정용 PO 현황 대시보드
 */
'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { FrozenDateChart } from '@/components/dashboard/FrozenDateChart';
import { useAllRequests } from '@/hooks/use-requests';
import { applyDashboardScope } from '@/lib/dashboard-scope';
import {
  filterRequestsByPeriod,
  calculateChartStatistics,
  calculateMonthlyTrend,
  calculateProductCategoryTrend,
} from '@/lib/request-helpers';
import { PageHeader } from '@/components/common/PageHeader';
import { useLanguage } from '@/context/LanguageContext';

interface UserDashboardProps {
  department: string;
}

export const UserDashboard = ({ department }: UserDashboardProps) => {
  const { t } = useLanguage();
  const { requests: allRequests, loading } = useAllRequests();
  const [periodFilter, setPeriodFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');

  const scopedRequests = useMemo(
    () => applyDashboardScope(allRequests, { scope: 'own', department }),
    [allRequests, department]
  );

  const filteredChartRequests = useMemo(
    () => filterRequestsByPeriod(scopedRequests, periodFilter),
    [scopedRequests, periodFilter]
  );

  const chartStats = useMemo(
    () => calculateChartStatistics(filteredChartRequests),
    [filteredChartRequests]
  );

  const monthlyStats = useMemo(
    () => calculateMonthlyTrend(filteredChartRequests),
    [filteredChartRequests]
  );

  const productCategoryStats = useMemo(
    () => calculateProductCategoryTrend(filteredChartRequests),
    [filteredChartRequests]
  );

  const stats = useMemo(
    () => ({
      total: filteredChartRequests.length,
      pending: filteredChartRequests.filter((r) => r.status === 'pending').length,
      approved: filteredChartRequests.filter((r) => r.status === 'approved').length,
      rejected: filteredChartRequests.filter((r) => r.status === 'rejected').length,
    }),
    [filteredChartRequests]
  );

  if (loading && scopedRequests.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div data-tour="po-status-header">
        <PageHeader
          title={t('PO 현황', 'PO Status')}
          description={t(`${department} 소속 요청 현황을 확인합니다.`, `Requests from ${department}.`)}
        />

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard title={t('전체 요청', 'All requests')} value={stats.total} subtitle={t('소속 건수', 'My department')} icon={<ClipboardList className="h-8 w-8 text-[#8B1538]" />} themeColor="#A2B2C8" />
          <StatsCard title={t('검토 대기', 'Pending')} value={stats.pending} subtitle={t('대기 중', 'Awaiting review')} icon={<Clock className="h-8 w-8 text-[#5A6778]" />} themeColor="#5A6778" />
          <StatsCard title={t('승인', 'Approved')} value={stats.approved} subtitle={t('승인 완료', 'Approved')} icon={<CheckCircle2 className="h-8 w-8 text-[#A2B2C8]" />} themeColor="#A2B2C8" />
          <StatsCard title={t('반려', 'Rejected')} value={stats.rejected} subtitle={t('반려 처리', 'Rejected')} icon={<XCircle className="h-8 w-8 text-[#8B1538]" />} themeColor="#8B1538" />
        </div>
      </div>

      <DashboardCharts
        statusStats={chartStats.statusStats}
        categoryStats={chartStats.categoryStats}
        reasonStats={chartStats.reasonStats}
        monthlyStats={monthlyStats}
        productCategoryStats={productCategoryStats}
        periodFilter={periodFilter}
        onPeriodFilterChange={setPeriodFilter}
        filteredCount={filteredChartRequests.length}
        isAdminView={false}
      />

      <FrozenDateChart requests={filteredChartRequests} />
    </div>
  );
};
