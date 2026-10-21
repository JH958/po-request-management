/**
 * PO 변경 페이지 필터 (기간·업로드일·변경 유형·구분·사유·요청 출처·검색·담당·추적 제외 포함)
 */
'use client';

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/context/LanguageContext';
import { getChangeTypeName, getProductClassLabels } from '@/lib/po-tracker-labels';
import {
  ORIGIN_FILTER_CUSTOMER,
  ORIGIN_FILTER_DEPARTMENT,
  ORIGIN_FILTER_PRODUCTION,
  REASON_FILTER_MISSING,
  REASON_FILTER_SET,
  getDefaultRange,
} from '@/lib/po-changes-utils';
import type { ReasonOption } from '@/lib/request-constants';
import type { DoUploadDay, PoChangeFilters, PoChangeTypeSetting, PoRequestOrigin, ProductClass } from '@/types/po-changes';

interface PoChangesFilterBarProps {
  filters: PoChangeFilters;
  uploadDays: DoUploadDay[];
  /** 변경 유형 설정 (사용 중인 것만 드롭다운에 보임) */
  changeTypes: PoChangeTypeSetting[];
  origins: PoRequestOrigin[];
  reasons: ReasonOption[];
  /** 로그인 메일 — 담당 고객처 필터에 사용 */
  userEmail: string | null;
  onChange: (next: PoChangeFilters) => void;
}

const PRODUCT_CLASSES: ProductClass[] = ['제품', '상품', '자재', '미분류', '제외'];

export const PoChangesFilterBar = ({
  filters,
  uploadDays,
  changeTypes,
  origins,
  reasons,
  userEmail,
  onChange,
}: PoChangesFilterBarProps) => {
  const { t, lang } = useLanguage();
  const activeTypes = changeTypes.filter((type) => type.is_active);
  const classLabels = getProductClassLabels(t);
  const set = (patch: Partial<PoChangeFilters>) => onChange({ ...filters, ...patch });
  const singleDay = filters.from === filters.to ? filters.from : '';

  return (
    <div className="space-y-4 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="po-changes-from" className="text-xs text-[#5A6778]">{t('기간', 'Period')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="po-changes-from"
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(e) => e.target.value && set({ from: e.target.value })}
              className="w-[150px]"
            />
            <span className="text-[#8E98A8]">~</span>
            <Input
              type="date"
              aria-label={t('기간 종료일', 'Period end date')}
              value={filters.to}
              min={filters.from}
              onChange={(e) => e.target.value && set({ to: e.target.value })}
              className="w-[150px]"
            />
          </div>
        </div>

        <Button
          variant="outline"
          className="border-[#D6DDE7] shadow-none"
          onClick={() => set(getDefaultRange())}
        >
          {t('최근 7일', 'Last 7 days')}
        </Button>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#5A6778]">{t('업로드일', 'Upload date')}</Label>
          <Select
            value={singleDay && uploadDays.some((d) => d.snapshot_date === singleDay) ? singleDay : ''}
            onValueChange={(v) => set({ from: v, to: v })}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder={t('하루 선택', 'Pick a day')} />
            </SelectTrigger>
            <SelectContent>
              {uploadDays.map((d) => (
                <SelectItem key={d.snapshot_date} value={d.snapshot_date}>
                  {d.snapshot_date}
                  {d.is_baseline ? ` (${t('기준선', 'baseline')})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-[#5A6778]">{t('변경 유형', 'Change type')}</Label>
          <Select value={filters.changeType} onValueChange={(v) => set({ changeType: v })}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 유형', 'All types')}</SelectItem>
              {activeTypes.map((type) => (
                <SelectItem key={type.code} value={type.code}>{getChangeTypeName(type, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#5A6778]">{t('구분', 'Category')}</Label>
          <Select value={filters.productClass} onValueChange={(v) => set({ productClass: v as ProductClass | 'all' })}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 구분', 'All categories')}</SelectItem>
              {PRODUCT_CLASSES.map((c) => (
                <SelectItem key={c} value={c}>{classLabels[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#5A6778]">{t('변경 사유', 'Reason')}</Label>
          <Select value={filters.reasonFilter} onValueChange={(v) => set({ reasonFilter: v })}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 사유', 'All reasons')}</SelectItem>
              <SelectItem value={REASON_FILTER_MISSING}>{t('사유 미입력', 'Missing')}</SelectItem>
              <SelectItem value={REASON_FILTER_SET}>{t('사유 입력됨', 'Entered')}</SelectItem>
              {reasons.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#5A6778]">{t('요청 출처', 'Requested by')}</Label>
          <Select value={filters.originFilter} onValueChange={(v) => set({ originFilter: v })}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 출처', 'All')}</SelectItem>
              <SelectItem value={ORIGIN_FILTER_CUSTOMER}>{t('고객처 요청', 'Customer')}</SelectItem>
              <SelectItem value={ORIGIN_FILTER_DEPARTMENT}>{t('본사/국내법인 요청 (전체)', 'HQ/Affiliates (all)')}</SelectItem>
              <SelectItem value={ORIGIN_FILTER_PRODUCTION}>{t('생산부', 'Production')}</SelectItem>
              {origins.map((o) => (
                <SelectItem key={o.code} value={o.code}>{o.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
          <Input
            className="pl-10"
            placeholder={t('고객처, 주문번호, DO, 품목 검색...', 'Search customer, order, DO or item...')}
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label={t('검색', 'Search')}
          />
        </div>

        <div className="flex h-9 items-center gap-2">
          <Switch
            id="po-changes-mine"
            checked={Boolean(filters.myEmail)}
            disabled={!userEmail}
            onCheckedChange={(v) => set({ myEmail: v ? userEmail : null })}
          />
          <Label htmlFor="po-changes-mine" className="cursor-pointer text-sm text-[#253143]">
            {t('내 담당 고객처만', 'My customers only')}
          </Label>
        </div>

        <div className="flex h-9 items-center gap-2">
          <Switch
            id="po-changes-dismissed"
            checked={filters.includeDismissed}
            onCheckedChange={(v) => set({ includeDismissed: v })}
          />
          <Label htmlFor="po-changes-dismissed" className="cursor-pointer text-sm text-[#253143]">
            {t('변경 아님 포함', 'Include not-a-change')}
          </Label>
        </div>

        <div className="flex h-9 items-center gap-2">
          <Switch
            id="po-changes-excluded"
            checked={filters.includeExcluded}
            onCheckedChange={(v) => set({ includeExcluded: v })}
          />
          <Label htmlFor="po-changes-excluded" className="cursor-pointer text-sm text-[#253143]">
            {t('추적 제외 고객처 포함', 'Include excluded customers')}
          </Label>
        </div>
      </div>
    </div>
  );
};
