/**
 * 후보 묶음 카드 — 줄어든 쪽·늘어난 쪽을 나란히 보여주고 승인/반려/되돌리기
 */
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowRight, Check, History, Loader2, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/context/LanguageContext';
import type { Translate } from '@/lib/i18n';
import { getChangeGroupStatusLabels, getChangeGroupTypeLabels } from '@/lib/po-tracker-labels';
import { cn } from '@/lib/utils';
import type { ChangeGroupReview, ChangeGroupStatus, PoChangeEvent, PoChangeGroup } from '@/types/po-changes';

interface ChangeGroupCardProps {
  group: PoChangeGroup;
  currentUserId: string;
  busy: boolean;
  onReview: (groupId: string, status: ChangeGroupStatus, note: string | null) => Promise<void>;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

const STATUS_CLASS: Record<ChangeGroupStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-green-200 bg-green-50 text-green-700',
  rejected: 'border-slate-200 bg-slate-50 text-slate-600',
};

/**
 * 이벤트 한 줄 (주문·라인·DO·품목·수량 변화)
 */
const EventLine = ({ event, sign }: { event: PoChangeEvent; sign: '-' | '+' }) => {
  const { t } = useLanguage();
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-[#F8FAFC] px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-[#172132]">
          {event.order_no} <span className="font-normal text-[#5A6778]">L{event.line_no}</span>
        </span>
        <span className={cn('text-base font-bold', sign === '-' ? 'text-[#8B1538]' : 'text-[#1E40AF]')}>
          {sign}
          {numberFormat.format(event.qty)}
        </span>
      </div>
      <p className="mt-0.5 text-[#253143]">
        {event.item_no} <span className="text-[#5A6778]">{event.item_name}</span>
      </p>
      <p className="mt-0.5 text-xs text-[#8E98A8]">
        DO {event.do_no ?? '-'}
        {event.qty_before !== null && event.qty_after !== null
          ? ` · ${t('수량', 'Qty')} ${numberFormat.format(event.qty_before)} → ${numberFormat.format(event.qty_after)}`
          : ''}
        {event.customer_name ? ` · ${event.customer_name}` : ''}
      </p>
    </div>
  );
};

/**
 * 처리자 표시 — 이름(부서), 본인이면 "나" 표시
 */
const reviewerText = (
  name: string | null,
  department: string | null,
  isMe: boolean,
  t: Translate
): string => {
  const who = name ?? (isMe ? t('나', 'me') : t('이름 미확인', 'Unknown'));
  const dept = department ? ` (${department})` : '';
  return `${who}${dept}${isMe && name ? ` · ${t('나', 'me')}` : ''}`;
};

/**
 * 처리 이력 목록 (최신순) — 되돌린 기록까지 모두 보여 누가 무엇을 했는지 확인
 */
