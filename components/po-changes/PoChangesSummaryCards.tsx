/**
 * PO 변경 요약 카드 (변경 건수·확인 필요·사유 미입력·요청 등록률·신규 주문·재등록 대기)
 */
'use client';

import { useLanguage } from '@/context/LanguageContext';
import type { RegistrationCounts } from '@/lib/po-changes-utils';

interface PoChangesSummaryCardsProps {
  changeCount: number;
  reviewCount: number;
  newOrders: number;
  pendingCount: number;
  missingReasonCount: number;
  /** 사유 미입력 카드를 누르면 미입력 건만 보기 */
  onShowMissingReasons: () => void;
  /** 등록 상태별 건수 */
  registration: RegistrationCounts;
  /** 등록률 카드를 누르면 미등록 변경 탭 */
  onShowUnregistered: () => void;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

const Card = ({
  label,
  value,
  hint,
  emphasize,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  emphasize?: boolean;
  onClick?: () => void;
}) => {
  const body = (
    <>
    <p className="text-sm text-[#5A6778]">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${emphasize && typeof value === 'number' && value > 0 ? 'text-[#8B1538]' : 'text-[#172132]'}`}>
      {typeof value === 'number' ? numberFormat.format(value) : value}
    </p>
    <p className="mt-1 text-xs text-[#8E98A8]">{hint}</p>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-white px-5 py-4 text-left transition-colors hover:border-[#8B1538]/40 hover:bg-[#FBF7F8]"
    >
      {body}
    </button>
  ) : (
    <div className="rounded-lg border bg-white px-5 py-4">{body}</div>
  );
};

export const PoChangesSummaryCards = ({
  changeCount,
  reviewCount,
  newOrders,
  pendingCount,
  missingReasonCount,
  onShowMissingReasons,
  registration,
  onShowUnregistered,
}: PoChangesSummaryCardsProps) => {
  const { t } = useLanguage();
  const registered = registration.pre + registration.post;
  const rate = registration.total ? Math.round((registered / registration.total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <Card
        label={t('변경 건수', 'Changes')}
        value={changeCount}
        hint={t('분할/합배송·품목코드 변경 묶음은 1건으로 집계', 'Split and item code groups count as one')}
      />
      <Card
        label={t('확인 필요', 'To review')}
        value={reviewCount}
        hint={t('분할/합배송·품목코드 변경 후보', 'Split shipment and item code candidates')}
        emphasize
      />
      <Card
        label={t('사유 미입력', 'Reason missing')}
        value={missingReasonCount}
        hint={t('눌러서 미입력 건만 보기', 'Click to show only these')}
        emphasize
        onClick={onShowMissingReasons}
      />
      <Card
        label={t('요청 등록률', 'Registered rate')}
        value={registration.total ? `${rate}%` : '-'}
        hint={t(
          `사전 ${registration.pre} · 사후 ${registration.post} / ${registration.total}건 · 미등록 ${registration.unregistered}`,
          `Before ${registration.pre} · after ${registration.post} of ${registration.total} · unregistered ${registration.unregistered}`
        )}
        onClick={onShowUnregistered}
      />
      <Card label={t('신규 주문', 'New orders')} value={newOrders} hint={t('기간 내 처음 나타난 주문', 'Orders first seen in this period')} />
      <Card
        label={t('재등록 대기', 'Pending re-registration')}
        value={pendingCount}
        hint={t('현재 기준 (기간과 무관)', 'Current, regardless of period')}
      />
    </div>
  );
};
