/**
 * 요청의 DO 반영 배지 — 반영됨(감지일) / 부분 반영 / 미반영(승인됐는데 출하일 지남) / 반영 전 / SO 없음 / 추적 전
 */
'use client';

import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { PORequest, DoReflection } from '@/types/request';

interface DoReflectionBadgeProps {
  request: Pick<PORequest, 'status' | 'confirmed_shipment_date' | 'desired_shipment_date' | 'factory_shipment_date'>;
  reflection: DoReflection | undefined;
}

/**
 * 출하일이 지나도록 연결된 변경이 없는 승인 요청인지 (확정 → 희망 → 현재 출하일 순)
 */
const isOverdue = (request: DoReflectionBadgeProps['request']): boolean => {
  if (request.status !== 'approved' && request.status !== 'completed') return false;
  const due = request.confirmed_shipment_date || request.desired_shipment_date || request.factory_shipment_date;
  return due ? due < format(new Date(), 'yyyy-MM-dd') : false;
};

export const DoReflectionBadge = ({ request, reflection }: DoReflectionBadgeProps) => {
  const { t } = useLanguage();
  if (!reflection) return <span className="text-[#8E98A8]">-</span>;

  if (reflection.reflection === 'reflected' || reflection.reflection === 'partial') {
    const day = reflection.reflected_on ? reflection.reflected_on.slice(5).replace('-', '/') : '';
    const partial = reflection.reflection === 'partial';
    return (
      <Badge
        className={cn('whitespace-nowrap', partial ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700')}
        title={t(
          `연결된 DO 변경 ${reflection.linked_unit_count}건${partial ? ' · 연결 안 된 품목이 있거나 수량이 다릅니다' : ''}`,
          `${reflection.linked_unit_count} linked DO changes${partial ? ' · some items are unlinked or quantities differ' : ''}`
        )}
      >
        {partial ? t('부분 반영', 'Partly reflected') : t('반영됨', 'Reflected')}
        {day ? ` ${day}` : ''}
      </Badge>
    );
  }
  if (reflection.reflection === 'no_so') {
    return (
      <Badge className="whitespace-nowrap bg-slate-50 text-slate-500" title={t('SO 번호가 없어 DO 변경과 맞춰 보지 않습니다.', 'No SO number, so it is not matched with DO changes.')}>
        {t('SO 없음', 'No SO')}
      </Badge>
    );
  }
  if (reflection.reflection === 'untracked') {
    return (
      <Badge className="whitespace-nowrap bg-slate-50 text-slate-500" title={t('DO 변경 추적을 시작하기 전에 연결 기간이 끝난 요청이라 DO 변경과 맞춰 보지 않습니다.', 'The matching window ended before DO tracking started, so it is not matched.')}>
        {t('추적 전', 'Before tracking')}
      </Badge>
    );
  }
  return isOverdue(request) ? (
    <Badge className="whitespace-nowrap bg-red-100 text-red-700" title={t('승인됐는데 출하일이 지나도록 연결된 DO 변경이 없습니다.', 'Approved, but no DO change is linked after the ship date.')}>
      {t('미반영', 'Not reflected')}
    </Badge>
  ) : (
    <Badge className="whitespace-nowrap bg-slate-100 text-slate-600">{t('반영 전', 'Not yet')}</Badge>
  );
};

/**
 * Excel용 DO 반영 문구
 */
export const getDoReflectionText = (
  request: DoReflectionBadgeProps['request'],
  reflection: DoReflection | undefined,
  t: (ko: string, en: string) => string
): string => {
  if (!reflection) return '';
  if (reflection.reflection === 'reflected') return `${t('반영됨', 'Reflected')} ${reflection.reflected_on ?? ''}`.trim();
  if (reflection.reflection === 'partial') return `${t('부분 반영', 'Partly reflected')} ${reflection.reflected_on ?? ''}`.trim();
  if (reflection.reflection === 'no_so') return t('SO 없음', 'No SO');
  if (reflection.reflection === 'untracked') return t('추적 전', 'Before tracking');
  return isOverdue(request) ? t('미반영', 'Not reflected') : t('반영 전', 'Not yet');
};
