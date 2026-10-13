/**
 * 프로즌 데이트 UI 라벨 유틸리티 (언어는 호출하는 쪽의 t로 결정)
 */
import type { Translate } from '@/lib/i18n';
import type { FrozenStatus, FrozenWeekday } from '@/types/frozen-date';

export const getFrozenWeekdayOptions = (
  t: Translate
): Array<{ value: FrozenWeekday | 'NONE'; label: string }> => [
  { value: 'MON', label: t('월요일', 'Monday') },
  { value: 'FRI', label: t('금요일', 'Friday') },
  { value: 'NONE', label: t('지정없음', 'None') },
];

export const formatFrozenWeekday = (weekday: FrozenWeekday | null | undefined, t: Translate): string | null => {
  if (weekday === 'MON') return t('월요일', 'Monday');
  if (weekday === 'FRI') return t('금요일', 'Friday');
  return null;
};

export const formatFrozenRule = (
  weeks: number | null,
  weekday: FrozenWeekday | null | undefined,
  t: Translate
): string => {
  if (weeks == null) return t('미설정', 'Not set');
  const dayLabel = formatFrozenWeekday(weekday, t);
  const weeksText = t(`${weeks}주전`, `${weeks} wk before`);
  return dayLabel ? `${weeksText} ${dayLabel}` : weeksText;
};

export const getFrozenStatusLabels = (t: Translate): Record<FrozenStatus, string> => ({
  before: t('프로즌 이전', 'Before frozen'),
  after: t('프로즌 이후', 'After frozen'),
  unset: t('미설정', 'Not set'),
});
