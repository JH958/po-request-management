/**
 * 대시보드 공통 차트 컴포넌트
 */
'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  truncateChartLabel,
  type ChartData,
  type StatusData,
} from '@/lib/request-helpers';

interface DashboardChartsProps {
  statusStats: StatusData[];
  categoryStats: ChartData[];
  reasonStats: ChartData[];
  departmentStats?: ChartData[];
  monthlyStats?: ChartData[];
  productCategoryStats?: ChartData[];
  showLocationFilter?: boolean;
  locationFilter?: 'all' | 'customer' | 'headquarters';
  onLocationFilterChange?: (v: 'all' | 'customer' | 'headquarters') => void;
  periodFilter: 'all' | 'daily' | 'weekly' | 'monthly';
  onPeriodFilterChange: (v: 'all' | 'daily' | 'weekly' | 'monthly') => void;
  filteredCount: number;
  showAllDeptCounts?: boolean;
  onToggleDeptCounts?: () => void;
  isAdminView?: boolean;
}

export const DashboardCharts = ({
  statusStats,
  categoryStats,
  reasonStats,
  departmentStats = [],
  monthlyStats = [],
  productCategoryStats = [],
  showLocationFilter = false,
  locationFilter = 'all',
  onLocationFilterChange,
  periodFilter,
  onPeriodFilterChange,
  filteredCount,
  showAllDeptCounts = false,
  onToggleDeptCounts,
  isAdminView = false,
}: DashboardChartsProps) => {
  const hasData = filteredCount > 0;

  const deptChartData = useMemo(
    () => (showAllDeptCounts ? departmentStats : departmentStats.slice(0, 5)),
    [departmentStats, showAllDeptCounts]
  );

  if (!hasData) {
    return (
      <div className="rounded-lg border bg-gray-50 p-12 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        <p className="text-gray-600">필터 조건에 맞는 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            {showLocationFilter && onLocationFilterChange && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm font-semibold text-[#67767F]">구분</Label>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'customer', 'headquarters'] as const).map((f) => (
                    <Button
                      key={f}
                      variant={locationFilter === f ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onLocationFilterChange(f)}
                    >
                      {f === 'all' ? '전체' : f === 'customer' ? '고객처' : '본사'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm font-semibold text-[#67767F]">기간</Label>
              <div className="flex flex-wrap gap-1">
                {(['all', 'daily', 'weekly', 'monthly'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={periodFilter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPeriodFilterChange(f)}
                  >
                    {f === 'all' ? '전체' : f === 'daily' ? '일별' : f === 'weekly' ? '주별' : '월별'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-[#67767F]">
            필터 결과: <span className="font-semibold text-[#971B2F]">{filteredCount}</span>건
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 승인/반려 비율 */}
        <div>
          <h3 className="mb-3 text-lg font-semibold text-[#101820]">승인/반려 비율</h3>
          <div className="rounded-lg border bg-white p-6">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <defs>
                  <linearGradient id="gradApproved" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#971B2F" />
                    <stop offset="100%" stopColor="#C9485E" />
                  </linearGradient>
                  <linearGradient id="gradRejected" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4B4F5A" />
                    <stop offset="100%" stopColor="#767B88" />
                  </linearGradient>
                  <linearGradient id="gradPending" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#A2B2C8" />
                    <stop offset="100%" stopColor="#C8D4E2" />
                  </linearGradient>
                </defs>
                <Pie
                  data={statusStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={false}
                >
                  {statusStats.map((entry, index) => {
                    const gradients: Record<string, string> = {
                      승인: 'url(#gradApproved)',
                      반려: 'url(#gradRejected)',
                      대기: 'url(#gradPending)',
                    };
                    const solidColors: Record<string, string> = {
                      승인: '#971B2F',
                      반려: '#4B4F5A',
                      대기: '#A2B2C8',
                    };
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={gradients[entry.name] || '#6B7280'}
                        stroke={solidColors[entry.name] || '#6B7280'}
                        strokeWidth={1}
                      />
                    );
                  })}
                </Pie>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as StatusData;
                      return (
                        <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                          <p className="mb-1 font-bold text-[#101820]">{data.name}</p>
                          <p className="text-sm font-semibold text-[#971B2F]">{data.value}건</p>
                          <p className="text-xs text-[#67767F]">전체의 {data.percentage}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={50}
                  iconType="circle"
                  formatter={(value, entry) => {
                    const data = (entry as unknown as { payload: StatusData }).payload;
                    return `${value}: ${data.value}건 (${data.percentage}%)`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 요청 건수 분석 (관리자) 또는 월별 추이 (일반) */}
        <div>
          <h3 className="mb-3 text-lg font-semibold text-[#101820]">
            {isAdminView ? '요청 건수' : '월별 추이'}
          </h3>
          <div className="rounded-lg border bg-white p-6">
            {isAdminView && onToggleDeptCounts && (
              <div className="mb-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={onToggleDeptCounts}>
                  {showAllDeptCounts ? '상위 5개만 보기' : '전체보기'}
                </Button>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={isAdminView ? deptChartData : monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fill: '#4B4F5A', fontSize: 11 }}
                  tickFormatter={(v) => truncateChartLabel(String(v), 15)}
                />
                <YAxis tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                          <p className="mb-1 font-bold text-[#101820]">
                            {(payload[0].payload as ChartData).name}
                          </p>
                          <p className="text-sm font-semibold text-[#971B2F]">{payload[0].value}건</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" fill="#971B2F" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 요청 구분별 */}
        <div>
          <h3 className="mb-3 text-lg font-semibold text-[#101820]">요청 구분별 분석</h3>
          <div className="rounded-lg border bg-white p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryStats} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={(props: { x: number; y: number; payload: { value: string } }) => (
                    <g transform={`translate(${props.x},${props.y})`}>
                      <text x={-112} y={0} dy="0.35em" textAnchor="start" fill="#4B4F5A" fontSize={11}>
                        {truncateChartLabel(String(props.payload.value), 14)}
                      </text>
                    </g>
                  )}
                />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#4B4F5A" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 요청 사유별 또는 품목구분별 추이 */}
        <div>
          <h3 className="mb-3 text-lg font-semibold text-[#101820]">
            {isAdminView ? '요청 사유별 분석' : '품목구분별 추이'}
          </h3>
          <div className="rounded-lg border bg-white p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={isAdminView ? reasonStats : productCategoryStats}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={(props: { x: number; y: number; payload: { value: string } }) => (
                    <g transform={`translate(${props.x},${props.y})`}>
                      <text x={-112} y={0} dy="0.35em" textAnchor="start" fill="#4B4F5A" fontSize={11}>
                        {truncateChartLabel(String(props.payload.value), 14)}
                      </text>
                    </g>
                  )}
                />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#67767F" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
};
