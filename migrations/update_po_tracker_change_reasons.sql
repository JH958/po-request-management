-- =====================================================================
-- PO Tracker: 변경 사유 입력 + 요청 부서 목록
--
-- 변경 내용 (2026-10-19 결정)
--   1) po_request_origins: 요청 출처 부서 (회사·부서·표시명·분류) — 관리자 설정 '요청 부서'
--      분류 '회사구분_기능'에서 기능 부분(function_group)으로 생산부 필터 (본사_생산·국내법인_생산 등)
--   2) po_change_reasons: 변경 1건마다 사유(PO 변경 사유 목록)·상세 메모(필수)·요청 출처(고객처/부서)
--      영업관리팀이 set_change_reasons()로 입력 (여러 건 한 번에 가능), 수정 이력 po_change_reason_history
--   3) review_change_group: 분할/합배송·품목코드 변경 후보를 승인·반려할 때 사유·출처를 함께 저장
--      (메모 = 상세 사유). 묶음이 반려되면 각 라인이 묶음 사유를 물려받음
--   4) v_do_change_events: 사유·메모·출처·분류·입력자 열 추가
--
-- 선행: update_po_tracker_rule_refinements.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 요청 부서 · 변경 사유 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_request_origins (
  code TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  department TEXT NOT NULL,
  company TEXT NOT NULL,
  display_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  -- 분류의 기능 부분 (예: '본사_생산' → '생산') — 생산부 필터·통계용
  function_group TEXT GENERATED ALWAYS AS (NULLIF(btrim(substring(category FROM '_([^_]+)$')), '')) STORED,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  UNIQUE (company, department)
);

COMMENT ON TABLE public.po_request_origins IS '변경 요청 출처 부서 (본사·국내법인) — 표시명·분류는 관리자 설정 ''요청 부서''에서 관리';
COMMENT ON COLUMN public.po_request_origins.category IS '분류 (회사구분_기능, 예: 본사_생산·국내법인_영업관리)';

CREATE TABLE IF NOT EXISTS public.po_change_reasons (
  stat_unit_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  note TEXT NOT NULL CHECK (btrim(note) <> ''),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('customer', 'department')),
  origin_code TEXT REFERENCES public.po_request_origins(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'request')),
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (origin_type = 'customer' OR origin_code IS NOT NULL)
);

COMMENT ON TABLE public.po_change_reasons IS '변경 1건(v_do_change_events.stat_unit_key)의 사유·메모·요청 출처 — set_change_reasons()로만 기록. 묶음이 반려되면 각 라인이 묶음 사유를 물려받음';
COMMENT ON COLUMN public.po_change_reasons.reason IS 'PO 변경 사유 (request_reason_settings.value)';
COMMENT ON COLUMN public.po_change_reasons.source IS 'manual(영업관리팀 입력) / request(요청서에서 가져옴 — 3단계)';

CREATE TABLE IF NOT EXISTS public.po_change_reason_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_unit_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL,
  origin_type TEXT NOT NULL,
  origin_code TEXT,
  source TEXT NOT NULL,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_change_reason_history_key_idx ON public.po_change_reason_history (stat_unit_key, created_at);

COMMENT ON TABLE public.po_change_reason_history IS '변경 사유 입력·수정 이력';

-- 요청 부서 (요청부서별 분류 매칭 테이블.xlsx, 2026-10-19 전달)
INSERT INTO public.po_request_origins (code, department, company, display_name, category, sort_order) VALUES
  ('hq_global_sales_marketing', '해외영업마케팅팀', '본사', '해외영업마케팅팀 (본사)', '본사_영업', 1),
  ('hq_strategic_business', '전략사업팀', '본사', '전략사업팀 (본사)', '본사_영업', 2),
  ('hq_sales_admin', '영업관리팀', '본사', '영업관리팀 (본사)', '본사_영업관리', 3),
  ('hq_manufacturing', '제조팀', '본사', '제조팀 (본사·웰니스 생산)', '본사_생산', 4),
  ('hq_manufacturing_mgmt', '제조관리팀', '본사', '제조관리팀 (본사·인바디/신장계/컨슈머 생산)', '본사_생산', 5),
  ('hq_people', 'People 파트', '본사', 'People 파트 (본사)', '본사_인사', 6),
  ('hq_gbd', 'GBD 육성팀', '본사', 'GBD 육성팀 (본사)', '본사_영업', 7),
  ('hq_business_growth', '사업성장팀', '본사', '사업성장팀 (본사·웰니스 영업/CS)', '본사_영업·CS', 8),
  ('hq_global_cs', '글로벌 CS팀', '본사', '글로벌 CS팀 (본사)', '본사_CS', 9),
  ('ihc', '인바디헬스케어', '인바디헬스케어', '인바디헬스케어 (국내법인)', '국내법인_영업관리', 10),
  ('kort_production_mgmt', '생산관리팀', '코르트', '생산관리팀 (코르트·혈압계 생산)', '본사, 국내법인_생산', 11),
  ('kort_purchasing', '구매팀', '코르트', '구매팀 (코르트)', '국내법인_생산', 12)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.po_request_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_reason_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['po_request_origins', 'po_change_reasons', 'po_change_reason_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated users can view %1$s" ON public.%1$I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t
    );
  END LOOP;

  -- 요청 부서는 관리자 설정 화면에서 직접 수정 (사유·이력은 함수로만 기록)
  DROP POLICY IF EXISTS "Admins can insert po_request_origins" ON public.po_request_origins;
  DROP POLICY IF EXISTS "Admins can update po_request_origins" ON public.po_request_origins;
  DROP POLICY IF EXISTS "Admins can delete po_request_origins" ON public.po_request_origins;
  CREATE POLICY "Admins can insert po_request_origins" ON public.po_request_origins
    FOR INSERT WITH CHECK (public.is_po_tracker_admin());
  CREATE POLICY "Admins can update po_request_origins" ON public.po_request_origins
    FOR UPDATE USING (public.is_po_tracker_admin());
  CREATE POLICY "Admins can delete po_request_origins" ON public.po_request_origins
    FOR DELETE USING (public.is_po_tracker_admin());
