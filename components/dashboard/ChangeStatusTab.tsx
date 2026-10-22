/**
 * PO 변경 현황 탭 — 핵심 지표, 유형별 추이, 유형·고객처·사유·요청 출처 막대 (막대를 누르면 PO 변경 페이지)
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KpiCard, RatioMeter } from '@/components/dashboard/KpiCard';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { useLanguage } from '@/context/LanguageContext';
import {
  ORIGIN_COLORS,
  TYPE_GROUP_COLORS,
  TYPE_GROUP_ORDER,
  buildChangeTrend,
  getDefaultTrendUnit,
  getOriginBucket,
  getOriginLabels,
  getTypeGroupLabels,
  rankByCustomer,
  rankByOrigin,
  rankByReason,
  rankByType,
} from '@/lib/po-dashboard-utils';
import { ORIGIN_FILTER_CUSTOMER } from '@/lib/po-changes-utils';
import { getChangeTypeName, getRegistrationLabels } from '@/lib/po-tracker-labels';
import type { PoChangeTypeSetting } from '@/types/po-changes';
import type { DashboardChangeRow, DashboardFilters, RankedItem, TrendUnit } from '@/types/po-dashboard';

interface ChangeStatusTabProps {
  rows: DashboardChangeRow[];
  previousRows: DashboardChangeRow[];
  filters: DashboardFilters;
  changeTypes: PoChangeTypeSetting[];
}

const numberFormat = new Intl.NumberFormat('ko-KR');
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export const ChangeStatusTab = ({ rows, previousRows, filters, changeTypes }: ChangeStatusTabProps) => {
  const { t, lang } = useLanguage();
  const router = useRouter();
  // 추이 단위: 기간 길이에 맞춰 시작하고, 버튼으로 바꾸면 그 값 유지 (기간을 바꾸면 다시 맞춤)
  const rangeKey = `${filters.from}~${filters.to}`;
  const [unitChoice, setUnitChoice] = useState<{ range: string; unit: TrendUnit } | null>(null);
  const unit = unitChoice?.range === rangeKey ? unitChoice.unit : getDefaultTrendUnit(filters.from, filters.to);

  const typeName = useCallback(
    (code: string, label: string) => {
      const setting = changeTypes.find((type) => type.code === code);
      return setting ? getChangeTypeName(setting, lang) : label;
    },
    [changeTypes, lang]
  );

  const stats = useMemo(() => {
    const withReason = rows.filter((r) => r.reason);
    const buckets = withReason.map((r) => getOriginBucket(r));
    return {
      total: rows.length,
      withReason: withReason.length,
      pendingGroups: rows.filter((r) => r.group_status === 'pending' && r.stat_unit_key.startsWith('group:')).length,
      customer: buckets.filter((b) => b === 'customer').length,
      production: buckets.filter((b) => b === 'production').length,
      department: buckets.filter((b) => b === 'department').length,
      registered: rows.filter((r) => r.registration_status === 'pre' || r.registration_status === 'post').length,
      exempt: rows.filter((r) => r.registration_status === 'exempt').length,
      waiting: rows.filter((r) => r.registration_status === 'waiting').length,
      unregistered: rows.filter((r) => r.registration_status === 'unregistered').length,
    };
  }, [rows]);
  const registrationLabels = getRegistrationLabels(t);

  const typeGroupLabels = getTypeGroupLabels(t);
  const originLabels = getOriginLabels(t);
  const trend = useMemo(() => buildChangeTrend(rows, filters.from, filters.to, unit, t), [rows, filters.from, filters.to, unit, t]);
  const byType = useMemo(() => rankByType(rows, typeName, t), [rows, typeName, t]);
  const byCustomer = useMemo(() => rankByCustomer(rows, 10, t), [rows, t]);
  const byReason = useMemo(() => rankByReason(rows, t), [rows, t]);
  const byOrigin = useMemo(() => rankByOrigin(rows, t), [rows, t]);

  const diff = stats.total - previousRows.length;

  /**
   * PO 변경 페이지로 (같은 기간 + 고른 조건)
   */
  const drill = (params: Record<string, string>) => {
    const query = new URLSearchParams({ from: filters.from, to: filters.to, ...params });
    router.push(`/po-changes?${query.toString()}`);
  };

  const originLegend = (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {(['customer', 'production', 'department'] as const).map((b) => (
        <span key={b} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: ORIGIN_COLORS[b] }} />
          {originLabels[b]}
        </span>
      ))}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5" data-tour="po-status-header">
        <KpiCard
          label={t('변경 건수', 'Changes')}
          value={numberFormat.format(stats.total)}
          hint={
            previousRows.length
              ? t(
                  `직전 같은 기간 ${numberFormat.format(previousRows.length)}건 대비 ${diff > 0 ? '+' : ''}${numberFormat.format(diff)}`,
                  `${diff > 0 ? '+' : ''}${numberFormat.format(diff)} vs previous period (${numberFormat.format(previousRows.length)})`
                )
              : t('직전 같은 기간 데이터 없음', 'No data for the previous period')
          }
        />
        <KpiCard
          label={t('사유 입력률', 'Reason entered')}
          value={`${percent(stats.withReason, stats.total)}%`}
          hint={t(`${numberFormat.format(stats.withReason)} / ${numberFormat.format(stats.total)}건 입력`, `${stats.withReason} of ${stats.total}`)}
        >
          <RatioMeter
            label={t('사유 입력률', 'Reason entered')}
            parts={[
              { label: t('입력', 'Entered'), value: stats.withReason, color: '#8B1538' },
              { label: t('미입력', 'Missing'), value: stats.total - stats.withReason, color: '#F1F4F8' },
            ]}
          />
        </KpiCard>
        <KpiCard
          label={t('요청 등록률', 'Registered rate')}
          value={`${percent(stats.registered, stats.total)}%`}
          hint={t(
            `등록 ${numberFormat.format(stats.registered)} · 확인 대기 ${numberFormat.format(stats.waiting)} · 미등록 ${numberFormat.format(stats.unregistered)}`,
            `Registered ${stats.registered} · waiting ${stats.waiting} · unregistered ${stats.unregistered}`
          )}
        >
          <RatioMeter
            label={t('요청 등록률', 'Registered rate')}
            parts={[
              { label: t('등록 (사전+사후)', 'Registered'), value: stats.registered, color: '#1E40AF' },
              { label: registrationLabels.exempt, value: stats.exempt, color: '#8E98A8' },
              { label: registrationLabels.waiting, value: stats.waiting, color: '#D6DDE7' },
              { label: registrationLabels.unregistered, value: stats.unregistered, color: '#8B1538' },
            ]}
          />
        </KpiCard>
        <KpiCard
          label={t('확인 대기 후보', 'Candidates to review')}
          value={numberFormat.format(stats.pendingGroups)}
          emphasize={stats.pendingGroups > 0}
          hint={t('분할/합배송·품목코드 변경 묶음', 'Split shipment and item code groups')}
        />
        <KpiCard
          label={t('요청 출처 비중', 'Who requested')}
          value={
            <span className="flex items-baseline gap-3">
              <span>
                <span className="mr-1 text-xs font-medium" style={{ color: ORIGIN_COLORS.customer }}>{originLabels.customer}</span>
                {percent(stats.customer, stats.withReason)}%
              </span>
              <span>
                <span className="mr-1 text-xs font-medium" style={{ color: ORIGIN_COLORS.production }}>{originLabels.production}</span>
                {percent(stats.production, stats.withReason)}%
              </span>
            </span>
          }
          hint={t(`사유 입력 ${numberFormat.format(stats.withReason)}건 기준`, `Based on ${stats.withReason} with a reason`)}
        >
          <RatioMeter
            label={t('요청 출처 비중', 'Who requested')}
            parts={[
              { label: originLabels.customer, value: stats.customer, color: ORIGIN_COLORS.customer },
              { label: originLabels.production, value: stats.production, color: ORIGIN_COLORS.production },
              { label: originLabels.department, value: stats.department, color: ORIGIN_COLORS.department },
            ]}
          />
        </KpiCard>
      </div>

      <TrendChart
        title={t('변경 추이', 'Change trend')}
        buckets={trend}
        series={TYPE_GROUP_ORDER.map((g) => ({ key: g, label: typeGroupLabels[g], color: TYPE_GROUP_COLORS[g] }))}
        unit={unit}
        onUnitChange={(next) => setUnitChoice({ range: rangeKey, unit: next })}
        tourId="po-status-monthly-trend-chart"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBars
          title={t('변경 유형', 'Change type')}
          hint={t('마우스를 올리면 요청 출처 비중', 'Hover for who requested')}
          items={byType}
          emptyText={t('변경이 없습니다.', 'No changes.')}
          onSelect={(item: RankedItem) => drill({ type: item.key })}
          tourId="po-status-request-type-chart"
        />
        <RankedBars
          title={t('고객처 상위 10', 'Top 10 customers')}
          hint={t('경유 고객처는 마우스를 올리면 실제 도착지별', 'Hover a via customer for its destinations')}
          items={byCustomer}
          emptyText={t('변경이 없습니다.', 'No changes.')}
          onSelect={(item: RankedItem) => drill({ customer: item.key })}
        />
        <RankedBars
          title={t('변경 사유', 'Change reason')}
          hint={t(`입력 ${numberFormat.format(stats.withReason)}건 · 마우스를 올리면 요청 출처 비중`, `${stats.withReason} entered · hover for who requested`)}
          items={byReason}
          emptyText={t('입력된 사유가 없습니다.', 'No reasons entered yet.')}
          onSelect={(item: RankedItem) => drill({ reason: item.key })}
          footer={
            stats.total > stats.withReason
              ? t(`사유 미입력 ${numberFormat.format(stats.total - stats.withReason)}건은 막대에 넣지 않았습니다.`, `${stats.total - stats.withReason} without a reason are not shown.`)
              : undefined
          }
          tourId="po-status-item-category-trend-chart"
        />
        <RankedBars
          title={t('요청 출처', 'Requested by')}
          hint={t(`입력 ${numberFormat.format(stats.withReason)}건`, `${stats.withReason} entered`)}
          items={byOrigin}
          emptyText={t('입력된 요청 출처가 없습니다.', 'No requesters entered yet.')}
          onSelect={(item: RankedItem) => drill({ origin: item.key === 'customer' ? ORIGIN_FILTER_CUSTOMER : item.key })}
          footer={originLegend}
          tourId="po-status-frozen-chart"
        />
      </div>
      <p className="text-xs text-[#8E98A8]">
        {t('막대를 누르면 같은 기간·조건으로 PO 변경 페이지가 열립니다.', 'Click a bar to open PO Changes with the same period and condition.')}
      </p>
    </div>
  );
};
