/**
 * 프로즌 데이트 계산 및 판정 유틸리티
 */
import { subDays } from 'date-fns';
import { isHeadquartersDepartment } from '@/lib/request-access-scope';
import type { FrozenDateSetting, FrozenRule, FrozenStatus } from '@/types/frozen-date';

export const MATERIAL_REQUEST_TYPE_VALUES = ['material_add', 'material_delete'] as const;

/**
 * 요청자 소속 유형 반환
 */
export const getRequesterType = (department: string): 'customer' | 'hq' =>
  isHeadquartersDepartment(department) ? 'hq' : 'customer';

/**
 * 프로즌 데이트 계산
 */
export const calculateFrozenDate = (shipDate: Date, rule: FrozenRule): Date => {
  const tempDate = subDays(shipDate, rule.weeks * 7);
  if (!rule.weekday) return tempDate;

  const dayIndex = (tempDate.getDay() + 6) % 7;
  const targetIndex = rule.weekday === 'MON' ? 0 : 4;
  return subDays(tempDate, dayIndex - targetIndex);
};

/**
 * 요청일 기준 프로즌 여부 판정
 */
export const isFrozen = (
  requestDate: Date,
  shipDate: Date,
  rule: FrozenRule | null
): FrozenStatus => {
  if (!rule) return 'unset';
  const frozenDate = calculateFrozenDate(shipDate, rule);
  return requestDate >= frozenDate ? 'after' : 'before';
};

/**
 * 설정 레코드에서 적용할 규칙 선택
 */
export const getApplicableRule = (
  setting: FrozenDateSetting | null,
  requesterType: 'customer' | 'hq',
  requestTypeValue: string
): FrozenRule | null => {
  if (!setting) return null;

  const isMaterial = MATERIAL_REQUEST_TYPE_VALUES.includes(
    requestTypeValue as (typeof MATERIAL_REQUEST_TYPE_VALUES)[number]
  );

  const weeks =
    requesterType === 'customer'
      ? isMaterial
        ? setting.customer_material_weeks
        : setting.customer_product_weeks
      : isMaterial
        ? setting.hq_material_weeks
        : setting.hq_product_weeks;

  const weekday =
    requesterType === 'customer'
      ? isMaterial
        ? setting.customer_material_weekday
        : setting.customer_product_weekday
      : isMaterial
        ? setting.hq_material_weekday
        : setting.hq_product_weekday;

  if (weeks == null) return null;
  return { weeks, weekday: weekday ?? undefined };
};

/**
 * 설정 레코드가 전체 미설정인지 확인
 */
export const isSettingFullyUnset = (setting: FrozenDateSetting): boolean =>
  setting.customer_product_weeks == null &&
  setting.customer_material_weeks == null &&
  setting.hq_product_weeks == null &&
  setting.hq_material_weeks == null;

/**
 * 프로즌 판정에 필요한 입력으로 상태 계산
 */
export const resolveFrozenStatus = (params: {
  setting: FrozenDateSetting | null;
  requesterDepartment: string;
  requestTypeValue: string;
  shipDate: string;
  requestDate?: string;
}): FrozenStatus => {
  const { setting, requesterDepartment, requestTypeValue, shipDate, requestDate } = params;
  if (!shipDate) return 'unset';

  const ship = new Date(shipDate);
  const request = requestDate ? new Date(requestDate) : new Date();
  if (Number.isNaN(ship.getTime()) || Number.isNaN(request.getTime())) return 'unset';

  const requesterType = getRequesterType(requesterDepartment);
  const rule = getApplicableRule(setting, requesterType, requestTypeValue);
  return isFrozen(request, ship, rule);
};
