-- ============================================
-- PO 변경 요청 관리 시스템 데이터베이스 스키마
-- ============================================
-- 생성일: 2026-01-14
-- Supabase PostgreSQL용 스키마
-- ============================================

-- ============================================
-- 1. 사용자 프로필 테이블 (user_profiles)
-- ============================================
-- Supabase Auth의 auth.users 테이블과 1:1 관계
-- 참고: PRD 문서에서는 user_profiles로 명명하지만,
--      사용자 요청에 따라 public 스키마에 생성합니다.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'requester' CHECK (
    role IS NULL OR
    role ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$'
  ),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- RLS 활성화
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 기존 RLS 정책 삭제 (이미 존재하는 경우)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;

-- RLS 정책: 사용자는 자신의 프로필만 조회 가능
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- RLS 정책: 사용자는 자신의 프로필만 수정 가능
CREATE POLICY "Users can update their own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS 정책: 인증된 사용자는 자신의 프로필을 생성할 수 있음
CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. 요청 관리 테이블 (requests)
-- ============================================

CREATE TABLE IF NOT EXISTS public.requests (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 기본 정보
  customer TEXT NOT NULL,
  requesting_dept TEXT NOT NULL,
  requester_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL, -- 비정규화 (성능 및 이력 유지)
  
  -- SO 정보
  so_number TEXT, -- 기존 PO 수정 시 필수, 신규 PO 추가 시 선택
  factory_shipment_date DATE NOT NULL, -- 현재 출하일
  desired_shipment_date DATE, -- 희망 출하일 (요청자 입력)
  confirmed_shipment_date DATE, -- 확정 출하일 (검토자/관리자만 수정 가능)
  request_type TEXT CHECK (request_type IN ('existing', 'new')), -- 구분: 기존/신규
  shipping_method TEXT, -- 운송방법 (Ocean, Air, UPS, DHL)
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  leadtime INTEGER GENERATED ALWAYS AS (
    (factory_shipment_date - request_date)::INTEGER
  ) STORED,
  
  -- 요청 내용
  category_of_request TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT '보통' CHECK (priority IN ('긴급', '보통')),
  erp_code TEXT,
  item_name TEXT,
  quantity INTEGER CHECK (quantity IS NULL OR quantity >= -999999), -- 음수, 0, 양수 모두 허용
  items JSONB, -- 품목 목록 (JSONB 배열 형식: [{"erp_code": "...", "item_name": "...", "quantity": ...}])
  reason_for_request TEXT NOT NULL,
  request_details TEXT NOT NULL,
  
  -- 검토 정보
  feasibility TEXT CHECK (feasibility IN ('approved', 'rejected', 'pending')),
  review_details TEXT,
  reviewing_dept TEXT,
  reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'approved', 'rejected', 'completed')
  ),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- 메타데이터
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_requests_so_number ON public.requests(so_number);
CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON public.requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_reviewer_id ON public.requests(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON public.requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_deleted_at ON public.requests(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- 2-1. 기존 테이블 마이그레이션 (이미 테이블이 존재하는 경우)
-- ============================================
-- 기존 테이블이 이미 존재하는 경우, 새 필드와 제약 조건을 추가/수정합니다.
-- 이 섹션은 테이블 생성 직후에 실행되어야 합니다.

-- 2-1-1. user_profiles 테이블: role CHECK 제약 조건 수정
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR
  role ~ '^(requester|reviewer|admin)(\s*,\s*(requester|reviewer|admin))*$'
);

-- 2-1-2. requests 테이블: so_number를 nullable로 변경
DO $$ 
BEGIN
  -- so_number가 NOT NULL 제약이 있는 경우에만 제거
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'requests' 
    AND column_name = 'so_number' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.requests ALTER COLUMN so_number DROP NOT NULL;
  END IF;
END $$;

-- 2-1-3. requests 테이블: 새 필드 추가
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS desired_shipment_date DATE;

ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS confirmed_shipment_date DATE;

ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS request_type TEXT;

-- request_type에 CHECK 제약 조건 추가 (이미 존재하지 않는 경우)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'requests_request_type_check'
  ) THEN
    ALTER TABLE public.requests 
    ADD CONSTRAINT requests_request_type_check 
    CHECK (request_type IN ('existing', 'new'));
  END IF;
END $$;

ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS shipping_method TEXT;

ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS items JSONB;

-- 2-1-4. requests 테이블: quantity 제약 조건 수정 (음수, 0 허용)
ALTER TABLE public.requests 
DROP CONSTRAINT IF EXISTS requests_quantity_check;

ALTER TABLE public.requests 
ADD CONSTRAINT requests_quantity_check CHECK (quantity IS NULL OR quantity >= -999999);

