/**
 * 프로즌 데이트 관련 타입 정의
 */

export type FrozenWeekday = 'MON' | 'FRI';

export type FrozenStatus = 'before' | 'after' | 'unset';

export interface FrozenRule {
  weeks: number;
  weekday?: FrozenWeekday;
}

export interface FrozenDateSetting {
  id: string;
  category: string | null;
  grade: string | null;
  country: string | null;
  customer_name: string;
  customer_product_weeks: number | null;
  customer_product_weekday: FrozenWeekday | null;
  customer_material_weeks: number | null;
  customer_material_weekday: FrozenWeekday | null;
  hq_product_weeks: number | null;
  hq_product_weekday: FrozenWeekday | null;
  hq_material_weeks: number | null;
  hq_material_weekday: FrozenWeekday | null;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type FrozenRuleFieldKey =
  | 'customer_product'
  | 'customer_material'
  | 'hq_product'
  | 'hq_material';

export interface FrozenRuleFieldValues {
  weeks: number | null;
  weekday: FrozenWeekday | null;
}
