/**
 * 프로즌 데이트 도넛 차트 컴포넌트
 */
'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FROZEN_STATUS_LABELS } from '@/lib/frozen-date-labels';
import type { PORequest } from '@/types/request';
import type { FrozenStatus } from '@/types/frozen-date';

interface FrozenDateChartProps {
  requests: PORequest[];
}

const CHART_COLORS: Record<FrozenStatus, string> = {
  before: '#22C55E',
  after: '#EF4444',
  unset: '#9CA3AF',
};

export const FrozenDateChart = ({ requests }: FrozenDateChartProps) => {
  const chartData = useMemo(() => {
    const counts: Record<FrozenStatus, number> = { before: 0, after: 0, unset: 0 };
    requests.forEach((r) => {
      const status = (r.frozen_status ?? 'unset') as FrozenStatus;
      counts[status] += 1;
    });

    const total = requests.length || 1;
    return (['before', 'after', 'unset'] as const).map((key) => ({
      name: FROZEN_STATUS_LABELS[key],
      key,
      value: counts[key],
      percentage: Math.round((counts[key] / total) * 100),
    }));
  }, [requests]);

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border bg-gray-50 p-8 text-center text-sm text-[#67767F]">
        프로즌 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6" data-tour="po-status-frozen-chart">
      <h3 className="mb-3 text-lg font-semibold text-[#101820]">프로즌 여부 분석</h3>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={4}
            dataKey="value"
          >
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={CHART_COLORS[entry.key]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload as (typeof chartData)[number];
              return (
                <div className="rounded-lg border bg-white p-3 shadow-lg">
                  <p className="font-semibold text-[#101820]">{data.name}</p>
                  <p className="text-sm text-[#971B2F]">{data.value}건 ({data.percentage}%)</p>
                </div>
              );
            }}
          />
          <Legend
            formatter={(value, entry) => {
              const data = (entry as { payload?: (typeof chartData)[number] }).payload;
              return data ? `${value}: ${data.value}건` : value;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-4 text-sm text-[#67767F]">
        {chartData.map((d) => (
          <span key={d.key}>
            {d.name}: <strong className="text-[#101820]">{d.value}</strong>건
          </span>
        ))}
      </div>
    </div>
  );
};
