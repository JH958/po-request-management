-- ============================================
-- 단계별 해결 방법: role CHECK 제약 조건 수정
-- ============================================
-- 이 SQL을 단계별로 실행하세요
-- ============================================

-- ============================================
-- STEP 1: 현재 제약 조건 확인
-- ============================================
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND conname LIKE '%role%';

-- ============================================
-- STEP 2: 기존 제약 조건 삭제
-- ============================================
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- ============================================
-- STEP 3: 새로운 제약 조건 추가 (여러 역할 허용)
-- ============================================
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR
  role ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$'
);

-- ============================================
-- STEP 4: 제약 조건 확인
-- ============================================
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND conname = 'user_profiles_role_check';

-- ============================================
-- STEP 5: 홍길동 씨에게 역할 부여
-- ============================================
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE full_name = '홍길동' AND department = '미국법인';

-- ============================================
-- STEP 6: jhee105@inbody.com 계정에 역할 부여
-- ============================================
UPDATE public.user_profiles
SET role = 'reviewer,requester'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'jhee105@inbody.com'
);

-- ============================================
-- STEP 7: 결과 확인
-- ============================================
SELECT 
    full_name,
    department,
    role
FROM public.user_profiles
WHERE full_name = '홍길동' OR id IN (
  SELECT id FROM auth.users WHERE email = 'jhee105@inbody.com'
);
