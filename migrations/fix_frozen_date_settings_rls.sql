-- frozen_date_settings 테이블/RLS 수정 (기존 마이그레이션 실패 시 복구용)
-- Supabase SQL Editor에서 실행

-- 1) 잘못된 FK로 생성이 실패한 경우: 테이블이 없으면 올바른 스키마로 생성
CREATE TABLE IF NOT EXISTS public.frozen_date_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  grade TEXT,
  country TEXT,
  customer_name TEXT NOT NULL UNIQUE,
  customer_product_weeks INT,
  customer_product_weekday TEXT CHECK (customer_product_weekday IN ('MON', 'FRI')),
  customer_material_weeks INT,
  customer_material_weekday TEXT CHECK (customer_material_weekday IN ('MON', 'FRI')),
  hq_product_weeks INT,
  hq_product_weekday TEXT CHECK (hq_product_weekday IN ('MON', 'FRI')),
  hq_material_weeks INT,
  hq_material_weekday TEXT CHECK (hq_material_weekday IN ('MON', 'FRI')),
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

-- 2) requests.frozen_status 컬럼
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS frozen_status TEXT CHECK (frozen_status IN ('before', 'after', 'unset'));

-- 3) RLS 정책 (add_frozen_date_settings.sql과 동일)
ALTER TABLE public.frozen_date_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can insert frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can update frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can delete frozen date settings" ON public.frozen_date_settings;

CREATE POLICY "Authenticated users can view frozen date settings"
  ON public.frozen_date_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert frozen date settings"
  ON public.frozen_date_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can update frozen date settings"
  ON public.frozen_date_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can delete frozen date settings"
  ON public.frozen_date_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );
