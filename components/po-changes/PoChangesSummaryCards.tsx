/**
 * PO 변경 요약 카드 (변경 건수·확인 필요·사유 미입력·신규 주문·재등록 대기)
 */
'use client';

import { useLanguage } from '@/context/LanguageContext';

interface PoChangesSummaryCardsProps {
  changeCount: number;
  reviewCount: number;
  newOrders: number;
  pendingCount: number;
  missingReasonCount: number;
  /** 사유 미입력 카드를 누르면 미입력 건만 보기 */
  onShowMissingReasons: () => void;
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
  value: number;
  hint: string;
  emphasize?: boolean;
  onClick?: () => void;
}) => {
  const body = (
    <>
    <p className="text-sm text-[#5A6778]">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${emphasize && value > 0 ? 'text-[#8B1538]' : 'text-[#172132]'}`}>
      {numberFormat.format(value)}
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
}: PoChangesSummaryCardsProps) => {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
      <Card label={t('신규 주문', 'New orders')} value={newOrders} hint={t('기간 내 처음 나타난 주문', 'Orders first seen in this period')} />
      <Card
        label={t('재등록 대기', 'Pending re-registration')}
        value={pendingCount}
        hint={t('현재 기준 (기간과 무관)', 'Current, regardless of period')}
      />
    </div>
  );
};
