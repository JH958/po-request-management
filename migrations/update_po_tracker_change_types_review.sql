-- =====================================================================
-- PO Tracker: 변경 유형 관리 + 품목 구분 예외 + 후보 승인 메모 필수·처리자 이름
--
-- 변경 내용 (2026-10-14 결정)
--   1) 변경 유형을 관리자 설정에서 고칠 수 있게 함
--      - po_change_type_settings: 화면에 보이는 유형(이름·영문명·순서·사용 여부)
--      - po_change_type_rules: 시스템이 판정한 기준(제품/상품 추가, 출하일정 변경 등) → 유형 연결
--      - 연결이 없거나 유형이 꺼져 있으면 "기타"(code 'other')로 셈
--      - 반려되지 않은 품목코드 변경 후보도 분할/합배송처럼 묶음 1건으로 셈
--   2) item_class_overrides: 카테고리와 다른 구분이 필요한 품목을 품목번호로 지정
--      (예: X9W300001 IB Battery 320 — 카테고리 BWA_기성품 기타는 자재지만 상품)
--   3) 후보 승인/반려 시 메모 필수, 처리자 이름 저장(do_change_groups.reviewed_by_name),
--      처리 이력(do_change_group_reviews) 기록 — 되돌린 뒤에도 누가 무엇을 했는지 남음
--
-- 선행: migrations/add_po_tracker_do_tracking.sql, update_po_tracker_split_candidates.sql
-- 여러 번 실행해도 안전합니다 (객체는 교체, 초기값은 이미 있으면 건너뜀).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 품목 구분 예외 (품목번호 단위, 카테고리 매핑보다 우선)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_class_overrides (
  item_no TEXT PRIMARY KEY,
  product_class TEXT NOT NULL CHECK (product_class IN ('제품', '상품', '자재', '제외')),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_class_overrides IS '품목번호 → 구분 예외 지정 (카테고리 모델 구분보다 우선)';

INSERT INTO public.item_class_overrides (item_no, product_class, note)
VALUES ('X9W300001', '상품', 'IB Battery 320 — 카테고리(BWA_기성품 기타)는 자재지만 상품으로 구분')
ON CONFLICT (item_no) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. 변경 유형 설정 + 판정 기준 연결
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_change_type_settings (
  code TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  label TEXT NOT NULL UNIQUE,
  label_en TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_change_type_settings IS 'PO 변경 유형 (화면 필터·통계 표시명). code ''other''(기타)는 연결 없는 기준이 모이는 곳이라 지우지 않음';

CREATE TABLE IF NOT EXISTS public.po_change_type_rules (
  rule_key TEXT PRIMARY KEY CHECK (rule_key IN (
    'add_product', 'add_material', 'add_other',
    'delete_product', 'delete_material', 'delete_other',
    'item_change', 'date_change', 'mode_change', 'split'
  )),
  type_code TEXT REFERENCES public.po_change_type_settings(code) ON DELETE SET NULL ON UPDATE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_change_type_rules IS '시스템 판정 기준 → 변경 유형 연결 (없으면 기타)';
COMMENT ON COLUMN public.po_change_type_rules.rule_key IS
  'add_/delete_product(제품·상품) material(자재) other(미분류·제외), item_change(품목코드 변경 후보·품목 변경), date_change(요청 배송일), mode_change(납품 모드), split(분할/합배송 후보)';

INSERT INTO public.po_change_type_settings (code, label, label_en, sort_order) VALUES
  ('product_add', '제품/상품 추가', 'Product added', 1),
  ('material_add', '자재 추가', 'Material added', 2),
  ('product_delete', '제품/상품 삭제', 'Product removed', 3),
  ('material_delete', '자재 삭제', 'Material removed', 4),
  ('item_change', '품목코드 변경', 'Item code changed', 5),
  ('schedule_change', '출하일정 변경', 'Shipping schedule changed', 6),
  ('mode_change', '운송방법 변경', 'Delivery mode changed', 7),
  ('split', '분할/합배송', 'Split/combined shipment', 8),
  ('other', '기타', 'Other', 99)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.po_change_type_rules (rule_key, type_code) VALUES
  ('add_product', 'product_add'),
  ('add_material', 'material_add'),
  ('add_other', 'other'),
  ('delete_product', 'product_delete'),
  ('delete_material', 'material_delete'),
  ('delete_other', 'other'),
  ('item_change', 'item_change'),
  ('date_change', 'schedule_change'),
  ('mode_change', 'mode_change'),
  ('split', 'split')
ON CONFLICT (rule_key) DO NOTHING;


-- ---------------------------------------------------------------------
-- 3. 후보 처리자 이름 + 처리 이력
-- ---------------------------------------------------------------------
ALTER TABLE public.do_change_groups ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
COMMENT ON COLUMN public.do_change_groups.reviewed_by_name IS '처리자 이름 (처리 시점 user_profiles.full_name — 다른 사용자 프로필은 RLS로 못 읽으므로 저장)';

CREATE TABLE IF NOT EXISTS public.do_change_group_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.do_change_groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewer_department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS do_change_group_reviews_group_idx ON public.do_change_group_reviews (group_id, created_at);

COMMENT ON TABLE public.do_change_group_reviews IS '후보 묶음 처리 이력 (승인·반려·되돌리기) — review_change_group()으로만 기록';

-- 이미 처리된 묶음: 처리자 이름 채우고 이력 1건 남김
UPDATE public.do_change_groups g
SET reviewed_by_name = p.full_name
FROM public.user_profiles p
WHERE p.id = g.reviewed_by AND g.reviewed_by_name IS NULL;

INSERT INTO public.do_change_group_reviews (group_id, status, note, reviewer_id, reviewer_name, reviewer_department, created_at)
SELECT g.id, g.status, g.review_note, g.reviewed_by, p.full_name, p.department, g.reviewed_at
FROM public.do_change_groups g
LEFT JOIN public.user_profiles p ON p.id = g.reviewed_by
WHERE g.status <> 'pending'
  AND g.reviewed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.do_change_group_reviews r WHERE r.group_id = g.id);


-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.item_class_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_change_group_reviews ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['item_class_overrides', 'po_change_type_settings', 'po_change_type_rules', 'do_change_group_reviews'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated users can view %1$s" ON public.%1$I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t
    );
  END LOOP;

  -- 관리자 설정 화면에서 직접 수정 (처리 이력은 함수로만 기록)
  FOREACH t IN ARRAY ARRAY['item_class_overrides', 'po_change_type_settings', 'po_change_type_rules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can delete %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admins can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_po_tracker_admin())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Admins can update %1$s" ON public.%1$I FOR UPDATE USING (public.is_po_tracker_admin())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Admins can delete %1$s" ON public.%1$I FOR DELETE USING (public.is_po_tracker_admin())',
      t
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS update_item_class_overrides_updated_at ON public.item_class_overrides;
CREATE TRIGGER update_item_class_overrides_updated_at
  BEFORE UPDATE ON public.item_class_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_po_change_type_settings_updated_at ON public.po_change_type_settings;
CREATE TRIGGER update_po_change_type_settings_updated_at
  BEFORE UPDATE ON public.po_change_type_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_po_change_type_rules_updated_at ON public.po_change_type_rules;
CREATE TRIGGER update_po_change_type_rules_updated_at
  BEFORE UPDATE ON public.po_change_type_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------
-- 5. 조회용 뷰 교체 — 품목 구분 예외 반영, 변경 유형(관리자 설정) 연결
--    (기존 열 순서는 그대로 두고 새 열은 끝에 붙임)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_do_change_events
WITH (security_invoker = true)
AS
SELECT
  e.*,
  c.account_no,
  COALESCE(c.customer_name, CASE WHEN e.is_transfer THEN '이전(Transfer)' END) AS customer_name,
  i.category_model,
  COALESCE(cs.group_code, NULLIF(split_part(i.category_model, '_', 1), '')) AS group_code,
  pg.display_name AS group_name,
  cs.subcategory,
  COALESCE(cls.product_class, '미분류') AS product_class,
  CASE
    WHEN cls.product_class IN ('제품', '상품') THEN 'product'
    WHEN cls.product_class = '자재' THEN 'material'
  END AS class_group,
  CASE e.direction
    WHEN 'add' THEN CASE
      WHEN cls.product_class IN ('제품', '상품') THEN '제품/상품 추가'
      WHEN cls.product_class = '자재' THEN '자재 추가'
      ELSE '추가(미분류)'
    END
    WHEN 'delete' THEN CASE
      WHEN cls.product_class IN ('제품', '상품') THEN '제품/상품 삭제'
      WHEN cls.product_class = '자재' THEN '자재 삭제'
      ELSE '삭제(미분류)'
    END
    WHEN 'date' THEN '출하일정 변경'
    WHEN 'mode' THEN '운송방법 변경'
    WHEN 'item' THEN '품목코드 변경'
  END AS change_label,
  ex.is_excluded_customer,
  (cls.product_class = '제외') AS is_excluded_item,
  (ex.is_excluded_customer OR COALESCE(cls.product_class = '제외', FALSE)) AS is_excluded,
  g.group_type,
  g.status AS group_status,
  g.customer_unverified,
  -- 통계 표시명: 관리자 설정의 변경 유형 이름
  COALESCE(ts.label, oth.label, '기타') AS stat_label,
  -- 통계용: 반려되지 않은 후보 묶음(분할/합배송·품목코드 변경)은 묶음 단위 1건, 나머지는 이벤트 1건
  CASE
    WHEN g.id IS NOT NULL AND g.status <> 'rejected' THEN 'group:' || g.id::TEXT
    ELSE 'event:' || e.id::TEXT
  END AS stat_unit_key,
  (ov.item_no IS NOT NULL) AS is_class_overridden,
  rk.rule_key AS change_rule,
  COALESCE(ts.code, 'other') AS change_type_code,
  COALESCE(ts.label, oth.label, '기타') AS change_type_label
FROM public.do_change_events e
LEFT JOIN public.customer_so_map c ON c.order_no = e.order_no
LEFT JOIN public.item_category_map i ON i.item_no = COALESCE(e.item_after, e.item_no)
LEFT JOIN public.category_class_settings cs ON cs.category_model = i.category_model
LEFT JOIN public.item_class_overrides ov ON ov.item_no = COALESCE(e.item_after, e.item_no)
LEFT JOIN public.product_groups pg
  ON pg.code = COALESCE(cs.group_code, NULLIF(split_part(i.category_model, '_', 1), ''))
LEFT JOIN public.do_change_groups g ON g.id = e.candidate_group_id
CROSS JOIN LATERAL (SELECT COALESCE(ov.product_class, cs.product_class) AS product_class) cls
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.excluded_customers x
    WHERE x.is_active
      AND (x.customer_name = c.customer_name OR (x.account_no IS NOT NULL AND x.account_no = c.account_no))
  ) AS is_excluded_customer
) ex
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN g.group_type = 'split' AND g.status <> 'rejected' THEN 'split'
    WHEN (g.group_type = 'item_change' AND g.status <> 'rejected') OR e.direction = 'item' THEN 'item_change'
    WHEN e.direction = 'date' THEN 'date_change'
    WHEN e.direction = 'mode' THEN 'mode_change'
    WHEN e.direction = 'add' THEN CASE
      WHEN cls.product_class IN ('제품', '상품') THEN 'add_product'
      WHEN cls.product_class = '자재' THEN 'add_material'
      ELSE 'add_other'
    END
    ELSE CASE
      WHEN cls.product_class IN ('제품', '상품') THEN 'delete_product'
      WHEN cls.product_class = '자재' THEN 'delete_material'
      ELSE 'delete_other'
    END
  END AS rule_key
) rk
LEFT JOIN public.po_change_type_rules r ON r.rule_key = rk.rule_key
LEFT JOIN public.po_change_type_settings ts ON ts.code = r.type_code AND ts.is_active
LEFT JOIN public.po_change_type_settings oth ON oth.code = 'other';

