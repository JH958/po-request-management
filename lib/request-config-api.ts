/**
 * PO 변경 사유(요청사유) Supabase API — 요청구분은 PO 변경 유형(po_change_type_settings)으로 통합
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError } from '@/lib/request-helpers';
import { translateNow as tn } from '@/lib/i18n';
import type { RequestReasonSetting } from '@/types/request-config';
import type { ReasonOption } from '@/lib/request-constants';

const formatConfigError = (error: unknown, table: string): string => {
  const err = asApiError(error);
  if (isTableMissingError(error, table)) {
    return tn(
      `${table} 테이블이 없습니다. Supabase에서 migrations/add_request_config_settings.sql을 실행해주세요.`,
      `The ${table} table is missing. Run migrations/add_request_config_settings.sql in Supabase.`
    );
  }
  return err.message || tn('설정을 처리하지 못했습니다.', 'Could not process the settings.');
};

/** 테이블 미생성·스키마 캐시 미반영 오류 여부 */
export const isTableMissingError = (error: unknown, table: string): boolean => {
  const err = asApiError(error);
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    err.code === 'PGRST116' ||
    Boolean(err.message?.includes(table)) ||
    Boolean(err.message?.includes('does not exist')) ||
    Boolean(err.message?.includes('schema cache'))
  );
};

const mapReasonRow = (row: Record<string, unknown>): RequestReasonSetting => ({
  id: row.id as string,
  value: row.value as string,
  label: row.label as string,
  description: (row.description as string) ?? null,
  sort_order: (row.sort_order as number) ?? 0,
  is_active: row.is_active as boolean,
  updated_at: row.updated_at as string,
  updated_by: (row.updated_by as string) ?? null,
});

export const toReasonOption = (s: RequestReasonSetting): ReasonOption => ({
  value: s.value,
  label: s.label,
  description: s.description ?? undefined,
});

/**
 * 요청사유 목록 조회
 */
export const fetchRequestReasonSettings = async (
  activeOnly = false,
  options?: { strict?: boolean }
): Promise<RequestReasonSetting[]> => {
  const supabase = createClient();
  let query = supabase.from('request_reason_settings').select('*').order('sort_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isTableMissingError(error, 'request_reason_settings')) {
      const message = formatConfigError(error, 'request_reason_settings');
      if (options?.strict) throw new Error(message);
      console.warn(message);
      return [];
    }
    throw new Error(formatConfigError(error, 'request_reason_settings'));
  }
  return (data ?? []).map((row) => mapReasonRow(row as Record<string, unknown>));
};

export type RequestReasonUpsertInput = Omit<
  RequestReasonSetting,
  'id' | 'updated_at' | 'updated_by'
> & { id?: string };

/**
 * 요청사유 저장
 */
export const upsertRequestReasonSetting = async (
  input: RequestReasonUpsertInput,
  userId: string
): Promise<RequestReasonSetting> => {
  const supabase = createClient();
  const { id, ...fields } = input;
  const payload = {
    ...fields,
    value: fields.label,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { data, error } = id
    ? await supabase.from('request_reason_settings').update(payload).eq('id', id).select().single()
    : await supabase.from('request_reason_settings').insert(payload).select().single();

  if (error) throw new Error(formatConfigError(error, 'request_reason_settings'));
  return mapReasonRow(data as Record<string, unknown>);
};

/**
 * 요청사유 삭제
 */
export const deleteRequestReasonSetting = async (id: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('request_reason_settings').delete().eq('id', id);
  if (error) throw new Error(formatConfigError(error, 'request_reason_settings'));
};