END $$;

DROP TRIGGER IF EXISTS update_po_request_origins_updated_at ON public.po_request_origins;
CREATE TRIGGER update_po_request_origins_updated_at
  BEFORE UPDATE ON public.po_request_origins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------
-- 2. 조회용 뷰 (사유·출처 열)
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
  uk.stat_unit_key,
  (ov.item_no IS NOT NULL) AS is_class_overridden,
  rk.rule_key AS change_rule,
  COALESCE(ts.code, 'other') AS change_type_code,
  COALESCE(ts.label, oth.label, '기타') AS change_type_label,
  cm.manager_name,
  cm.manager_email,
  -- 변경 사유 (묶음이 반려되면 각 라인이 묶음 사유를 물려받음)
  rr.reason,
  rr.note AS reason_note,
  rr.origin_type AS reason_origin_type,
  rr.origin_code AS reason_origin_code,
  CASE WHEN rr.origin_type = 'customer' THEN c.customer_name ELSE ro.display_name END AS reason_origin_name,
  ro.category AS reason_origin_category,
  ro.function_group AS reason_origin_function,
  rr.source AS reason_source,
  rr.set_by_name AS reason_set_by_name,
  rr.set_at AS reason_set_at
FROM public.do_change_events e
LEFT JOIN public.customer_so_map c ON c.order_no = e.order_no
LEFT JOIN public.customer_managers cm ON cm.account_no = c.account_no
LEFT JOIN public.item_category_map i ON i.item_no = COALESCE(e.item_after, e.item_no)
LEFT JOIN public.category_class_settings cs ON cs.category_model = i.category_model
LEFT JOIN public.item_class_overrides ov ON ov.item_no = COALESCE(e.item_after, e.item_no)
LEFT JOIN public.product_groups pg
  ON pg.code = COALESCE(cs.group_code, NULLIF(split_part(i.category_model, '_', 1), ''))
LEFT JOIN public.do_change_groups g ON g.id = e.candidate_group_id
-- 통계용 키: 반려되지 않은 후보 묶음은 묶음 단위 1건, 같은 날·같은 주문·같은 DO의 같은 일정·운송방법 변경은 1건
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN g.id IS NOT NULL AND g.status <> 'rejected' THEN 'group:' || g.id::TEXT
    WHEN e.direction IN ('date', 'mode') THEN
      'shift:' || e.upload_id::TEXT || ':' || e.order_no || ':' || COALESCE(e.do_no, '') || ':' || e.direction || ':'
        || COALESCE(e.date_before::TEXT, e.mode_before, '') || '>' || COALESCE(e.date_after::TEXT, e.mode_after, '')
    ELSE 'event:' || e.id::TEXT
  END AS stat_unit_key
) uk
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.po_change_reasons x
  WHERE x.stat_unit_key = uk.stat_unit_key
     OR (e.candidate_group_id IS NOT NULL AND x.stat_unit_key = 'group:' || e.candidate_group_id::TEXT)
  ORDER BY (x.stat_unit_key = uk.stat_unit_key) DESC
  LIMIT 1
) rr ON TRUE
LEFT JOIN public.po_request_origins ro ON ro.code = rr.origin_code
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

COMMENT ON VIEW public.v_do_change_events IS '변경 이벤트 + 고객처·담당자·변경 사유·요청 출처·품목군·구분(품목 예외 우선)·변경 유형(관리자 설정)·제외 여부·후보 묶음 — 통계는 stat_unit_key 기준으로 셀 것 (후보 묶음·일정/운송방법 묶음은 1건)';


