/**
 * PO 변경 페이지 Supabase API — 변경 이벤트·후보 묶음·재등록 대기 조회, 후보 승인/반려
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError, getReadableErrorMessage } from '@/lib/request-helpers';
import { translateNow as tn } from '@/lib/i18n';
import type {
  ChangeGroupStatus,
  DoUploadDay,
  PendingReRegistrationLine,
  PoChangeEvent,
  PoChangeGroup,
  PoChangeTypeSetting,
  PoRequestOrigin,
  ChangeReasonInput,
} from '@/types/po-changes';

/** PostgREST 한 번에 받는 최대 행 수 */
const PAGE_SIZE = 1000;

const EVENT_COLUMNS = [
  'id', 'upload_id', 'detected_on', 'order_no', 'line_no', 'do_no', 'item_no', 'item_name', 'is_transfer',
  'change_type', 'direction', 'qty', 'qty_before', 'qty_after', 'date_before', 'date_after',
  'mode_before', 'mode_after', 'item_before', 'item_after', 'candidate_group_id', 'account_no',
  'customer_name', 'category_model', 'group_name', 'product_class', 'is_excluded', 'group_type',
  'group_status', 'customer_unverified', 'stat_unit_key', 'is_class_overridden', 'change_rule',
  'change_type_code', 'change_type_label', 'manager_name', 'manager_email',
  'reason', 'reason_note', 'reason_origin_type', 'reason_origin_code', 'reason_origin_name',
  'reason_origin_category', 'reason_origin_function', 'reason_set_by_name', 'reason_set_at',
  'is_dismissed', 'dismiss_note', 'dismissed_by_name', 'dismissed_at',
].join(',');

/**
 * Supabase 오류를 사용자용 메시지로 변환
 */
export const formatPoTrackerError = (error: unknown): string => {
  const err = asApiError(error);
  if (err.code === '42P01' || err.code === '42703' || err.code === 'PGRST205' || err.code === 'PGRST202' || err.code === 'PGRST200') {
    return tn(
      'PO 변경 테이블이 없습니다. Supabase에서 migrations/update_po_tracker_rule_refinements_2.sql을 실행해주세요.',
      'PO change tables are missing. Run migrations/update_po_tracker_rule_refinements_2.sql in Supabase.'
    );
  }
  if (err.code === '42501') {
    return tn('권한이 없습니다. 관리자에게 문의해주세요.', 'You do not have permission. Please contact an administrator.');
  }
  if (err.code === '22023') {
    // DB 함수가 알려주는 입력 오류 (메모·사유·출처 누락 등)
    return err.message || tn('입력값을 확인해주세요.', 'Please check your input.');
  }
  return getReadableErrorMessage(error) || tn('데이터를 불러오지 못했습니다.', 'Could not load data.');
};

/**
 * 기간 내 변경 이벤트 조회 (기준일 최신순)
 */
