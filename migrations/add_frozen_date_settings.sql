-- 프로즌 데이트 설정 테이블 및 requests.frozen_status 컬럼 추가

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

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS frozen_status TEXT CHECK (frozen_status IN ('before', 'after', 'unset'));

COMMENT ON TABLE public.frozen_date_settings IS '고객처별 프로즌 데이트 산정 기준';
COMMENT ON COLUMN public.requests.frozen_status IS '접수 시점 프로즌 판정: before(이전), after(이후), unset(미설정)';

-- RLS
ALTER TABLE public.frozen_date_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can insert frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can update frozen date settings" ON public.frozen_date_settings;
DROP POLICY IF EXISTS "Admins can delete frozen date settings" ON public.frozen_date_settings;

-- 인증된 사용자: 프로즌 판정·목록 조회용 SELECT 허용
CREATE POLICY "Authenticated users can view frozen date settings"
  ON public.frozen_date_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 관리자·영업관리팀: 설정 CRUD 허용
CREATE POLICY "Admins can insert frozen date settings"
  ON public.frozen_date_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can update frozen date settings"
  ON public.frozen_date_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can delete frozen date settings"
  ON public.frozen_date_settings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );
