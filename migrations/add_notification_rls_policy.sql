-- ============================================
-- 알람 수신자 계산을 위한 RLS 정책 추가
-- ============================================
-- 문제: user_profiles의 RLS 정책이 자신의 프로필만 조회하도록 설정되어 있어
--       notification-utils.ts에서 전체 사용자 목록을 조회할 수 없음.
--       결과적으로 알람 수신자가 요청자 본인 1명만 계산되어 이메일이 발송되지 않음.
-- 해결: 인증된 사용자가 알람 수신자 계산을 위해 전체 프로필 목록을 조회할 수 있도록
--       RLS 정책 추가.

-- 기존 정책 삭제 후 재생성 (중복 방지)
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.user_profiles;

-- 인증된 사용자는 알람 수신자 계산을 위해 모든 프로필 조회 가능
CREATE POLICY "Authenticated users can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