-- ---------------------------------------------------------------------
-- 3. 함수 (review_change_group은 인자가 늘어 기존 함수를 지우고 다시 만듦)
-- ---------------------------------------------------------------------
/**
 * 변경 사유 입력·수정 (여러 건 한 번에) — 영업관리팀이 변경 1건마다 사유·메모·요청 출처를 남김
 * @param p_keys 변경 1건 키 목록 (v_do_change_events.stat_unit_key)
 * @param p_reason PO 변경 사유 (request_reason_settings.value)
 * @param p_note 상세 사유 메모 (필수)
 * @param p_origin_type customer(고객처 요청) / department(내부 부서 요청)
 * @param p_origin_code 부서 요청일 때 po_request_origins.code
 * @returns 저장한 건수
 */
CREATE OR REPLACE FUNCTION public.set_change_reasons(
  p_keys TEXT[],
  p_reason TEXT,
  p_note TEXT,
  p_origin_type TEXT,
  p_origin_code TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(p_note), '');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_name TEXT;
  v_keys TEXT[];
  v_found INT;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '사유 입력 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY_AGG(DISTINCT k) INTO v_keys FROM unnest(p_keys) k WHERE NULLIF(btrim(k), '') IS NOT NULL;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION '사유를 입력할 변경을 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION '변경 사유를 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION '상세 사유 메모를 입력해주세요.' USING ERRCODE = '22023';
  END IF;
  IF p_origin_type NOT IN ('customer', 'department') THEN
    RAISE EXCEPTION '요청 출처를 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF p_origin_type = 'department'
     AND NOT EXISTS (SELECT 1 FROM public.po_request_origins WHERE code = p_origin_code AND is_active) THEN
    RAISE EXCEPTION '요청 부서를 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('public.request_reason_settings') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.request_reason_settings)
     AND NOT EXISTS (SELECT 1 FROM public.request_reason_settings WHERE value = v_reason) THEN
    RAISE EXCEPTION 'PO 변경 사유 목록에 없는 사유입니다: %', v_reason USING ERRCODE = '22023';
  END IF;

  -- 존재하는 변경 1건 키인지 (group:묶음, event:이벤트, shift:일정·운송방법 묶음)
  SELECT COUNT(*) INTO v_found
  FROM unnest(v_keys) k
  WHERE CASE
    WHEN k ~ '^group:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_groups g WHERE g.id = substring(k FROM 7)::UUID)
    WHEN k ~ '^event:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_events e WHERE e.id = substring(k FROM 7)::UUID)
    WHEN k LIKE 'shift:%' THEN EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = k)
    ELSE FALSE
  END;
  IF v_found <> array_length(v_keys, 1) THEN
    RAISE EXCEPTION '찾을 수 없는 변경이 있습니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
  SELECT k, v_reason, v_note, p_origin_type,
         CASE WHEN p_origin_type = 'department' THEN p_origin_code END,
         'manual', auth.uid(), v_name, NOW()
  FROM unnest(v_keys) k
  ON CONFLICT (stat_unit_key) DO UPDATE SET
    reason = EXCLUDED.reason,
    note = EXCLUDED.note,
    origin_type = EXCLUDED.origin_type,
    origin_code = EXCLUDED.origin_code,
    source = EXCLUDED.source,
    set_by = EXCLUDED.set_by,
    set_by_name = EXCLUDED.set_by_name,
    set_at = EXCLUDED.set_at;

  INSERT INTO public.po_change_reason_history (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name)
  SELECT k, v_reason, v_note, p_origin_type,
         CASE WHEN p_origin_type = 'department' THEN p_origin_code END,
         'manual', auth.uid(), v_name
  FROM unnest(v_keys) k;

  RETURN array_length(v_keys, 1);
END;
$$;

-- 인자가 3개였던 이전 버전 제거 (같은 이름 함수가 두 개 생기지 않도록)
DROP FUNCTION IF EXISTS public.review_change_group(UUID, TEXT, TEXT);

/**
 * 후보 묶음 승인·반려·되돌리기 (담당자 확인) — 반려하면 통계에서 각 이벤트를 개별 삭제·추가로 센다
 * 승인·반려는 메모 필수. 처리자 이름은 묶음에 저장하고 모든 처리를 이력에 남긴다
 * 사유(p_reason)를 함께 넘기면 메모를 상세 사유로 하여 묶음의 변경 사유도 저장한다
 * (반려되면 각 라인이 묶음 사유를 물려받음)
 */
CREATE OR REPLACE FUNCTION public.review_change_group(
  p_group_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL,
  p_origin_code TEXT DEFAULT NULL
)
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

  -- 묶음 사유 (승인·반려와 함께)
  IF p_status <> 'pending' AND NULLIF(btrim(p_reason), '') IS NOT NULL THEN
    PERFORM public.set_change_reasons(
      ARRAY['group:' || p_group_id::TEXT], p_reason, v_note, COALESCE(p_origin_type, 'customer'), p_origin_code
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) TO authenticated;
