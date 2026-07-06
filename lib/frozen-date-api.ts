/**
 * 프로즌 데이트 Supabase 조회/저장 유틸리티
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError } from '@/lib/request-helpers';
import type { FrozenDateSetting } from '@/types/frozen-date';

const TABLE_MISSING_HINT =
  'frozen_date_settings 테이블이 없습니다. Supabase에서 migrations/add_frozen_date_settings.sql을 실행해주세요.';

const formatFrozenApiError = (error: unknown): string => {
  const err = asApiError(error);
  if (err.code === '42P01' || err.code === 'PGRST205' || err.message?.includes('frozen_date_settings')) {
    return TABLE_MISSING_HINT;
  }
  if (err.message) return err.message;
  return '프로즌 설정을 조회하지 못했습니다.';
};

const mapRow = (row: Record<string, unknown>): FrozenDateSetting => ({
  id: row.id as string,
  category: (row.category as string) ?? null,
  grade: (row.grade as string) ?? null,
  country: (row.country as string) ?? null,
  customer_name: row.customer_name as string,
  customer_product_weeks: (row.customer_product_weeks as number | null) ?? null,
  customer_product_weekday: (row.customer_product_weekday as FrozenDateSetting['customer_product_weekday']) ?? null,
  customer_material_weeks: (row.customer_material_weeks as number | null) ?? null,
  customer_material_weekday: (row.customer_material_weekday as FrozenDateSetting['customer_material_weekday']) ?? null,
  hq_product_weeks: (row.hq_product_weeks as number | null) ?? null,
  hq_product_weekday: (row.hq_product_weekday as FrozenDateSetting['hq_product_weekday']) ?? null,
  hq_material_weeks: (row.hq_material_weeks as number | null) ?? null,
  hq_material_weekday: (row.hq_material_weekday as FrozenDateSetting['hq_material_weekday']) ?? null,
  note: (row.note as string) ?? null,
  updated_at: row.updated_at as string,
  updated_by: (row.updated_by as string) ?? null,
});

/**
 * 고객처명으로 프로즌 설정 단건 조회
 */
export const fetchFrozenSettingByCustomer = async (
  customerName: string
): Promise<FrozenDateSetting | null> => {
  if (!customerName.trim()) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('frozen_date_settings')
      .select('*')
      .eq('customer_name', customerName)
      .maybeSingle();

    if (error) {
      console.error('프로즌 설정 조회 실패:', error.message, error.code, error);
      return null;
    }
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch (error) {
    console.error('프로즌 설정 조회 오류:', error);
    return null;
  }
};

/**
 * 프로즌 설정 전체 목록 조회
 */
export const fetchAllFrozenSettings = async (): Promise<FrozenDateSetting[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('frozen_date_settings')
    .select('*')
    .order('customer_name', { ascending: true });

  if (error) {
    const message = formatFrozenApiError(error);
    console.error('프로즌 설정 목록 조회 실패:', message, error.message, error.code);
    throw new Error(message);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
};
export type FrozenSettingUpsertInput = Omit<
  FrozenDateSetting,
  'id' | 'updated_at' | 'updated_by'
> & { id?: string };

/**
 * 프로즌 설정 저장 (신규/수정)
 */
export const upsertFrozenSetting = async (
  input: FrozenSettingUpsertInput,
  userId: string
): Promise<FrozenDateSetting> => {
  const supabase = createClient();
  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { data, error } = await supabase
    .from('frozen_date_settings')
    .upsert(payload, { onConflict: 'customer_name' })
    .select()
    .single();

  if (error) {
    const message = formatFrozenApiError(error);
    throw new Error(message);
  }
  return mapRow(data as Record<string, unknown>);
};
