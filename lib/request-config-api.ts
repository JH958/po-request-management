/**
 * 요청구분·요청사유 Supabase API
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError } from '@/lib/request-helpers';
import type { RequestReasonSetting, RequestTypeSetting } from '@/types/request-config';
import type { ReasonOption, RequestTypeCard } from '@/lib/request-constants';

const formatConfigError = (error: unknown, table: string): string => {
  const err = asApiError(error);
  if (isTableMissingError(error, table)) {
    return `${table} 테이블이 없습니다. Supabase에서 migrations/add_request_config_settings.sql을 실행해주세요.`;
  }
  return err.message || '설정을 처리하지 못했습니다.';
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

const mapTypeRow = (row: Record<string, unknown>): RequestTypeSetting => ({
  id: row.id as string,
  value: row.value as string,
  label: row.label as string,
  description: (row.description as string) ?? null,
  sort_order: (row.sort_order as number) ?? 0,
  is_active: row.is_active as boolean,
  updated_at: row.updated_at as string,
  updated_by: (row.updated_by as string) ?? null,
});

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

export const toRequestTypeCard = (s: RequestTypeSetting): RequestTypeCard => ({
  value: s.value,
  label: s.label,
  description: s.description ?? undefined,
});

export const toReasonOption = (s: RequestReasonSetting): ReasonOption => ({
  value: s.value,
  label: s.label,
  description: s.description ?? undefined,
});

/**
 * 요청구분 목록 조회
 */
export const fetchRequestTypeSettings = async (
  activeOnly = false,
  options?: { strict?: boolean }
): Promise<RequestTypeSetting[]> => {
  const supabase = createClient();
  let query = supabase.from('request_type_settings').select('*').order('sort_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isTableMissingError(error, 'request_type_settings')) {
      const message = formatConfigError(error, 'request_type_settings');
      if (options?.strict) throw new Error(message);
      console.warn(message);
      return [];
    }
    throw new Error(formatConfigError(error, 'request_type_settings'));
  }
  return (data ?? []).map((row) => mapTypeRow(row as Record<string, unknown>));
};

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

export type RequestTypeUpsertInput = Omit<
  RequestTypeSetting,
  'id' | 'updated_at' | 'updated_by'
> & { id?: string };

export type RequestReasonUpsertInput = Omit<
  RequestReasonSetting,
  'id' | 'updated_at' | 'updated_by'
> & { id?: string };

/**
 * 요청구분 저장
 */
export const upsertRequestTypeSetting = async (
  input: RequestTypeUpsertInput,
  userId: string
): Promise<RequestTypeSetting> => {
  const supabase = createClient();
  const { id, ...fields } = input;
  const payload = {
    ...fields,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { data, error } = id
    ? await supabase.from('request_type_settings').update(payload).eq('id', id).select().single()
    : await supabase.from('request_type_settings').insert(payload).select().single();

  if (error) throw new Error(formatConfigError(error, 'request_type_settings'));
  return mapTypeRow(data as Record<string, unknown>);
};

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
 * 요청구분 삭제
 */
export const deleteRequestTypeSetting = async (id: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('request_type_settings').delete().eq('id', id);
  if (error) throw new Error(formatConfigError(error, 'request_type_settings'));
};

/**
 * 요청사유 삭제
 */
export const deleteRequestReasonSetting = async (id: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('request_reason_settings').delete().eq('id', id);
  if (error) throw new Error(formatConfigError(error, 'request_reason_settings'));
};
