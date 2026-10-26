/**
 * 영업관리팀 계정 승인 API (관리자) — 목록 조회, 승인·해제
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError, getReadableErrorMessage } from '@/lib/request-helpers';
import { translateNow as tn } from '@/lib/i18n';

/** 영업관리팀 계정 한 줄 (po_sales_access_list) */
export interface SalesAccessRow {
  user_id: string;
  full_name: string;
  email: string | null;
  department: string;
  created_at: string;
  /** 로그인 메일이 고객처 담당자 표에 있음 (승인 없이 사용 가능) */
  in_manager_list: boolean;
  approved: boolean;
  approved_by_name: string | null;
  approved_at: string | null;
  /** 지금 영업관리팀 권한이 있음 */
  has_access: boolean;
}

/**
 * Supabase 오류를 안내 문구로
 */
const toMessage = (error: unknown): string => {
  const err = asApiError(error);
  if (err.code === 'PGRST202' || err.code === '42883') {
    return tn('승인 기능이 없습니다. migrations/update_po_tracker_sales_access.sql을 실행해주세요.', 'Run migrations/update_po_tracker_sales_access.sql first.');
  }
  return getReadableErrorMessage(error);
};

/**
 * 영업관리팀으로 가입한 계정 목록
 */
export const fetchSalesAccessList = async (): Promise<SalesAccessRow[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('po_sales_access_list');
  if (error) throw new Error(toMessage(error));
  return (data ?? []) as SalesAccessRow[];
};

/**
 * 영업관리팀 권한 승인·해제
 */
export const setSalesAccess = async (userId: string, approved: boolean): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_sales_access', { p_user_id: userId, p_approved: approved });
  if (error) throw new Error(toMessage(error));
};
