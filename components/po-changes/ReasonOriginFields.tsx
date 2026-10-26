/**
 * 변경 사유·요청 출처 입력 칸 (사유 입력 창과 후보 승인·반려 카드에서 함께 사용)
 */
'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { ReasonOption } from '@/lib/request-constants';
import type { PoRequestOrigin, ReasonOriginType } from '@/types/po-changes';

/** 사유·출처 값 (메모 제외) */
export interface ReasonOriginValue {
  reason: string;
  originType: ReasonOriginType;
  originCode: string | null;
}

interface ReasonOriginFieldsProps {
  value: ReasonOriginValue;
  onChange: (next: ReasonOriginValue) => void;
  reasons: ReasonOption[];
  origins: PoRequestOrigin[];
  /** 고객처 요청일 때 보여줄 고객처 이름 */
  customerNames: string[];
  idPrefix: string;
  /** 좁은 자리(카드 안)에서는 한 줄로 */
  compact?: boolean;
}

export const ReasonOriginFields = ({
  value,
  onChange,
  reasons,
  origins,
  customerNames,
  idPrefix,
  compact,
}: ReasonOriginFieldsProps) => {
  const { t } = useLanguage();
  const active = origins.filter((o) => o.is_active || o.code === value.originCode);
  const selectedReason = reasons.find((r) => r.value === value.reason);

  return (
    <div className={cn('grid gap-3', compact ? 'md:grid-cols-[1fr_auto_1fr]' : '')}>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-reason`} className="text-xs text-[#5A6778]">
          {t('변경 사유', 'Change reason')} <span className="text-red-500">*</span>
        </Label>
        <Select value={value.reason} onValueChange={(v) => onChange({ ...value, reason: v })}>
          <SelectTrigger id={`${idPrefix}-reason`} className="w-full">
            <SelectValue placeholder={t('사유 선택', 'Select a reason')} />
          </SelectTrigger>
          <SelectContent>
            {reasons.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!compact && selectedReason?.description ? (
          <p className="text-xs text-[#8E98A8]">{selectedReason.description}</p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1.5">
        <span className="block text-xs font-medium text-[#5A6778]">
          {t('요청 출처', 'Requested by')} <span className="text-red-500">*</span>
        </span>
        <div className="flex h-9 items-center gap-1 rounded-md border border-[#D6DDE7] bg-white p-0.5" role="radiogroup">
          {([
            ['customer', t('고객처', 'Customer')],
            ['department', t('본사/국내법인', 'HQ/Affiliate')],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={value.originType === key}
              onClick={() => onChange({ ...value, originType: key, originCode: key === 'customer' ? null : value.originCode })}
              className={cn(
                'h-full whitespace-nowrap rounded px-3 text-sm text-[#5A6778]',
                value.originType === key && 'bg-[#8B1538] text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-origin`} className="text-xs text-[#5A6778]">
          {value.originType === 'customer' ? t('고객처', 'Customer') : t('요청 부서', 'Department')}
        </Label>
        {value.originType === 'customer' ? (
          <p
            id={`${idPrefix}-origin`}
            className="block h-9 truncate rounded-md border border-[#E4E9EF] bg-[#F8FAFC] px-3 text-sm leading-9 text-[#253143]"
            title={customerNames.join(', ')}
          >
            {customerNames.length ? customerNames.join(', ') : t('주문의 고객처', "The order's customer")}
          </p>
        ) : (
          <Select value={value.originCode ?? ''} onValueChange={(v) => onChange({ ...value, originCode: v })}>
            <SelectTrigger id={`${idPrefix}-origin`} className="w-full">
              <SelectValue placeholder={t('부서 선택', 'Select a department')} />
            </SelectTrigger>
            <SelectContent>
              {active.map((o) => (
                <SelectItem key={o.code} value={o.code}>{o.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
};

/**
 * 사유·출처가 다 골라졌는지
 */
export const isReasonOriginComplete = (v: ReasonOriginValue): boolean =>
  Boolean(v.reason) && (v.originType === 'customer' || Boolean(v.originCode));
