/**
 * PO 현황 대시보드 Supabase API — 조회 범위는 DB 함수(po_my_view_scope)가 적용
 */
import { createClient } from '@/lib/supabase/client';
import { formatPoTrackerError } from '@/lib/po-changes-api';
import type { DashboardChangeRow, DashboardRequestRow } from '@/types/po-dashboard';

/** PostgREST 한 번에 받는 최대 행 수 */
const PAGE_SIZE = 1000;

/**
 * 집계 함수 결과를 페이지로 나눠 모두 받음
 */
const fetchAll = async <T,>(fn: 'po_dashboard_changes' | 'po_dashboard_requests', from: string, to: string): Promise<T[]> => {
  const supabase = createClient();
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .rpc(fn, { p_from: from, p_to: to })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(formatPoTrackerError(error));
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

/**
 * 기간 내 변경(통계 단위 1건 = 1행) — 추적 제외·"변경 아님"은 빠짐, 변경 유형은 고친 유형 반영
 */
export const fetchDashboardChanges = async (from: string, to: string): Promise<DashboardChangeRow[]> =>
  (await fetchAll<DashboardChangeRow>('po_dashboard_changes', from, to)).map((r) => ({ ...r, line_count: Number(r.line_count) }));

/**
 * 기간 내 요청 (삭제된 요청 제외)
 */
export const fetchDashboardRequests = async (from: string, to: string): Promise<DashboardRequestRow[]> =>
  fetchAll<DashboardRequestRow>('po_dashboard_requests', from, to);
