-- =====================================================================
-- PO Tracker: 요청구분 리스트를 PO 변경 유형으로 통합
--
-- 변경 내용 (2026-10-14 결정)
--   - 요청접수 화면의 요청구분 카드·필터가 po_change_type_settings(PO 변경 유형)를 읽음
--   - 카드 툴팁용 설명(description) 열 추가, 기존 request_type_settings 설명을 이름이 같은 유형으로 복사
--   - request_type_settings 테이블은 지우지 않고 남겨 둠 (앱에서 더 이상 사용하지 않음)
--   - 요청 데이터(requests.category_of_request)는 유형 이름을 그대로 저장하므로 변환 없음
--
-- 선행: migrations/update_po_tracker_change_types_review.sql
-- 여러 번 실행해도 안전합니다 (설명이 비어 있을 때만 채움).
-- =====================================================================

ALTER TABLE public.po_change_type_settings ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN public.po_change_type_settings.description IS '요청접수 카드 툴팁에 보이는 설명';

-- 기존 요청구분 설명 복사 (이름이 같은 유형, 설명이 비어 있을 때만)
DO $$
BEGIN
  IF to_regclass('public.request_type_settings') IS NOT NULL THEN
    UPDATE public.po_change_type_settings s
    SET description = r.description
    FROM public.request_type_settings r
    WHERE r.label = s.label
      AND s.description IS NULL
      AND NULLIF(btrim(r.description), '') IS NOT NULL;
  END IF;
END $$;

-- 요청구분 설정이 없던 경우 앱 기본값의 설명으로 채움
UPDATE public.po_change_type_settings s
SET description = d.description
FROM (VALUES
  ('product_add', '긴급 발주 건 포함'),
  ('material_add', '긴급 발주 건 포함'),
  ('item_change', '설계변경 등으로 구>신코드 변경해야 하는 건 등'),
  ('split', '기 발주 건 중 일부 물량 앞당겨 배송 요청, 인바디 헬스케어와의 혼적 요청 등')
) AS d(code, description)
WHERE s.code = d.code AND s.description IS NULL;
