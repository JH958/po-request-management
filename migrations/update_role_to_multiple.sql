-- ============================================
-- 데이터베이스 마이그레이션: role 필드를 여러 역할 지원하도록 변경
-- ============================================
-- 생성일: 2026-01-15
-- 설명: role 필드를 콤마로 구분된 여러 역할을 저장할 수 있도록 변경
--       예: "reviewer,requester" 또는 "admin"
-- ============================================

-- 1. jhee105@inbody.com 계정에 reviewer,requester 역할 부여
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'jhee105@inbody.com'
);

-- 2. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '마이그레이션이 성공적으로 완료되었습니다!';
  RAISE NOTICE 'jhee105@inbody.com 계정에 reviewer,requester 역할이 부여되었습니다.';
END $$;