export const fetchChangeEvents = async (from: string, to: string): Promise<PoChangeEvent[]> => {
  const supabase = createClient();
  const rows: PoChangeEvent[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('v_do_change_events')
      .select(EVENT_COLUMNS)
      .gte('detected_on', from)
      .lte('detected_on', to)
      .order('detected_on', { ascending: false })
      .order('order_no')
      .order('line_no')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(formatPoTrackerError(error));
    const batch = (data ?? []) as unknown as PoChangeEvent[];
    rows.push(...batch.map((e) => ({ ...e, line_no: Number(e.line_no) })));
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

/**
 * 이벤트에 연결된 후보 묶음 조회 후 이벤트를 묶음별로 붙임
 */
export const fetchChangeGroups = async (events: PoChangeEvent[]): Promise<PoChangeGroup[]> => {
  const ids = [...new Set(events.map((e) => e.candidate_group_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('do_change_groups')
    .select(
      'id, upload_id, group_type, status, customer_unverified, review_note, reviewed_by, reviewed_by_name, reviewed_at, created_at, ' +
        'reviews:do_change_group_reviews(id, status, note, reviewer_id, reviewer_name, reviewer_department, created_at)'
    )
    .in('id', ids);
  if (error) throw new Error(formatPoTrackerError(error));

  return ((data ?? []) as unknown as Omit<PoChangeGroup, 'events'>[])
    .map((g) => ({
      ...g,
      // 처리 이력은 최신순
      reviews: [...(g.reviews ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      events: events.filter((e) => e.candidate_group_id === g.id),
    }))
    .sort((a, b) => (b.events[0]?.detected_on ?? '').localeCompare(a.events[0]?.detected_on ?? ''));
};

/**
 * 변경 유형 설정 조회 (순서대로, 꺼진 유형 포함)
 */
export const fetchChangeTypes = async (): Promise<PoChangeTypeSetting[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_change_type_settings')
    .select('code, label, label_en, description, sort_order, is_active')
    .order('sort_order')
    .order('label');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as PoChangeTypeSetting[];
};

/**
 * 완료된 DO 업로드 날짜 목록 (최근 90건)
 */
export const fetchDoUploadDays = async (): Promise<DoUploadDay[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_source_uploads')
    .select('snapshot_date, is_baseline, summary')
    .eq('kind', 'do')
    .eq('status', 'completed')
    .order('snapshot_date', { ascending: false })
    .limit(90);
  if (error) throw new Error(formatPoTrackerError(error));

  return (data ?? []).map((row) => ({
    snapshot_date: row.snapshot_date as string,
    is_baseline: Boolean(row.is_baseline),
    new_orders: Number((row.summary as { new_orders?: number } | null)?.new_orders ?? 0),
  }));
};

/**
 * 재등록 대기 라인 조회 (고객처·대기 시작일 포함)
 */
export const fetchPendingLines = async (): Promise<PendingReRegistrationLine[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('do_order_lines')
    .select('order_no, line_no, item_no, item_name, confirmed_qty, pending_count, pending_since_upload_id, confirmed_date_dist')
    .eq('status', 'pending')
    .order('order_no');
  if (error) throw new Error(formatPoTrackerError(error));

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const orderNos = [...new Set(rows.map((r) => r.order_no as string))];
  const uploadIds = [...new Set(rows.map((r) => r.pending_since_upload_id as string | null).filter(Boolean))] as string[];

  const [customers, uploads] = await Promise.all([
    supabase.from('customer_so_map').select('order_no, customer_name').in('order_no', orderNos),
    uploadIds.length
      ? supabase.from('po_source_uploads').select('id, snapshot_date').in('id', uploadIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customers.error) throw new Error(formatPoTrackerError(customers.error));
  if (uploads.error) throw new Error(formatPoTrackerError(uploads.error));

  const customerMap = new Map((customers.data ?? []).map((c) => [c.order_no as string, c.customer_name as string]));
  const uploadMap = new Map((uploads.data ?? []).map((u) => [u.id as string, u.snapshot_date as string]));

  return rows.map((r) => ({
    order_no: r.order_no as string,
    line_no: Number(r.line_no),
    item_no: (r.item_no as string | null) ?? null,
    item_name: (r.item_name as string | null) ?? null,
    confirmed_qty: Number(r.confirmed_qty),
    pending_count: Number(r.pending_count),
    pending_since_date: uploadMap.get(r.pending_since_upload_id as string) ?? null,
    customer_name: customerMap.get(r.order_no as string) ?? null,
    requested_dates: Object.keys((r.confirmed_date_dist as Record<string, number> | null) ?? {}).sort(),
  }));
};

/**
 * 후보 묶음 승인·반려·되돌리기
 */
export const reviewChangeGroup = async (
  groupId: string,
  status: ChangeGroupStatus,
  note: string | null,
  reason?: ChangeReasonInput | null
): Promise<void> => {
  const supabase = createClient();
  if (status !== 'pending' && !note?.trim()) {
    throw new Error(tn('승인·반려 메모를 입력해주세요.', 'Enter a note to approve or reject.'));
  }
  const { error } = await supabase.rpc('review_change_group', {
    p_group_id: groupId,
    p_status: status,
    p_note: note && note.trim() ? note.trim() : null,
    p_reason: status !== 'pending' && reason ? reason.reason : null,
    p_origin_type: status !== 'pending' && reason ? reason.originType : null,
    p_origin_code: status !== 'pending' && reason?.originType === 'department' ? reason.originCode : null,
  });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 요청 부서 목록 조회 (순서대로, 꺼진 부서 포함)
 */
export const fetchRequestOrigins = async (): Promise<PoRequestOrigin[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_request_origins')
    .select('code, department, company, display_name, category, function_group, sort_order, is_active')
    .order('sort_order')
    .order('display_name');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as PoRequestOrigin[];
};

/**
 * 변경 사유 입력·수정 (여러 건 한 번에)
 * @param keys 변경 1건 키 목록 (stat_unit_key)
 * @returns 저장한 건수
 */
export const setChangeReasons = async (keys: string[], input: ChangeReasonInput): Promise<number> => {
  if (!input.reason) throw new Error(tn('변경 사유를 선택해주세요.', 'Select a change reason.'));
  if (!input.note.trim()) throw new Error(tn('상세 사유 메모를 입력해주세요.', 'Enter a detailed note.'));
  if (input.originType === 'department' && !input.originCode) {
    throw new Error(tn('요청 부서를 선택해주세요.', 'Select the requesting department.'));
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_change_reasons', {
    p_keys: keys,
    p_reason: input.reason,
    p_note: input.note.trim(),
    p_origin_type: input.originType,
    p_origin_code: input.originType === 'department' ? input.originCode : null,
  });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * 변경 사유 지우기 (여러 건 한 번에) — 미입력으로 되돌림
 * @returns 지운 건수
 */
export const clearChangeReasons = async (keys: string[]): Promise<number> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('clear_change_reasons', { p_keys: keys });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * "변경 아님(정정)" 처리 (여러 건 한 번에) — 오입력 정정 등 실제 변경이 아닌 건을 통계에서 뺌
 * @returns 처리한 건수
 */
export const dismissChanges = async (keys: string[], note: string): Promise<number> => {
  if (!note.trim()) throw new Error(tn('변경이 아닌 이유를 메모로 입력해주세요.', 'Enter why this is not a change.'));
  const supabase = createClient();
  const { data, error } = await supabase.rpc('dismiss_changes', { p_keys: keys, p_note: note.trim() });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};

/**
 * "변경 아님" 해제 — 다시 변경으로 셈
 * @returns 해제한 건수
 */
export const restoreChanges = async (keys: string[]): Promise<number> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('restore_changes', { p_keys: keys });
  if (error) throw new Error(formatPoTrackerError(error));
  return Number(data ?? 0);
};