const ReviewHistory = ({ reviews, currentUserId }: { reviews: ChangeGroupReview[]; currentUserId: string }) => {
  const { t } = useLanguage();
  const statusLabels = getChangeGroupStatusLabels(t);
  if (reviews.length === 0) return null;
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#5A6778] hover:text-[#253143]">
        <History className="h-3.5 w-3.5" />
        {t(`처리 이력 ${reviews.length}건`, `History (${reviews.length})`)}
      </summary>
      <ol className="mt-2 space-y-1.5 border-l-2 border-[#E4E9EF] pl-3">
        {reviews.map((r) => (
          <li key={r.id} className="text-xs text-[#5A6778]">
            <span className="font-medium text-[#253143]">
              {r.status === 'pending' ? t('확인 전으로 되돌림', 'Moved back to review') : statusLabels[r.status]}
            </span>
            {` · ${format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')} · `}
            {reviewerText(r.reviewer_name, r.reviewer_department, r.reviewer_id === currentUserId, t)}
            {r.note ? <span className="block text-[#253143]">“{r.note}”</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
};

export const ChangeGroupCard = ({ group, currentUserId, busy, onReview }: ChangeGroupCardProps) => {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const typeLabels = getChangeGroupTypeLabels(t);
  const statusLabels = getChangeGroupStatusLabels(t);

  const removed = group.events.filter((e) => e.direction === 'delete');
  const added = group.events.filter((e) => e.direction === 'add');
  const first = group.events[0];
  const customers = [...new Set(group.events.map((e) => e.customer_name).filter(Boolean))];
  const isSplit = group.group_type === 'split';
  const noteMissing = note.trim() === '';
  // 현재 처리 상태의 처리자 부서 — 가장 최근 이력에서 가져옴
  const latestReview = group.reviews[0];
  const reviewerDepartment = latestReview && latestReview.status === group.status ? latestReview.reviewer_department : null;

  return (
    <article className="rounded-lg border bg-white p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Badge className={cn('border', isSplit ? 'border-[#8B1538]/30 bg-[#8B1538]/10 text-[#8B1538]' : 'border-[#1E40AF]/30 bg-[#1E40AF]/10 text-[#1E40AF]')}>
          {typeLabels[group.group_type]}
        </Badge>
        <Badge variant="outline" className={cn(STATUS_CLASS[group.status])}>
          {statusLabels[group.status]}
        </Badge>
        {group.customer_unverified ? (
          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
            {t('고객처 미확인', 'Customer unverified')}
          </Badge>
        ) : null}
        <span className="ml-auto text-sm text-[#5A6778]">
          {first?.detected_on}
          {customers.length ? ` · ${customers.join(', ')}` : ''}
        </span>
      </header>

      <div className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-[#5A6778]">
            {isSplit ? t('줄어든 쪽', 'Reduced') : t('기존 품목', 'Old item')}
          </h4>
          {removed.map((e) => <EventLine key={e.id} event={e} sign="-" />)}
        </section>
        <div className="hidden items-center justify-center md:flex">
          <ArrowRight className="h-5 w-5 text-[#8E98A8]" />
        </div>
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-[#5A6778]">
            {isSplit ? t('늘어난 쪽', 'Added') : t('새 품목', 'New item')}
          </h4>
          {added.map((e) => <EventLine key={e.id} event={e} sign="+" />)}
        </section>
      </div>

      <footer className="mt-4 border-t border-[#E4E9EF] pt-4">
        {group.status === 'pending' ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="space-y-1 md:flex-1">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t(
                  '메모 (필수) — 판단 근거를 적어주세요. 예: 적재 초과로 2개 PO로 나눠 출하',
                  'Note (required) — explain your decision, e.g. split into two POs due to load limit'
                )}
                rows={2}
                required
                aria-required="true"
                aria-label={t('검토 메모 (필수)', 'Review note (required)')}
              />
              {noteMissing ? (
                <p className="text-xs text-[#8E98A8]">
                  {t('메모를 입력해야 승인·반려할 수 있습니다.', 'Enter a note to approve or reject.')}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy || noteMissing}
                onClick={() => void onReview(group.id, 'rejected', note)}
                className="border-[#D6DDE7] shadow-none"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                {t('반려', 'Reject')}
              </Button>
              <Button
                disabled={busy || noteMissing}
                onClick={() => void onReview(group.id, 'approved', note)}
                className="bg-[#8B1538] hover:bg-[#74112F]"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t('승인', 'Approve')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-[#5A6778]">
              <span className="font-medium text-[#253143]">{statusLabels[group.status]}</span>
              {group.reviewed_at ? ` · ${format(new Date(group.reviewed_at), 'yyyy-MM-dd HH:mm')}` : ''}
              {' · '}
              {t('처리자', 'Reviewer')}{' '}
              <span className="font-medium text-[#253143]">
                {reviewerText(group.reviewed_by_name, reviewerDepartment, group.reviewed_by === currentUserId, t)}
              </span>
              {group.review_note ? <p className="mt-1 text-[#253143]">“{group.review_note}”</p> : null}
              {group.status === 'rejected' ? (
                <p className="mt-1 text-xs text-[#8E98A8]">
                  {t('반려된 묶음은 통계에서 삭제·추가를 각각 셉니다.', 'Rejected groups are counted as separate removals and additions.')}
                </p>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onReview(group.id, 'pending', null)}
              className="border-[#D6DDE7] shadow-none"
            >
              <RotateCcw className="h-4 w-4" />
              {t('확인 전으로 되돌리기', 'Move back to review')}
            </Button>
          </div>
        )}
        <ReviewHistory reviews={group.reviews} currentUserId={currentUserId} />
      </footer>
    </article>
  );
};