-- 2-1-5. requests 테이블: priority 제약 조건 수정 ('일반' 제거)
-- 먼저 기존 데이터의 '일반' 값을 '보통'으로 업데이트
UPDATE public.requests 
SET priority = '보통' 
WHERE priority = '일반' OR priority NOT IN ('긴급', '보통');

-- 기존 제약 조건 삭제
ALTER TABLE public.requests 
DROP CONSTRAINT IF EXISTS requests_priority_check;

-- 새로운 제약 조건 추가
ALTER TABLE public.requests 
ADD CONSTRAINT requests_priority_check CHECK (priority IN ('긴급', '보통'));

-- 2-1-6. priority 기본값 변경 (기존 '일반' → '보통')
ALTER TABLE public.requests 
ALTER COLUMN priority SET DEFAULT '보통';

-- 2-1-7. erp_code, item_name, quantity를 nullable로 변경 (출하일정 변경, 운송방법 변경 시 품목 정보 불필요)
ALTER TABLE public.requests 
ALTER COLUMN erp_code DROP NOT NULL;

ALTER TABLE public.requests 
ALTER COLUMN item_name DROP NOT NULL;

ALTER TABLE public.requests 
ALTER COLUMN quantity DROP NOT NULL;

-- 2-1-7. 코멘트 업데이트
COMMENT ON COLUMN public.user_profiles.role IS '사용자 역할: requester(요청자), reviewer(검토자), admin(관리자). 여러 역할은 콤마로 구분 (예: "reviewer,requester")';

COMMENT ON COLUMN public.requests.so_number IS 'SO 번호 (기존 PO 수정 시 필수, 신규 PO 추가 시 선택)';
COMMENT ON COLUMN public.requests.factory_shipment_date IS '현재 출하일';
COMMENT ON COLUMN public.requests.desired_shipment_date IS '희망 출하일 (요청자 입력)';
COMMENT ON COLUMN public.requests.confirmed_shipment_date IS '확정 출하일 (검토자/관리자만 수정 가능)';
COMMENT ON COLUMN public.requests.request_type IS '구분: existing(기존), new(신규)';
COMMENT ON COLUMN public.requests.shipping_method IS '운송방법 (Ocean, Air, UPS, DHL)';
COMMENT ON COLUMN public.requests.items IS '품목 목록 (JSONB 배열 형식: [{"erp_code": "...", "item_name": "...", "quantity": ...}])';
COMMENT ON COLUMN public.requests.quantity IS '수량 (음수, 0, 양수 모두 허용)';
COMMENT ON COLUMN public.requests.priority IS '우선순위: 긴급, 보통';

-- RLS 활성화
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- 기존 RLS 정책 삭제 (이미 존재하는 경우)
DROP POLICY IF EXISTS "Requesters can view their own requests" ON public.requests;
DROP POLICY IF EXISTS "Reviewers can view all requests" ON public.requests;
DROP POLICY IF EXISTS "Requesters can create requests" ON public.requests;
DROP POLICY IF EXISTS "Requesters can update their own pending requests" ON public.requests;
DROP POLICY IF EXISTS "Reviewers can update review fields" ON public.requests;
DROP POLICY IF EXISTS "Requesters can delete their own pending requests" ON public.requests;

-- RLS 정책: 요청자는 자신이 작성한 요청만 조회 가능
CREATE POLICY "Requesters can view their own requests"
  ON public.requests
  FOR SELECT
  USING (
    requester_id = auth.uid() 
    AND deleted_at IS NULL
  );

-- RLS 정책: 검토자 및 관리자는 모든 요청 조회 가능
CREATE POLICY "Reviewers can view all requests"
  ON public.requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() 
      AND (role LIKE '%reviewer%' OR role LIKE '%admin%')
    )
    AND deleted_at IS NULL
  );

-- RLS 정책: 요청자는 자신의 요청을 생성할 수 있음
CREATE POLICY "Requesters can create requests"
  ON public.requests
  FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- RLS 정책: 요청자는 검토 전 자신의 요청만 수정 가능
CREATE POLICY "Requesters can update their own pending requests"
  ON public.requests
  FOR UPDATE
  USING (
    requester_id = auth.uid() 
    AND status = 'pending'
    AND deleted_at IS NULL
  );

-- RLS 정책: 검토자 및 관리자는 검토 정보를 업데이트할 수 있음
CREATE POLICY "Reviewers can update review fields"
  ON public.requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() 
      AND (role LIKE '%reviewer%' OR role LIKE '%admin%')
    )
    AND deleted_at IS NULL
  );

-- RLS 정책: 요청자는 검토 전 자신의 요청만 삭제 가능
CREATE POLICY "Requesters can delete their own pending requests"
  ON public.requests
  FOR DELETE
  USING (
    requester_id = auth.uid() 
    AND status = 'pending'
  );

