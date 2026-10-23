/**
 * 요청 ↔ DO 변경 연결 Supabase API — 연결·후보·미반영 요청 조회, 연결·해제·예외 처리·다시 매칭, 요청별 DO 반영, 연결 기준
 */
import { createClient } from '@/lib/supabase/client';
import { formatPoTrackerError } from '@/lib/po-changes-api';
import { translateNow as tn } from '@/lib/i18n';
import type { ChangeRequestLink, MatchCandidate, MatchSettings, UnreflectedRequest } from '@/types/po-changes';
import type { DoReflection } from '@/types/request';

/**
 * 기간 안 변경에 연결된 요청 (영업관리팀)
 */
export const fetchChangeLinks = async (from: string, to: string): Promise<ChangeRequestLink[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('po_change_links', { p_from: from, p_to: to });
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as ChangeRequestLink[];
};

/**
 * 기간 안 변경의 연결 후보 (영업관리팀, 이미 연결된 짝 제외)
 */
export const fetchMatchCandidates = async (from: string, to: string): Promise<MatchCandidate[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('po_match_candidates', { p_from: from, p_to: to });
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as MatchCandidate[];
};

/**
 * 미반영 요청 — 승인됐는데 출하일이 지나도록 연결된 변경이 없는 요청 (영업관리팀)
 */
export const fetchUnreflectedRequests = async (): Promise<UnreflectedRequest[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('po_unreflected_requests');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as UnreflectedRequest[];
};

/**
 * 요청과 변경 연결 — 사유가 비어 있으면 요청서 값으로 채워짐
 * @param key 변경 1건 키 (stat_unit_key)
 * @param itemKey 요청 품목코드 (요청 단위 연결이면 빈칸)
 */
export const linkChangeRequest = async (key: string, requestId: string, itemKey: string, note: string | null): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.rpc('link_change_request', {
    p_key: key,
    p_request_id: requestId,
    p_item_key: itemKey || null,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 연결 해제 (메모 필수) — 요청서에서 가져온 채 고치지 않은 사유도 지워짐
 */
export const unlinkChangeRequest = async (linkId: string, note: string): Promise<void> => {
  if (!note.trim()) throw new Error(tn('연결을 해제하는 이유를 메모로 입력해주세요.', 'Enter why you are unlinking.'));
  const supabase = createClient();
  const { error } = await supabase.rpc('unlink_change_request', { p_link_id: linkId, p_note: note.trim() });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 예외 처리 (메모 필수) — 요청서가 필요 없었던 변경을 요청 없음에서 뺌
 * @returns 처리한 건수
 */
export const setChangeExemptions = async (keys: string[], note: string): Promise<number> => {
  if (!note.trim()) throw new Error(tn('요청서가 필요 없었던 이유를 메모로 입력해주세요.', 'Enter why no request was needed.'));
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_change_exemptions', { p_keys: keys, p_note: note.trim() });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * 예외 처리 해제
 * @returns 해제한 건수
 */
export const clearChangeExemptions = async (keys: string[]): Promise<number> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('clear_change_exemptions', { p_keys: keys });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * 다시 매칭 — 자동 연결 조건에 맞는 짝을 찾아 연결
 * @returns 새로 연결한 건수
 */
export const rematchChangeRequests = async (): Promise<number> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rematch_change_requests');
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * 요청별 DO 반영 상태 (본인이 볼 수 있는 요청만) — 함수가 없으면(마이그레이션 전) 빈 결과
 * @returns 요청 ID → 반영 상태
 */
export const fetchRequestReflections = async (ids: string[]): Promise<Map<string, DoReflection>> => {
  const result = new Map<string, DoReflection>();
  if (ids.length === 0) return result;
  const supabase = createClient();
  // 요청 ID가 많으면 나눠서 (URL 길이 제한 없음 — rpc는 POST)
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc('po_request_reflections', { p_ids: ids.slice(i, i + 500) });
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('DO 반영 상태 조회 실패:', error);
      }
      return result;
    }
    ((data ?? []) as DoReflection[]).forEach((row) => result.set(row.request_id, row));
  }
  return result;
};

/**
 * 요청 연결 기준 조회
 */
export const fetchMatchSettings = async (): Promise<MatchSettings> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_match_settings')
    .select('days_before, days_after, grace_business_days')
    .maybeSingle();
  if (error) throw new Error(formatPoTrackerError(error));
  return (data as MatchSettings | null) ?? { days_before: 7, days_after: 45, grace_business_days: 5 };
};

/**
 * 요청 연결 기준 저장 (관리자)
 */
export const saveMatchSettings = async (settings: MatchSettings, userId: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_match_settings')
    .upsert({ id: true, ...settings, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(formatPoTrackerError(error));
};
