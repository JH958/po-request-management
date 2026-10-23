/**
 * 요청의 등록일(= DO에 반영된 날) 칸 — 반영일과 요청일부터 걸린 일수, 상태(부분 반영·미반영·반영 전·SO 없음·추적 전)
 */
'use client';

import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { Translate } from '@/lib/i18n';
import type { PORequest, DoReflection } from '@/types/request';

type RequestDates = Pick<PORequest, 'status' | 'request_date' | 'confirmed_shipment_date' | 'desired_shipment_date' | 'factory_shipment_date'>;

interface RegistrationDateCellProps {
  request: RequestDates;
  reflection: DoReflection | undefined;
}

/**
 * 출하일이 지나도록 연결된 변경이 없는 승인 요청인지 (확정 → 희망 → 현재 출하일 순)
 */
const isOverdue = (request: RequestDates): boolean => {
  if (request.status !== 'approved' && request.status !== 'completed') return false;
  const due = request.confirmed_shipment_date || request.desired_shipment_date || request.factory_shipment_date;
  return due ? due < format(new Date(), 'yyyy-MM-dd') : false;
};

/**
 * 요청일부터 등록일(DO 반영일)까지 일수 — DO 반영이 요청보다 먼저면 음수(사후 요청)
 */
export const getDaysToRegistration = (request: RequestDates, reflection: DoReflection | undefined): number | null => {
  if (!reflection?.reflected_on || !request.request_date) return null;
  return differenceInCalendarDays(parseISO(reflection.reflected_on), parseISO(request.request_date));
};

/**
 * 등록 상태 문구 (반영됨이면 빈 값)
 */
export const getRegistrationStateText = (request: RequestDates, reflection: DoReflection | undefined, t: Translate): string => {
  if (!reflection) return '';
  switch (reflection.reflection) {
    case 'reflected':
      return '';
    case 'partial':
      return t('부분 반영', 'Partly reflected');
    case 'no_so':
      return t('SO 없음', 'No SO');
    case 'untracked':
      return t('추적 전', 'Before tracking');
    default:
      return isOverdue(request) ? t('미반영', 'Not reflected') : t('반영 전', 'Not yet');
  }
};

export const RegistrationDateCell = ({ request, reflection }: RegistrationDateCellProps) => {
  const { t } = useLanguage();
  if (!reflection) return <span className="text-[#8E98A8]">-</span>;
  const days = getDaysToRegistration(request, reflection);
  const state = getRegistrationStateText(request, reflection, t);
  const stateTitle: Record<DoReflection['reflection'], string> = {
    reflected: t(`연결된 DO 변경 ${reflection.linked_unit_count}건 중 마지막 반영일`, `Last of ${reflection.linked_unit_count} linked DO changes`),
    partial: t('연결 안 된 품목이 있거나 수량이 다릅니다', 'Some items are unlinked or quantities differ'),
    none: isOverdue(request)
      ? t('승인됐는데 출하일이 지나도록 연결된 DO 변경이 없습니다', 'Approved, but no DO change is linked after the ship date')
      : t('아직 DO에 반영되지 않았습니다', 'Not reflected in DO yet'),
    no_so: t('SO 번호가 없어 DO 변경과 맞춰 보지 않습니다', 'No SO number, so it is not matched with DO changes'),
    untracked: t('DO 변경 추적을 시작하기 전에 연결 기간이 끝난 요청입니다', 'The matching window ended before DO tracking started'),
  };
  return (
    <span className="whitespace-nowrap" title={stateTitle[reflection.reflection]}>
      {reflection.reflected_on ? <span>{reflection.reflected_on.replace(/-/g, '. ')}.</span> : <span className="text-[#8E98A8]">-</span>}
      {days !== null ? (
        <span className={cn('ml-1 text-xs', days < 0 ? 'text-sky-700' : 'text-[#5A6778]')}>
          {days < 0 ? t(`(요청 ${-days}일 전 반영)`, `(${-days}d before request)`) : `+${days}${t('일', 'd')}`}
        </span>
      ) : null}
      {state ? (
        <span
          className={cn(
            'ml-1 rounded px-1 text-xs',
            reflection.reflection === 'partial'
              ? 'bg-orange-100 text-orange-700'
              : state === t('미반영', 'Not reflected')
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-600'
          )}
        >
          {state}
        </span>
      ) : null}
    </span>
  );
};