-- ============================================
-- 3. 트리거 함수: updated_at 자동 업데이트
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- user_profiles 테이블 트리거
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- requests 테이블 트리거
DROP TRIGGER IF EXISTS update_requests_updated_at ON public.requests;
CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. 트리거 함수: user_profiles 자동 생성
-- ============================================
-- auth.users에 사용자가 생성될 때 user_profiles 테이블에 자동으로 프로필을 생성합니다.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- user_profiles 테이블에 프로필 자동 생성
  -- ON CONFLICT로 중복 생성 방지 (이미 존재하는 경우 무시)
  INSERT INTO public.user_profiles (id, full_name, department, role)
  VALUES (
    NEW.id, -- auth.users의 id를 직접 사용
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '사용자'), -- 빈 문자열이면 기본값 사용
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'department', ''), '미지정'), -- 빈 문자열이면 기본값 사용
    COALESCE(NEW.raw_user_meta_data->>'role', 'requester')
  )
  ON CONFLICT (id) DO NOTHING; -- 이미 존재하는 경우 업데이트하지 않고 무시
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 에러 발생 시에도 트리거가 계속 실행되도록 처리
    -- 로그는 서버 로그에 기록됨
    RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.users 테이블에 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 5. 코멘트 추가 (테이블 및 컬럼 설명)
-- ============================================

COMMENT ON TABLE public.user_profiles IS '사용자 프로필 테이블 (auth.users와 1:1 관계)';
COMMENT ON COLUMN public.user_profiles.id IS '사용자 ID (auth.users.id와 동일)';
COMMENT ON COLUMN public.user_profiles.role IS '사용자 역할: requester(요청자), reviewer(검토자), admin(관리자). 여러 역할은 콤마로 구분 (예: "reviewer,requester")';

COMMENT ON TABLE public.requests IS 'PO 변경 요청 관리 테이블';
COMMENT ON COLUMN public.requests.requester_id IS '요청자 ID (user_profiles.id 참조)';
COMMENT ON COLUMN public.requests.reviewer_id IS '검토자 ID (user_profiles.id 참조)';
COMMENT ON COLUMN public.requests.so_number IS 'SO 번호 (기존 PO 수정 시 필수, 신규 PO 추가 시 선택)';
COMMENT ON COLUMN public.requests.factory_shipment_date IS '현재 출하일';
COMMENT ON COLUMN public.requests.desired_shipment_date IS '희망 출하일 (요청자 입력)';
COMMENT ON COLUMN public.requests.confirmed_shipment_date IS '확정 출하일 (검토자/관리자만 수정 가능)';
COMMENT ON COLUMN public.requests.request_type IS '구분: existing(기존), new(신규)';
COMMENT ON COLUMN public.requests.shipping_method IS '운송방법 (Ocean, Air, UPS, DHL)';
COMMENT ON COLUMN public.requests.items IS '품목 목록 (JSONB 배열 형식: [{"erp_code": "...", "item_name": "...", "quantity": ...}])';
COMMENT ON COLUMN public.requests.quantity IS '수량 (음수, 0, 양수 모두 허용)';
COMMENT ON COLUMN public.requests.priority IS '우선순위: 긴급, 보통';
COMMENT ON COLUMN public.requests.leadtime IS '리드타임 (출하일 - 요청일, 자동 계산)';
COMMENT ON COLUMN public.requests.status IS '요청 상태: pending(검토대기), in_review(검토중), approved(승인), rejected(거절), completed(완료)';
COMMENT ON COLUMN public.requests.deleted_at IS 'Soft delete를 위한 삭제 시각 (NULL이면 삭제되지 않음)';

-- ============================================
-- 6. 기존 사용자 프로필 수동 생성 (선택사항)
-- ============================================
-- 이미 생성된 auth.users에 대해 user_profiles를 수동으로 생성하는 스크립트
-- 트리거가 실행되지 않았거나, 트리거 생성 전에 가입한 사용자를 위해 사용
-- 
-- 사용법: 이 쿼리를 Supabase SQL Editor에서 실행하여
--         프로필이 없는 모든 사용자의 프로필을 생성합니다.

-- 기존 사용자 프로필 생성 (프로필이 없는 사용자만)
INSERT INTO public.user_profiles (id, full_name, department, role)
SELECT 
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), '사용자') AS full_name,
  COALESCE(NULLIF(u.raw_user_meta_data->>'department', ''), '미지정') AS department,
  COALESCE(u.raw_user_meta_data->>'role', 'requester') AS role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles up WHERE up.id = u.id
)
ON CONFLICT (id) DO NOTHING;