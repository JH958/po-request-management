/**
 * 관리자용 PO 현황 대시보드
 */
'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { FrozenDateChart } from '@/components/dashboard/FrozenDateChart';
import { RequestHistoryTable } from '@/components/request/RequestHistoryTable';
import { useAllRequests } from '@/hooks/use-requests';
import { applyDashboardScope } from '@/lib/dashboard-scope';
import {
  filterRequestsByLocation,
  filterRequestsByPeriod,
  calculateChartStatistics,
} from '@/lib/request-helpers';

interface AdminDashboardProps {
  department?: string;
  role?: string;
}

export const AdminDashboard = (_props: AdminDashboardProps) => {
  const { requests: allRequests, loading, fetchAllRequests } = useAllRequests();
  const [locationFilter, setLocationFilter] = useState<'all' | 'customer' | 'headquarters'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [showAllDeptCounts, setShowAllDeptCounts] = useState(false);

  const handleLocationFilterChange = (v: 'all' | 'customer' | 'headquarters') => {
    setLocationFilter(v);
    setShowAllDeptCounts(false);
  };

  const handlePeriodFilterChange = (v: 'all' | 'daily' | 'weekly' | 'monthly') => {
    setPeriodFilter(v);
    setShowAllDeptCounts(false);
  };

  const scopedRequests = useMemo(
    () => applyDashboardScope(allRequests, { scope: 'all' }),
    [allRequests]
  );

  const filteredChartRequests = useMemo(() => {
    let filtered = scopedRequests;
    filtered = filterRequestsByLocation(filtered, locationFilter);
    filtered = filterRequestsByPeriod(filtered, periodFilter);
    return filtered;
  }, [scopedRequests, locationFilter, periodFilter]);

  const chartStats = useMemo(
    () => calculateChartStatistics(filteredChartRequests),
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#101820]">
          PO 현황 <ClipboardList className="ml-1 inline-block size-7 text-[#971B2F]" />
        </h1>
        <p className="mt-1 text-[#67767F]">전체 요청 현황을 관리합니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="전체 요청" value={stats.total} subtitle="전체 건수" icon={<ClipboardList className="h-8 w-8 text-[#971B2F]" />} themeColor="#A2B2C8" />
        <StatsCard title="검토 대기" value={stats.pending} subtitle="대기 중" icon={<Clock className="h-8 w-8 text-[#67767F]" />} themeColor="#67767F" />
        <StatsCard title="승인" value={stats.approved} subtitle="승인 완료" icon={<CheckCircle2 className="h-8 w-8 text-[#A2B2C8]" />} themeColor="#A2B2C8" />
        <StatsCard title="반려" value={stats.rejected} subtitle="반려 처리" icon={<XCircle className="h-8 w-8 text-[#971B2F]" />} themeColor="#971B2F" />
      </div>

      <div>
        <div className="mb-4 flex items-center justify-end gap-4">
          <p className="text-sm text-[#67767F]">전체 {scopedRequests.length}건</p>
          <Button variant="outline" size="sm" onClick={() => void fetchAllRequests()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        <DashboardCharts
          statusStats={chartStats.statusStats}
          categoryStats={chartStats.categoryStats}
          reasonStats={chartStats.reasonStats}
          departmentStats={chartStats.departmentStats}
          showLocationFilter
          locationFilter={locationFilter}
          onLocationFilterChange={handleLocationFilterChange}
          periodFilter={periodFilter}
          onPeriodFilterChange={handlePeriodFilterChange}
          filteredCount={filteredChartRequests.length}
          showAllDeptCounts={showAllDeptCounts}
          onToggleDeptCounts={() => setShowAllDeptCounts((v) => !v)}
          isAdminView
        />

        <FrozenDateChart requests={filteredChartRequests} />
      </div>

      <RequestHistoryTable
        requests={scopedRequests}
        loading={loading}
        showExcelExport
        title="요청 접수 내역"
      />
    </div>
  );
};
