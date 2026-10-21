/**
 * 변경 사유 입력 창 — 고른 변경(1건 또는 여러 건)에 사유·상세 메모·요청 출처를 저장·지우거나, "변경 아님(정정)"으로 처리·해제
 */
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Ban, Eraser, Loader2, RotateCcw } from 'lucide-react';
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
import { cn } from '@/lib/utils';
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
  /** "변경 아님(정정)" 처리 — 성공하면 true */
  onDismiss: (keys: string[], note: string) => Promise<boolean>;
  /** "변경 아님" 해제 — 성공하면 true */
  onRestore: (keys: string[]) => Promise<boolean>;
}

type DialogMode = 'reason' | 'dismiss';

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

const ReasonDialogBody = ({
  units,
  reasons,
  origins,
  changeTypes,
  onClose,
  onSubmit,
  onClear,
  onDismiss,
  onRestore,
}: ReasonDialogProps) => {
  const { t, lang } = useLanguage();
  const [value, setValue] = useState(() => initialValue(units));
  const [saving, setSaving] = useState(false);
  const customers = [...new Set(units.flatMap((u) => u.events.map((e) => e.customer_name)).filter((v): v is string => Boolean(v)))];
  const complete = isReasonOriginComplete(value) && value.note.trim() !== '';
  const single = units.length === 1 ? units[0].events[0] : null;
  const withReason = units.filter((u) => u.events[0]?.reason);
  const dismissed = units.filter((u) => u.events[0]?.is_dismissed);
  const [mode, setMode] = useState<DialogMode>('reason');
  const [dismissNote, setDismissNote] = useState(() => (units.length === 1 ? units[0].events[0]?.dismiss_note ?? '' : ''));

  const handleDismiss = async () => {
    setSaving(true);
    const ok = await onDismiss(units.map((u) => u.key), dismissNote);
    setSaving(false);
    if (ok) onClose();
  };

  const handleRestore = async () => {
    setSaving(true);
    const ok = await onRestore(dismissed.map((u) => u.key));
    setSaving(false);
    if (ok) onClose();
  };

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

      {dismissed.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span>
            {t(`${dismissed.length}건이 "변경 아님"으로 처리되어 있습니다.`, `${dismissed.length} marked as not a change.`)}
            {units.length === 1 && units[0].events[0]?.dismissed_by_name ? (
              <span className="ml-1 text-xs text-slate-500">
                {units[0].events[0].dismissed_by_name}
                {units[0].events[0].dismissed_at ? ` · ${format(new Date(units[0].events[0].dismissed_at), 'yyyy-MM-dd HH:mm')}` : ''}
              </span>
            ) : null}
          </span>
          <Button size="sm" variant="outline" className="h-8 border-slate-300 bg-white shadow-none" onClick={() => void handleRestore()} disabled={saving}>
            <RotateCcw className="h-4 w-4" />
            {t('변경 아님 해제', 'Count as change again')}
          </Button>
        </div>
      ) : null}

      <div className="flex gap-1 rounded-md border border-[#D6DDE7] bg-white p-0.5 text-sm" role="tablist">
        {([
          ['reason', t('변경 사유 입력', 'Change reason')],
          ['dismiss', t('변경 아님 (정정)', 'Not a change (correction)')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn('flex-1 rounded px-3 py-1.5 text-[#5A6778]', mode === key && 'bg-[#8B1538] text-white')}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'dismiss' ? (
        <div className="space-y-1.5">
          <p className="text-xs text-[#5A6778]">
            {t(
              '오입력 정정처럼 실제 변경이 아닌 건입니다. 처리하면 변경 건수·통계·사유 입력 대상에서 빠지고, 언제든 해제할 수 있습니다.',
              'For entries that are not real changes, such as data-entry corrections. They are left out of counts, statistics and reason entry, and can be restored anytime.'
            )}
          </p>
          <Label htmlFor="reason-dialog-dismiss" className="text-xs text-[#5A6778]">
            {t('정정 내용 메모', 'Correction note')} <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="reason-dialog-dismiss"
            value={dismissNote}
            onChange={(e) => setDismissNote(e.target.value)}
            rows={3}
            placeholder={t(
              '예: 출하 예정일은 원래 10/22 — 잘못 넣었던 요청 배송일을 출하 처리 때 바로잡음',
              'e.g. Ship date was always 10/22 — the wrong requested date was corrected at shipment'
            )}
          />
        </div>
      ) : (
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
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {mode === 'reason' && withReason.length > 0 ? (
          <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void handleClear()} disabled={saving}>
            <Eraser className="h-4 w-4" />
            {t(`사유 지우기 (${withReason.length}건)`, `Clear reason (${withReason.length})`)}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>{t('취소', 'Cancel')}</Button>
        {mode === 'dismiss' ? (
          <Button className="bg-slate-700 hover:bg-slate-800" onClick={() => void handleDismiss()} disabled={saving || !dismissNote.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {t('변경 아님으로 처리', 'Mark as not a change')}
          </Button>
        ) : (
          <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSubmit()} disabled={saving || !complete}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('저장', 'Save')}
          </Button>
        )}
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
