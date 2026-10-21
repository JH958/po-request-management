/**
 * 경유 고객처(인바디헬스케어·코르트) 주문의 실제 고객처 선택 — 후보가 여럿인 국가(대만·이스라엘 등)만
 */
'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { PoChangeEvent } from '@/types/po-changes';

interface DestinationChoiceProps {
  event: PoChangeEvent;
  onChange: (orderNo: string, target: string | null) => Promise<void>;
}

/** 선택 해제 값 */
const CLEAR = '__clear__';

export const DestinationChoice = ({ event, onChange }: DestinationChoiceProps) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const candidates = event.destination_candidates ?? [];
  if (candidates.length === 0) return null;

  // 건별로 고른 값만 선택 상태로 보여줌 (이름2로 자동 결정된 값은 그대로 두고 바꿀 수 있게)
  const chosen = event.destination_chosen_by_name ? event.actual_customer ?? '' : '';

  const handleChange = async (value: string) => {
    setBusy(true);
    try {
      await onChange(event.order_no, value === CLEAR ? null : value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <Select value={chosen} onValueChange={(v) => void handleChange(v)} disabled={busy}>
        <SelectTrigger
          className={cn(
            'h-7 w-[200px] text-xs',
            event.needs_destination_choice && 'border-amber-300 bg-amber-50 text-amber-800'
          )}
          aria-label={t('실제 고객처 선택', 'Pick the actual customer')}
        >
          <SelectValue placeholder={event.actual_customer ? t('실제 고객처 변경', 'Change actual customer') : t('실제 고객처 선택', 'Pick actual customer')} />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
          ))}
          {chosen ? <SelectItem value={CLEAR} className="text-xs text-[#8E98A8]">{t('선택 해제', 'Clear')}</SelectItem> : null}
        </SelectContent>
      </Select>
      {event.destination_chosen_by_name ? (
        <span className="mt-0.5 block text-[11px] text-[#8E98A8]">{t('선택', 'Picked by')}: {event.destination_chosen_by_name}</span>
      ) : null}
    </div>
  );
};
