/**
 * 변경 사유 입력 창 — 고른 변경(1건 또는 여러 건)에 사유·상세 메모·요청 출처를 한 번에 저장하거나 지움
 */
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Eraser, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ReasonOriginFields,
  isReasonOriginComplete,
  type ReasonOriginValue,
} from '@/components/po-changes/ReasonOriginFields';
import { useLanguage } from '@/context/LanguageContext';
import { getEventTypeName } from '@/lib/po-tracker-labels';
import type { PoStatUnit } from '@/lib/po-changes-utils';
import type { ReasonOption } from '@/lib/request-constants';
import type { ChangeReasonInput, PoChangeTypeSetting, PoRequestOrigin } from '@/types/po-changes';

interface ReasonDialogProps {
  units: PoStatUnit[];
  reasons: ReasonOption[];
  origins: PoRequestOrigin[];
  changeTypes: PoChangeTypeSetting[];
  onClose: () => void;
  onSubmit: (keys: string[], input: ChangeReasonInput) => Promise<boolean>;
  /** 사유 지우기 — 성공하면 true */
  onClear: (keys: string[]) => Promise<boolean>;
}

/**
 * 고른 변경이 모두 같은 사유를 갖고 있으면 그 값으로 미리 채움
 */
const initialValue = (units: PoStatUnit[]): ReasonOriginValue & { note: string } => {
  const firsts = units.map((u) => u.events[0]);
  const same = firsts.every(
    (e) =>
      e.reason === firsts[0]?.reason &&
      e.reason_note === firsts[0]?.reason_note &&
      e.reason_origin_type === firsts[0]?.reason_origin_type &&
      e.reason_origin_code === firsts[0]?.reason_origin_code
  );
  const base = same ? firsts[0] : undefined;
  return {
    reason: base?.reason ?? '',
    note: base?.reason_note ?? '',
    originType: base?.reason_origin_type ?? 'customer',
    originCode: base?.reason_origin_code ?? null,
  };
};

const ReasonDialogBody = ({ units, reasons, origins, changeTypes, onClose, onSubmit, onClear }: ReasonDialogProps) => {
  const { t, lang } = useLanguage();
  const [value, setValue] = useState(() => initialValue(units));
  const [saving, setSaving] = useState(false);
  const customers = [...new Set(units.flatMap((u) => u.events.map((e) => e.customer_name)).filter((v): v is string => Boolean(v)))];
  const complete = isReasonOriginComplete(value) && value.note.trim() !== '';
  const single = units.length === 1 ? units[0].events[0] : null;
  const withReason = units.filter((u) => u.events[0]?.reason);

  const handleClear = async () => {
    if (
      !window.confirm(
        t(
          `사유가 입력된 변경 ${withReason.length}건의 사유를 지울까요? 지운 기록은 이력에 남습니다.`,
          `Clear the reason on ${withReason.length} changes? The removal is kept in the history.`
        )
      )
    ) {
      return;
    }
    setSaving(true);
    const ok = await onClear(withReason.map((u) => u.key));
    setSaving(false);
    if (ok) onClose();
  };

  const handleSubmit = async () => {
    setSaving(true);
    const ok = await onSubmit(
      units.map((u) => u.key),
      { reason: value.reason, note: value.note, originType: value.originType, originCode: value.originCode }
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {units.length === 1 ? t('변경 사유 입력', 'Enter change reason') : t(`변경 ${units.length}건 사유 입력`, `Reason for ${units.length} changes`)}
        </DialogTitle>
        <DialogDescription>
          {t(
            '어떤 이유로 변경됐는지 사유를 고르고, 분석에 쓸 수 있도록 상세 내용을 메모로 남겨주세요.',
            'Pick why it changed and leave the details in the note so the data can be analyzed later.'
          )}
        </DialogDescription>
      </DialogHeader>

      <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-[#E4E9EF] bg-[#F8FAFC] p-3 text-sm">
        {units.slice(0, 8).map((u) => {
          const e = u.events[0];
          const orders = [...new Set(u.events.map((x) => x.order_no))];
          return (
            <li key={u.key} className="truncate text-[#253143]">
              <span className="font-medium">{orders[0]}{orders.length > 1 ? t(` 외 ${orders.length - 1}`, ` +${orders.length - 1}`) : ''}</span>
              <span className="text-[#5A6778]">
                {' · '}{getEventTypeName(e, changeTypes, lang)}
                {u.events.length > 1 ? t(` · 라인 ${u.events.length}개`, ` · ${u.events.length} lines`) : ` · ${e.item_no ?? ''}`}
                {e.customer_name ? ` · ${e.customer_name}` : ''}
              </span>
            </li>
          );
        })}
        {units.length > 8 ? <li className="text-xs text-[#8E98A8]">{t(`외 ${units.length - 8}건`, `+${units.length - 8} more`)}</li> : null}
      </ul>

      {single?.reason ? (
        <p className="text-xs text-[#8E98A8]">
          {t('현재 입력', 'Current')}: {single.reason}
          {single.reason_set_by_name ? ` · ${single.reason_set_by_name}` : ''}
          {single.reason_set_at ? ` · ${format(new Date(single.reason_set_at), 'yyyy-MM-dd HH:mm')}` : ''}
        </p>
      ) : null}

      <div className="space-y-4">
        <ReasonOriginFields
          value={value}
          onChange={(next) => setValue({ ...value, ...next })}
          reasons={reasons}
          origins={origins}
          customerNames={customers}
          idPrefix="reason-dialog"
        />
        <div className="space-y-1.5">
          <Label htmlFor="reason-dialog-note" className="text-xs text-[#5A6778]">
            {t('상세 사유 메모', 'Detailed note')} <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="reason-dialog-note"
            value={value.note}
            onChange={(e) => setValue({ ...value, note: e.target.value })}
            rows={3}
            placeholder={t(
              '예: 11월 대리점 프로모션으로 BSM370 60대 추가 요청 / 선적 스케줄 1주 지연으로 출하일 연기',
              'e.g. Dealer promotion in November, 60 more BSM370 / Shipping schedule delayed a week'
            )}
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {withReason.length > 0 ? (
          <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void handleClear()} disabled={saving}>
            <Eraser className="h-4 w-4" />
            {t(`사유 지우기 (${withReason.length}건)`, `Clear reason (${withReason.length})`)}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>{t('취소', 'Cancel')}</Button>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSubmit()} disabled={saving || !complete}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('저장', 'Save')}
        </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
};

export const ReasonDialog = (props: Omit<ReasonDialogProps, 'units'> & { units: PoStatUnit[] | null }) => {
  const { units, ...rest } = props;
  return (
    <Dialog open={Boolean(units?.length)} onOpenChange={(open) => !open && rest.onClose()}>
      {units?.length ? <ReasonDialogBody key={units.map((u) => u.key).join('|')} units={units} {...rest} /> : null}
    </Dialog>
  );
};
