/**
 * 요청 현황 탭 — 요청 건수·상태, 추이, 요청구분·요청사유 막대, 프로즌 이후 비율
 */
'use client';

import { useMemo, useState } from 'react';
import { KpiCard, RatioMeter } from '@/components/dashboard/KpiCard';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { useLanguage } from '@/context/LanguageContext';
import {
  REQUEST_STATUS_COLORS,
  buildRequestTrend,
  getDefaultTrendUnit,
  getRequestStatusGroup,
  getRequestStatusLabels,
  rankRequests,
  type RequestStatusGroup,
} from '@/lib/po-dashboard-utils';
import type { DashboardFilters, DashboardRequestRow, TrendUnit } from '@/types/po-dashboard';

interface RequestStatusTabProps {
  rows: DashboardRequestRow[];
  filters: DashboardFilters;
}

const numberFormat = new Intl.NumberFormat('ko-KR');
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const STATUS_ORDER: RequestStatusGroup[] = ['approved', 'rejected', 'pending'];

export const RequestStatusTab = ({ rows, filters }: RequestStatusTabProps) => {
  const { t } = useLanguage();
  const rangeKey = `${filters.from}~${filters.to}`;
  const [unitChoice, setUnitChoice] = useState<{ range: string; unit: TrendUnit } | null>(null);
  const unit = unitChoice?.range === rangeKey ? unitChoice.unit : getDefaultTrendUnit(filters.from, filters.to);
  const statusLabels = getRequestStatusLabels(t);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, rows.filter((r) => getRequestStatusGroup(r.status) === s).length])) as Record<RequestStatusGroup, number>;
    return {
      ...byStatus,
      after: rows.filter((r) => r.frozen_status === 'after').length,
      before: rows.filter((r) => r.frozen_status === 'before').length,
    };
  }, [rows]);

  const trend = useMemo(() => buildRequestTrend(rows, filters.from, filters.to, unit, t), [rows, filters.from, filters.to, unit, t]);
  const byCategory = useMemo(() => rankRequests(rows, (r) => r.category_of_request, t), [rows, t]);
  const byReason = useMemo(() => rankRequests(rows, (r) => r.reason_for_request, t), [rows, t]);
  const frozenTotal = counts.after + counts.before;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t('요청 건수', 'Requests')} value={numberFormat.format(rows.length)} hint={t('기간 안에 접수된 요청', 'Submitted in this period')}>
          <RatioMeter
            label={t('상태 비율', 'Status ratio')}
            parts={STATUS_ORDER.map((s) => ({ label: statusLabels[s], value: counts[s], color: REQUEST_STATUS_COLORS[s] }))}
          />
        </KpiCard>
        <KpiCard label={statusLabels.approved} value={numberFormat.format(counts.approved)} hint={`${percent(counts.approved, rows.length)}%`} />
        <KpiCard label={statusLabels.rejected} value={numberFormat.format(counts.rejected)} hint={`${percent(counts.rejected, rows.length)}%`} />
        <KpiCard
          label={t('검토 대기', 'Pending review')}
          value={numberFormat.format(counts.pending)}
          emphasize={counts.pending > 0}
          hint={`${percent(counts.pending, rows.length)}%`}
        />
      </div>

      <TrendChart
        title={t('요청 추이', 'Request trend')}
        buckets={trend}
        series={STATUS_ORDER.map((s) => ({ key: s, label: statusLabels[s], color: REQUEST_STATUS_COLORS[s] }))}
        unit={unit}
        onUnitChange={(next) => setUnitChoice({ range: rangeKey, unit: next })}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBars
          title={t('요청구분', 'Request type')}
          hint={t('마우스를 올리면 승인·반려·대기', 'Hover for status')}
          items={byCategory}
          emptyText={t('요청이 없습니다.', 'No requests.')}
        />
        <RankedBars
          title={t('요청사유', 'Request reason')}
          hint={t('마우스를 올리면 승인·반려·대기', 'Hover for status')}
          items={byReason}
          emptyText={t('요청이 없습니다.', 'No requests.')}
        />
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h3 className="text-sm font-semibold text-[#172132]">{t('프로즌 이후 요청 비율', 'Requests after the frozen date')}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-[#8B1538]">{percent(counts.after, frozenTotal)}%</span>
          <span className="text-sm text-[#5A6778]">
            {t(
              `프로즌 이후 ${numberFormat.format(counts.after)}건 / 판정 ${numberFormat.format(frozenTotal)}건`,
              `${counts.after} after of ${frozenTotal} judged`
            )}
          </span>
        </div>
        <RatioMeter
          label={t('프로즌 이후 비율', 'Share after the frozen date')}
          parts={[
            { label: t('프로즌 이후', 'After'), value: counts.after, color: '#8B1538' },
            { label: t('프로즌 이전', 'Before'), value: counts.before, color: '#D6DDE7' },
          ]}
        />
        <p className="mt-2 text-xs text-[#8E98A8]">
          {t(
            `프로즌 규칙이 없는 요청 ${numberFormat.format(rows.length - frozenTotal)}건은 비율에서 뺐습니다. 프로즌 이후 요청은 원칙적으로 변경이 어렵습니다.`,
            `${rows.length - frozenTotal} requests with no frozen rule are left out. Changes after the frozen date are generally hard to make.`
          )}
        </p>
      </section>
    </div>
  );
};
