-- 요청구분·요청사유 관리 테이블

CREATE TABLE IF NOT EXISTS public.request_type_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.request_reason_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.request_type_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_reason_settings ENABLE ROW LEVEL SECURITY;

-- 조회: 인증된 사용자
DROP POLICY IF EXISTS "Authenticated users can view request types" ON public.request_type_settings;
CREATE POLICY "Authenticated users can view request types"
  ON public.request_type_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view request reasons" ON public.request_reason_settings;
CREATE POLICY "Authenticated users can view request reasons"
  ON public.request_reason_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 관리: admin / 영업관리
DROP POLICY IF EXISTS "Admins can insert request types" ON public.request_type_settings;
DROP POLICY IF EXISTS "Admins can update request types" ON public.request_type_settings;
DROP POLICY IF EXISTS "Admins can delete request types" ON public.request_type_settings;

CREATE POLICY "Admins can insert request types"
  ON public.request_type_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can update request types"
  ON public.request_type_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can delete request types"
  ON public.request_type_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

DROP POLICY IF EXISTS "Admins can insert request reasons" ON public.request_reason_settings;
DROP POLICY IF EXISTS "Admins can update request reasons" ON public.request_reason_settings;
DROP POLICY IF EXISTS "Admins can delete request reasons" ON public.request_reason_settings;

CREATE POLICY "Admins can insert request reasons"
  ON public.request_reason_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can update request reasons"
  ON public.request_reason_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

CREATE POLICY "Admins can delete request reasons"
  ON public.request_reason_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND (role LIKE '%admin%' OR department LIKE '%영업관리%')
    )
  );

-- 초기 시딩 (요청구분 9개)
INSERT INTO public.request_type_settings (value, label, description, sort_order) VALUES
('product_add', '제품/상품 추가', '긴급 발주 건 포함', 1),
('material_add', '자재 추가', '긴급 발주 건 포함', 2),
('product_delete', '제품/상품 삭제', NULL, 3),
('material_delete', '자재 삭제', NULL, 4),
('code_change', '품목코드 변경', '설계변경 등으로 구>신코드 변경해야 하는 건 등', 5),
('schedule_change', '출하일정 변경', NULL, 6),
('shipping_change', '운송방법 변경', NULL, 7),
('split_merge', '분할/합배송', '기 발주 건 중 일부 물량 앞당겨 배송 요청, 인바디 헬스케어와의 혼적 요청 등', 8),
('etc', '기타', NULL, 9)
ON CONFLICT (value) DO NOTHING;

-- 초기 시딩 (요청사유 10개)
INSERT INTO public.request_reason_settings (value, label, description, sort_order) VALUES
('수요 예측 오류', '수요 예측 오류', NULL, 1),
('영업 이벤트', '영업 이벤트', '대량 납품, 이벤트성 판매 등', 2),
('재고 부족', '재고 부족', '상품, 자재 입고 지연, 제품 자체의 재고 부족 등', 3),
('적재공간 과부족', '적재공간 과부족', NULL, 4),
('품질 이슈', '품질 이슈', '초기불량으로 인한 제품 무상 대응 등', 5),
('선적스케줄 변경', '선적스케줄 변경', NULL, 6),
('선수금 미입금', '선수금 미입금', NULL, 7),
('포워더 미지정', '포워더 미지정', NULL, 8),
('발주 지연', '발주 지연', NULL, 9),
('기타', '기타', '전쟁, 창고코드 미지정, 인증 이슈 등', 10)
ON CONFLICT (value) DO NOTHING;
