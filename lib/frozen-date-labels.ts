/**
 * 프로즌 데이트 UI 라벨 유틸리티
 */
import type { FrozenStatus, FrozenWeekday } from '@/types/frozen-date';

export const FROZEN_WEEKDAY_OPTIONS: Array<{ value: FrozenWeekday | 'NONE'; label: string }> = [
  { value: 'MON', label: '월요일' },
  { value: 'FRI', label: '금요일' },
  { value: 'NONE', label: '지정없음' },
];

export const formatFrozenWeekday = (weekday: FrozenWeekday | null | undefined): string => {
  if (weekday === 'MON') return '월요일';
  if (weekday === 'FRI') return '금요일';
  return '지정없음';
};

export const formatFrozenRule = (
  weeks: number | null,
  weekday: FrozenWeekday | null | undefined
): string => {
  if (weeks == null) return '미설정';
  const dayLabel = formatFrozenWeekday(weekday);
  return dayLabel === '지정없음' ? `${weeks}주전` : `${weeks}주전 ${dayLabel}`;
};

export const FROZEN_STATUS_LABELS: Record<FrozenStatus, string> = {
  before: '프로즌 이전',
  after: '프로즌 이후',
  unset: '미설정',
};
