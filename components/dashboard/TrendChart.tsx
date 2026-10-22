/**
 * 추이 누적 막대 카드 — 일·주·월·분기·연 단위를 버튼으로 바꿈, 마우스를 올리면 칸별 건수
 */
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { TrendBucket, TrendUnit } from '@/types/po-dashboard';

interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

interface TrendChartProps {
  title: string;
  buckets: TrendBucket[];
  series: TrendSeries[];
  unit: TrendUnit;
  onUnitChange: (unit: TrendUnit) => void;
  tourId?: string;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

interface TipPayload {
  payload: TrendBucket;
}

/**
 * 칸별 건수 툴팁
 */
const TrendTip = ({ active, payload, series }: { active?: boolean; payload?: TipPayload[]; series: TrendSeries[] }) => {
  const { t } = useLanguage();
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;
  return (
    <div className="min-w-40 rounded-md bg-[#172132] px-3 py-2 text-xs text-white shadow-md">
      <p className="mb-1 font-semibold">{bucket.label}</p>
      {series
        .filter((s) => bucket.values[s.key])
        .map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums">{numberFormat.format(bucket.values[s.key])}</span>
          </div>
        ))}
      <p className="mt-1 border-t border-white/20 pt-1 text-right">
        {t('합계', 'Total')} {numberFormat.format(bucket.total)}
      </p>
    </div>
  );
};

export const TrendChart = ({ title, buckets, series, unit, onUnitChange, tourId }: TrendChartProps) => {
  const { t } = useLanguage();
  const totals = series.map((s) => ({ ...s, total: buckets.reduce((sum, b) => sum + (b.values[s.key] ?? 0), 0) }));
  const visible = totals.filter((s) => s.total > 0 || s.key !== 'other');
  const data = buckets.map((b) => ({ ...b, ...Object.fromEntries(series.map((s) => [s.key, b.values[s.key] ?? 0])) }));
  const units: [TrendUnit, string][] = [
    ['day', t('일', 'Day')],
    ['week', t('주', 'Week')],
    ['month', t('월', 'Month')],
    ['quarter', t('분기', 'Quarter')],
    ['year', t('연', 'Year')],
  ];

  return (
    <section className="rounded-lg border bg-white p-5" data-tour={tourId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#172132]">{title}</h3>
        <div className="flex h-8 items-center gap-0.5 rounded-md border border-[#D6DDE7] bg-white p-0.5" role="radiogroup" aria-label={t('추이 단위', 'Trend unit')}>
          {units.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={unit === key}
              onClick={() => onUnitChange(key)}
              className={cn(
                'h-full rounded px-3 text-xs font-medium text-[#5A6778] hover:text-[#172132]',
                unit === key && 'bg-[#8B1538] text-white hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5A6778]">
        {visible
          .filter((s) => s.total > 0)
          .map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.label} <span className="font-semibold tabular-nums text-[#172132]">{numberFormat.format(s.total)}</span>
            </span>
          ))}
      </div>
      {buckets.length === 0 || buckets.every((b) => b.total === 0) ? (
        <p className="py-16 text-center text-sm text-[#8E98A8]">{t('기간 안에 데이터가 없습니다.', 'No data in this period.')}</p>
      ) : (
        <div className="mt-2 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="#E4E9EF" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#D6DDE7' }} tick={{ fontSize: 11, fill: '#8E98A8' }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8E98A8' }} />
              <Tooltip cursor={{ fill: '#F1F4F8' }} content={<TrendTip series={series} />} />
              {visible.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="trend"
                  fill={s.color}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  maxBarSize={28}
                  radius={i === visible.length - 1 ? [3, 3, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
