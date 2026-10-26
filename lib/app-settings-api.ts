/**
 * 앱 운영 설정 API — 요청접수·검토대기 메뉴 표시 여부 조회·저장
 */
import { createClient } from '@/lib/supabase/client';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { translateNow as tn } from '@/lib/i18n';

/**
 * 요청접수·검토대기 메뉴를 관리자 외 계정에도 보일지 — 설정을 못 읽으면(마이그레이션 전 등) 보이게 둠
 */
export const fetchRequestMenuEnabled = async (): Promise<boolean> => {
  const supabase = createClient();
  const { data, error } = await supabase.from('app_settings').select('request_menu_enabled').maybeSingle();
  if (error || !data) {
    if (error && process.env.NODE_ENV === 'development') {
      console.warn('앱 운영 설정 조회 실패, 요청 메뉴를 보이게 둠:', error);
    }
    return true;
  }
  return Boolean(data.request_menu_enabled);
};

/**
 * 요청접수·검토대기 메뉴 표시 저장 (관리자)
 */
export const saveRequestMenuEnabled = async (enabled: boolean, userId: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: true, request_menu_enabled: enabled, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) {
    throw new Error(getReadableErrorMessage(error) || tn('저장하지 못했습니다.', 'Could not save.'));
  }
};
