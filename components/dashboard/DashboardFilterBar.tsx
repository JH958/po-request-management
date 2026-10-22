/**
 * PO 현황 필터 — 기간(빠른 선택·직접), 고객처·구분·요청 출처 (요청 현황 탭은 기간만)
 */
'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/context/LanguageContext';
import { getPresetRange, getOriginLabels, ORIGIN_ORDER, shortCustomerName } from '@/lib/po-dashboard-utils';
import { getProductClassLabels } from '@/lib/po-tracker-labels';
import { cn } from '@/lib/utils';
import type { ProductClass } from '@/types/po-changes';
import type { DashboardFilters, OriginBucket, PeriodPreset } from '@/types/po-dashboard';

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  /** 고객처 목록 (건수 많은 순) */
  customers: string[];
  /** 변경 현황 탭이면 고객처·구분·출처 필터도 보임 */
  showChangeFilters: boolean;
}

const CLASSES: ProductClass[] = ['제품', '상품', '자재', '미분류'];

export const DashboardFilterBar = ({ filters, onChange, customers, showChangeFilters }: DashboardFilterBarProps) => {
  const { t } = useLanguage();
  const classLabels = getProductClassLabels(t);
  const originLabels = getOriginLabels(t);
  const presets: [Exclude<PeriodPreset, 'custom'>, string][] = [
    ['week', t('이번 주', 'This week')],
    ['4weeks', t('최근 4주', 'Last 4 weeks')],
    ['month', t('이번 달', 'This month')],
    ['quarter', t('이번 분기', 'This quarter')],
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4" data-tour="po-status-period-filter">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...filters, preset: key, ...getPresetRange(key) })}
            className={cn(
              'h-8 rounded-full border border-[#D6DDE7] bg-white px-3.5 text-sm text-[#5A6778] hover:border-[#8B1538]/40 hover:text-[#253143]',
              filters.preset === key && 'border-[#8B1538] bg-[#8B1538] text-white hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(e) => e.target.value && onChange({ ...filters, preset: 'custom', from: e.target.value })}
            className={cn('h-8 w-36 text-sm', filters.preset === 'custom' && 'border-[#8B1538]')}
            aria-label={t('시작일', 'From')}
          />
          <span className="text-[#8E98A8]">~</span>
          <Input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => e.target.value && onChange({ ...filters, preset: 'custom', to: e.target.value })}
            className={cn('h-8 w-36 text-sm', filters.preset === 'custom' && 'border-[#8B1538]')}
            aria-label={t('종료일', 'To')}
          />
        </div>
      </div>

      {showChangeFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.customer} onValueChange={(v) => onChange({ ...filters, customer: v })}>
            <SelectTrigger className="h-8 w-56 text-sm" aria-label={t('고객처', 'Customer')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('고객처 전체', 'All customers')}</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c} value={c}>{shortCustomerName(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.productClass} onValueChange={(v) => onChange({ ...filters, productClass: v as DashboardFilters['productClass'] })}>
            <SelectTrigger className="h-8 w-40 text-sm" aria-label={t('품목 구분', 'Item category')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('품목 구분 전체', 'All item categories')}</SelectItem>
              {CLASSES.map((c) => (
                <SelectItem key={c} value={c}>{classLabels[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.origin} onValueChange={(v) => onChange({ ...filters, origin: v as 'all' | OriginBucket })}>
            <SelectTrigger className="h-8 w-52 text-sm" aria-label={t('요청 출처', 'Requested by')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('요청 출처 전체', 'All requesters')}</SelectItem>
              {ORIGIN_ORDER.map((o) => (
                <SelectItem key={o} value={o}>{originLabels[o]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
};