COMMENT ON VIEW public.v_do_change_events IS '변경 이벤트 + 고객처·품목군·구분(품목 예외 우선)·변경 유형(관리자 설정)·제외 여부·후보 묶음 — 통계는 stat_unit_key 기준으로 셀 것';


-- ---------------------------------------------------------------------
-- 6. 후보 승인·반려 — 메모 필수, 처리자 이름·이력 기록
-- ---------------------------------------------------------------------
/**
 * 후보 묶음 승인·반려·되돌리기 (담당자 확인) — 반려하면 통계에서 각 이벤트를 개별 삭제·추가로 센다
 * 승인·반려는 메모 필수. 처리자 이름은 묶음에 저장하고 모든 처리를 이력에 남긴다
 */
CREATE OR REPLACE FUNCTION public.review_change_group(p_group_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(p_note), '');
  v_name TEXT;
  v_department TEXT;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '검토 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION '알 수 없는 상태입니다: %', p_status;
  END IF;

  IF p_status <> 'pending' AND v_note IS NULL THEN
    RAISE EXCEPTION '승인·반려 메모를 입력해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name, department INTO v_name, v_department
  FROM public.user_profiles WHERE id = auth.uid();

  UPDATE public.do_change_groups
  SET
    status = p_status,
    review_note = CASE WHEN p_status = 'pending' THEN NULL ELSE v_note END,
    reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
    reviewed_by_name = CASE WHEN p_status = 'pending' THEN NULL ELSE v_name END,
    reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE NOW() END
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '후보 묶음을 찾을 수 없습니다.';
  END IF;

  INSERT INTO public.do_change_group_reviews (group_id, status, note, reviewer_id, reviewer_name, reviewer_department)
  VALUES (p_group_id, p_status, v_note, auth.uid(), v_name, v_department);
END;
$$;
