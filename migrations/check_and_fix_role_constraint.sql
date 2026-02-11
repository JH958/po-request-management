-- ============================================
-- 데이터베이스 마이그레이션: role CHECK 제약 조건 확인 및 수정
-- ============================================
-- 생성일: 2026-01-15
-- 설명: 현재 제약 조건을 확인하고, 여러 역할을 허용하도록 수정
-- ============================================

-- 1. 현재 제약 조건 확인
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND conname = 'user_profiles_role_check';

-- 2. 기존 CHECK 제약 조건 완전히 삭제
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- 3. 새로운 CHECK 제약 조건 추가 (여러 역할 허용)
-- 허용 형식:
--   - 단일: "requester", "reviewer", "admin"
--   - 복수: "reviewer,requester", "reviewer,admin" 등
--   - 공백 포함: "reviewer, requester" (trim 처리됨)
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR
  -- 정규식: requester, reviewer, admin 중 하나 이상을 콤마(공백 포함)로 구분
  role ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$'
);

-- 4. 제약 조건이 제대로 추가되었는지 확인
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND conname = 'user_profiles_role_check';

-- 5. 테스트: 여러 역할 값이 허용되는지 확인
-- (실제로 INSERT하지 않고 CHECK만 테스트)
DO $$
BEGIN
  -- 테스트 케이스들
  RAISE NOTICE '제약 조건 테스트 시작...';
  
  -- 단일 역할 테스트
  IF 'requester' ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$' THEN
    RAISE NOTICE '✓ 단일 역할 (requester) 통과';
  END IF;
  
  IF 'reviewer' ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$' THEN
    RAISE NOTICE '✓ 단일 역할 (reviewer) 통과';
  END IF;
  
  -- 여러 역할 테스트 (공백 없음)
  IF 'reviewer,requester' ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$' THEN
    RAISE NOTICE '✓ 여러 역할 (reviewer,requester) 통과';
  END IF;
  
  -- 여러 역할 테스트 (공백 포함)
  IF 'reviewer, requester' ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$' THEN
    RAISE NOTICE '✓ 여러 역할 (reviewer, requester) 통과';
  END IF;
  
  RAISE NOTICE '제약 조건 테스트 완료!';
END $$;

-- 6. 홍길동 씨에게 reviewer,requester 역할 부여 (공백 없이)
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE full_name = '홍길동' AND department = '미국법인';

-- 7. jhee105@inbody.com 계정에도 reviewer,requester 역할 부여
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'jhee105@inbody.com'
);

-- 8. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '마이그레이션 완료!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'role CHECK 제약 조건이 수정되어 여러 역할을 허용합니다.';
  RAISE NOTICE '홍길동 씨와 jhee105@inbody.com 계정에 reviewer,requester 역할이 부여되었습니다.';
  RAISE NOTICE '========================================';
END $$;
