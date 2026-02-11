-- ============================================
-- 데이터베이스 마이그레이션: role CHECK 제약 조건 수정
-- ============================================
-- 생성일: 2026-01-15
-- 설명: role 필드의 CHECK 제약 조건을 수정하여 콤마로 구분된 여러 역할 허용
--       예: "reviewer,requester" 또는 "admin"
-- ============================================

-- 1. 기존 CHECK 제약 조건 확인 및 삭제
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- 2. 새로운 CHECK 제약 조건 추가 (콤마로 구분된 여러 역할 허용)
-- 허용되는 역할: requester, reviewer, admin
-- 여러 역할은 콤마로 구분 (예: "reviewer,requester")
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR
  role ~ '^[a-z]+(,[a-z]+)*$' AND  -- 콤마로 구분된 소문자 문자열만 허용
  (
    -- 각 역할이 유효한지 확인 (requester, reviewer, admin만 허용)
    (SELECT bool_and(
      CASE 
        WHEN unnest(string_to_array(role, ',')) IN ('requester', 'reviewer', 'admin') THEN true
        ELSE false
      END
    ) FROM unnest(string_to_array(role, ',')))
  )
);

-- 또는 더 간단한 방법: 정규식으로 체크
-- ALTER TABLE public.user_profiles
-- ADD CONSTRAINT user_profiles_role_check 
-- CHECK (
--   role IS NULL OR
--   role ~ '^(requester|reviewer|admin)(,(requester|reviewer|admin))*$'
-- );

-- 3. 홍길동 씨에게 reviewer,requester 역할 부여
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE full_name = '홍길동' AND department = '미국법인';

-- 4. jhee105@inbody.com 계정에도 reviewer,requester 역할 부여 (이미 되어있을 수 있음)
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
  RAISE NOTICE '홍길동 씨와 jhee105@inbody.com 계정에 reviewer,requester 역할이 부여되었습니다.';
END $$;
