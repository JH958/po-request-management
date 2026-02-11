-- ============================================
-- 데이터베이스 마이그레이션: role CHECK 제약 조건 수정 (간단한 버전)
-- ============================================
-- 생성일: 2026-01-15
-- 설명: role 필드의 CHECK 제약 조건을 수정하여 콤마로 구분된 여러 역할 허용
--       정규식을 사용하여 더 간단하게 구현
-- ============================================

-- 1. 기존 CHECK 제약 조건 삭제
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- 2. 새로운 CHECK 제약 조건 추가
-- 허용 형식:
--   - 단일 역할: "requester", "reviewer", "admin"
--   - 여러 역할: "reviewer,requester", "reviewer,admin" 등
--   - 콤마 앞뒤 공백 허용: "reviewer, requester" (trim 처리됨)
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR
  -- 정규식: requester, reviewer, admin 중 하나 이상을 콤마로 구분
  role ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$'
);

-- 3. 홍길동 씨에게 reviewer,requester 역할 부여
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE full_name = '홍길동' AND department = '미국법인';

-- 4. jhee105@inbody.com 계정에도 reviewer,requester 역할 부여
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'jhee105@inbody.com'
);

-- 5. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '마이그레이션이 성공적으로 완료되었습니다!';
  RAISE NOTICE 'role CHECK 제약 조건이 수정되어 여러 역할을 허용합니다.';
END $$;
