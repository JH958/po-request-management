/**
 * 요청 연결 창 — 변경 1건에 연결된 요청(해제), 연결 후보(연결), 예외 처리(요청서가 필요 없었던 변경)를 한 곳에서 처리
 */
'use client';

import { useState } from 'react';
import { Link2, Link2Off, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { RequestSummaryLine } from '@/components/po-changes/RequestSummaryLine';
import { useLanguage } from '@/context/LanguageContext';
import { REGISTRATION_BADGE_CLASSES, getEventTypeName, getRegistrationLabels } from '@/lib/po-tracker-labels';
import type { PoStatUnit } from '@/lib/po-changes-utils';
import { cn } from '@/lib/utils';
import type { ChangeRequestLink, MatchCandidate, PoChangeTypeSetting } from '@/types/po-changes';

interface RequestLinkDialogProps {
  unit: PoStatUnit;
  links: ChangeRequestLink[];
  candidates: MatchCandidate[];
  changeTypes: PoChangeTypeSetting[];
  onClose: () => void;
  /** 연결 — 성공하면 true */
  onLink: (key: string, candidate: MatchCandidate, note: string) => Promise<boolean>;
  /** 연결 해제 — 성공하면 true */
  onUnlink: (linkId: string, note: string) => Promise<boolean>;
  /** 예외 처리 — 성공하면 true */
  onExempt: (keys: string[], note: string) => Promise<boolean>;
  /** 예외 처리 해제 — 성공하면 true */
  onClearExempt: (keys: string[]) => Promise<boolean>;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/**
 * 변경 1건 요약 (기준일·고객처·주문·품목·유형·수량)
 */
const UnitSummary = ({ unit, changeTypes }: { unit: PoStatUnit; changeTypes: PoChangeTypeSetting[] }) => {
  const { t, lang } = useLanguage();
  const e = unit.events[0];
  const orders = [...new Set(unit.events.map((x) => x.order_no))];
  const items = [...new Set(unit.events.map((x) => `${x.item_no ?? ''} ${x.item_name ?? ''}`.trim()))];
  const removed = unit.events.filter((x) => x.direction === 'delete').reduce((s, x) => s + x.qty, 0);
  const added = unit.events.filter((x) => x.direction === 'add').reduce((s, x) => s + x.qty, 0);
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-[#F8FAFC] p-3 text-sm">
      <p className="font-medium text-[#172132]">
        {e.detected_on} · {e.display_customer_name ?? e.customer_name ?? t('미확인', 'Unknown')}
      </p>
      <p className="mt-0.5 text-[#5A6778]">
        {orders.join(', ')} · {items.length === 1 ? items[0] : t(`품목 ${items.length}개`, `${items.length} items`)}
      </p>
      <p className="mt-0.5 text-[#5A6778]">
        {getEventTypeName(e, changeTypes, lang)} ·{' '}
        {removed && added
          ? `−${numberFormat.format(removed)} / +${numberFormat.format(added)}`
          : numberFormat.format(unit.events.reduce((s, x) => s + x.qty, 0))}
      </p>
    </div>
  );
};

const RequestLinkDialogBody = ({
  unit,
  links,
  candidates,
  changeTypes,
  onClose,
  onLink,
  onUnlink,
  onExempt,
  onClearExempt,
}: RequestLinkDialogProps) => {
  const { t } = useLanguage();
  const first = unit.events[0];
  const registrationLabels = getRegistrationLabels(t);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  // 해제 메모를 쓰는 중인 연결
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [exempting, setExempting] = useState(false);
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.request_date.localeCompare(b.request_date));

  /**
   * 처리 실행 — 성공하면 창 닫기
   */
  const run = async (action: () => Promise<boolean>) => {
    setSaving(true);
    const ok = await action();
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {t('요청 연결', 'Linked requests')}
          <Badge variant="outline" className={REGISTRATION_BADGE_CLASSES[first.registration_status]}>
            {registrationLabels[first.registration_status]}
          </Badge>
        </DialogTitle>
        <DialogDescription>
          {t(
            '이 변경이 어떤 요청서에 따른 것인지 연결합니다. 연결하면 사유가 비어 있을 때 요청서의 사유·출처로 채워집니다.',
            'Link this change to the request behind it. When the reason is empty, it is filled from the request.'
          )}
        </DialogDescription>
      </DialogHeader>

      <UnitSummary unit={unit} changeTypes={changeTypes} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[#172132]">{t(`연결된 요청 ${links.length}`, `Linked requests ${links.length}`)}</h3>
        {links.length === 0 ? (
          <p className="text-sm text-[#8E98A8]">{t('연결된 요청이 없습니다.', 'No linked requests.')}</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.link_id} className="rounded-md border border-[#E4E9EF] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <RequestSummaryLine request={link} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[#5A6778]"
                    disabled={saving}
                    onClick={() => {
                      setUnlinkingId(unlinkingId === link.link_id ? null : link.link_id);
                      setNote('');
                    }}
                  >
                    <Link2Off className="h-4 w-4" />
                    {t('연결 해제', 'Unlink')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-[#8E98A8]">
                  {link.link_type === 'auto' ? t('자동 연결', 'Auto-linked') : t('직접 연결', 'Linked by hand')}
                  {/* 자동 연결은 처리자 이름이 '자동 연결'이라 겹치지 않게 뺌 */}
                  {link.linked_by_name && link.link_type === 'manual' ? ` · ${link.linked_by_name}` : ''}
                  {link.note ? ` · ${link.note}` : ''}
                </p>
                {unlinkingId === link.link_id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={note}
                      onChange={(ev) => setNote(ev.target.value)}
                      placeholder={t('해제하는 이유 (필수)', 'Why unlink (required)')}
                      rows={2}
                      aria-label={t('해제 메모', 'Unlink note')}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" disabled={saving || !note.trim()} onClick={() => void run(() => onUnlink(link.link_id, note))}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {t('해제', 'Unlink')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[#172132]">{t(`연결 후보 ${sorted.length}`, `Candidates ${sorted.length}`)}</h3>
        <p className="text-xs text-[#8E98A8]">
          {t(
            'SO 번호·품목코드가 같고 요청일 앞뒤 기간 안에 감지된 변경입니다. 유형·수량까지 맞고 후보가 하나뿐이면 자동으로 연결됩니다.',
            'Same SO and item, detected within the window around the request date. A single full match is linked automatically.'
          )}
        </p>
        {sorted.length === 0 ? (
          <p className="text-sm text-[#8E98A8]">{t('후보 요청이 없습니다.', 'No candidate requests.')}</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((c) => (
              <li key={`${c.request_id}|${c.item_key}`} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[#E4E9EF] p-3">
                <div className="min-w-0 space-y-1">
                  <RequestSummaryLine request={c} />
                  <MatchChips candidate={c} />
                </div>
                <Button
                  size="sm"
                  className="h-8 bg-[#8B1538] hover:bg-[#74112F]"
                  disabled={saving}
                  onClick={() => void run(() => onLink(unit.key, c, note))}
                >
                  <Link2 className="h-4 w-4" />
                  {t('연결', 'Link')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-[#E4E9EF] pt-4">
        <h3 className="text-sm font-semibold text-[#172132]">{t('예외 처리', 'Exempt')}</h3>
        {first.is_exempt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <span className="text-[#5A6778]">
              {first.exempt_note}
              {first.exempted_by_name ? <span className="ml-1 text-xs text-[#8E98A8]">· {first.exempted_by_name}</span> : null}
            </span>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void run(() => onClearExempt([unit.key]))}>
              <Undo2 className="h-4 w-4" />
              {t('예외 해제', 'Remove exemption')}
            </Button>
          </div>
        ) : exempting ? (
          <div className="space-y-2">
            <Label htmlFor="exempt-note" className="text-xs text-[#5A6778]">
              {t('요청서가 필요 없었던 이유 (필수)', 'Why no request was needed (required)')}
            </Label>
            <Textarea id="exempt-note" value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setExempting(false)}>{t('취소', 'Cancel')}</Button>
              <Button size="sm" className="bg-slate-700 hover:bg-slate-800" disabled={saving || !note.trim()} onClick={() => void run(() => onExempt([unit.key], note))}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {t('예외 처리', 'Exempt')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#8E98A8]">
              {t(
                '변경은 맞지만 요청서가 필요 없었던 건(예: 샘플·내부 이동)을 요청 없음에서 뺍니다. 실제 변경이 아니면 사유 입력 창의 "변경 아님"을 쓰세요.',
                'Removes a real change that needed no request (e.g. samples, internal moves) from No request. If it is not a real change, use "Not a change" in the reason dialog.'
              )}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setExempting(true);
                setUnlinkingId(null);
                setNote('');
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              {t('예외 처리', 'Exempt')}
            </Button>
          </div>
        )}
      </section>

      {!exempting && !unlinkingId && sorted.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="link-note" className="text-xs text-[#5A6778]">{t('연결 메모 (선택)', 'Link note (optional)')}</Label>
          <Textarea id="link-note" value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} />
        </div>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>{t('닫기', 'Close')}</Button>
      </DialogFooter>
    </DialogContent>
  );
};

/**
 * 후보의 일치 정도 표시 (유형·수량·해제했던 짝·반려된 요청)
 */
export const MatchChips = ({ candidate }: { candidate: MatchCandidate }) => {
  const { t } = useLanguage();
  const chip = (ok: boolean, label: string) => (
    <span className={cn('rounded px-1.5 py-0.5 text-xs', ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>{label}</span>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {chip(candidate.type_match, candidate.type_match ? t('유형 일치', 'Type matches') : t('유형 다름', 'Type differs'))}
      {candidate.qty_match === null
        ? null
        : chip(
            candidate.qty_match,
            candidate.qty_match
              ? t('수량 일치', 'Qty matches')
              : t(
                  `수량 다름 (요청 ${candidate.request_qty ?? '-'} / 변경 ${candidate.unit_qty ?? '-'})`,
                  `Qty differs (request ${candidate.request_qty ?? '-'} / change ${candidate.unit_qty ?? '-'})`
                )
          )}
      {candidate.was_unlinked ? (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t('해제했던 짝', 'Unlinked before')}</span>
      ) : null}
    </div>
  );
};

export const RequestLinkDialog = (
  props: Omit<RequestLinkDialogProps, 'unit'> & { unit: PoStatUnit | null }
) => {
  const { unit, ...rest } = props;
  return (
    <Dialog open={Boolean(unit)} onOpenChange={(open) => !open && rest.onClose()}>
      {unit ? <RequestLinkDialogBody key={unit.key} unit={unit} {...rest} /> : null}
    </Dialog>
  );
};
