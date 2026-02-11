-- ============================================
-- 데이터베이스 마이그레이션: 새 필드 추가
-- ============================================
-- 생성일: 2026-01-15
-- 설명: desired_shipment_date, confirmed_shipment_date, items 필드 추가
-- ============================================

-- 1. 희망 출하일 필드 추가
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS desired_shipment_date DATE;

-- 2. 확정 출하일 필드 추가 (검토자/관리자만 수정 가능)
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS confirmed_shipment_date DATE;

-- 3. 품목 목록 필드 추가 (JSONB 형식)
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS items JSONB;

-- 4. 운송방법 필드 추가
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS shipping_method TEXT;

-- 5. 구분 필드 추가 (기존/신규)
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS request_type TEXT CHECK (request_type IN ('existing', 'new'));

-- 6. 수량 체크 제약 조건 수정 (음수, 0 허용)
ALTER TABLE public.requests 
DROP CONSTRAINT IF EXISTS requests_quantity_check;

ALTER TABLE public.requests 
ADD CONSTRAINT requests_quantity_check CHECK (quantity IS NULL OR quantity >= -999999);

-- 7. 코멘트 추가
COMMENT ON COLUMN public.requests.desired_shipment_date IS '희망 출하일 (요청자 입력)';
COMMENT ON COLUMN public.requests.confirmed_shipment_date IS '확정 출하일 (검토자/관리자만 수정 가능)';
COMMENT ON COLUMN public.requests.items IS '품목 목록 (JSONB 배열 형식: [{"erp_code": "...", "item_name": "...", "quantity": ...}])';
COMMENT ON COLUMN public.requests.shipping_method IS '운송방법 (Ocean, Air, UPS, DHL)';
COMMENT ON COLUMN public.requests.request_type IS '구분: existing(기존), new(신규)';

-- 8. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '마이그레이션이 성공적으로 완료되었습니다!';
END $$;
