/**
 * 프로즌 데이트 도넛 차트 컴포넌트
 */
'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getFrozenStatusLabels } from '@/lib/frozen-date-labels';
import { useLanguage } from '@/context/LanguageContext';
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
  const { t } = useLanguage();
  const countText = (n: number) => t(`${n}건`, `${n}`);

  const chartData = useMemo(() => {
    const labels = getFrozenStatusLabels(t);
    const counts: Record<FrozenStatus, number> = { before: 0, after: 0, unset: 0 };
    requests.forEach((r) => {
      const status = (r.frozen_status ?? 'unset') as FrozenStatus;
      counts[status] += 1;
    });

    const total = requests.length || 1;
    return (['before', 'after', 'unset'] as const).map((key) => ({
      name: labels[key],
      key,
      value: counts[key],
      percentage: Math.round((counts[key] / total) * 100),
    }));
  }, [requests, t]);

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border bg-gray-50 p-8 text-center text-sm text-[#5A6778]">
        {t('프로즌 데이터가 없습니다.', 'No frozen date data.')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6" data-tour="po-status-frozen-chart">
      <h3 className="mb-3 text-lg font-semibold text-[#172132]">{t('프로즌 여부 분석', 'Before / After Frozen Date')}</h3>
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
                  <p className="font-semibold text-[#172132]">{data.name}</p>
                  <p className="text-sm text-[#8B1538]">
                    {countText(data.value)} ({data.percentage}%)
                  </p>
                </div>
              );
            }}
          />
          <Legend
            formatter={(value, entry) => {
              const data = (entry as { payload?: (typeof chartData)[number] }).payload;
              return data ? `${value}: ${countText(data.value)}` : value;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-4 text-sm text-[#5A6778]">
        {chartData.map((d) => (
          <span key={d.key}>
            {d.name}: <strong className="text-[#172132]">{d.value}</strong>
            {t('건', '')}
          </span>
        ))}
      </div>
    </div>
  );
};
