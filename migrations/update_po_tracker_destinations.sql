-- =====================================================================
-- PO Tracker: 경유 고객처(인바디헬스케어·코르트) 실제 도착지·표시명 (2026-10-21)
--
-- 변경 내용
--   1) 판매주문조회의 도착항·국가/지역·이름2를 주문별로 저장 (customer_so_map)
--      → 다음 판매주문조회 업로드부터 채워짐 (파일에 그해 주문이 모두 있어 한 번이면 전체가 채워짐)
--   2) po_via_customers: 경유 고객처 (인바디헬스케어·코르트)
--      po_destination_map: 도착항(우선)·국가 → 실제 고객처, 또는 건별 선택 후보 (대만·이스라엘·파나마·필리핀)
--      po_country_names: 국가 코드 → 한글 국가명
--      po_order_destinations: 건별로 고른 실제 고객처 (set_order_destination, 영업관리팀)
--   3) 표시명: "주식회사 인바디헬스케어_미국(미국법인)" / 고르기 전 "_대만" / 도착항 빈칸 "_국내"
--      판단 순서: 건별 선택 → 이름2 메모가 후보와 맞음 → 연결표(도착항 → 국가) → 국가명 → 국내
--      조회 범위·담당자는 판매주문 고객처 기준 그대로
--
-- 선행: update_po_tracker_rule_refinements_2.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블·초기값
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_via_customers (
  customer_name TEXT PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_via_customers IS '경유 고객처 — 판매주문 고객처만으로는 실제 도착지를 알 수 없어 표시명 뒤에 실제 고객처·국가를 붙이는 곳 (인바디헬스케어·코르트)';

CREATE TABLE IF NOT EXISTS public.po_country_names (
  country_code TEXT PRIMARY KEY,
  name_ko TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_country_names IS '판매주문조회 국가/지역 코드(ISO 3자리) → 한글 국가명';

CREATE TABLE IF NOT EXISTS public.po_destination_map (
  match_key TEXT PRIMARY KEY,
  target_customer TEXT,
  choice_candidates TEXT[],
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CHECK (target_customer IS NOT NULL OR COALESCE(array_length(choice_candidates, 1), 0) > 0)
);

COMMENT ON TABLE public.po_destination_map IS '경유 고객처 주문의 도착지 → 실제 고객처. match_key는 도착항 코드(예: O_LGB, 우선) 또는 국가 코드(예: JPN). target_customer가 없고 choice_candidates가 있으면 건별 선택';

CREATE TABLE IF NOT EXISTS public.po_order_destinations (
  order_no TEXT PRIMARY KEY,
  target_customer TEXT NOT NULL,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.po_order_destinations IS '경유 고객처 주문의 실제 고객처를 건별로 고른 값 (PO 변경 화면, 영업관리팀) — 도착지 연결표보다 우선';

ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS dest_port TEXT;
ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS dest_country TEXT;
ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS customer_name2 TEXT;
COMMENT ON COLUMN public.customer_so_map.dest_port IS '판매주문조회 도착항 (O_=Ocean, A_=Air, 빈칸이면 국내)';
COMMENT ON COLUMN public.customer_so_map.dest_country IS '판매주문조회 국가/지역 (ISO 3자리)';
COMMENT ON COLUMN public.customer_so_map.customer_name2 IS '판매주문조회 이름2 (경유 고객처는 "_대만(KOLY)"처럼 실제 고객처를 적기도 함)';

-- 경유 고객처
INSERT INTO public.po_via_customers (customer_name, note) VALUES
  ('주식회사 인바디헬스케어', '국내·해외 법인·대리점 물량을 함께 주문'),
  ('주식회사 코르트', '해외 수출은 해외법인 물량만')
ON CONFLICT (customer_name) DO NOTHING;

-- 국가 한글명 (판매주문조회 국가/지역 코드)
INSERT INTO public.po_country_names (country_code, name_ko) VALUES
  ('ARE', 'UAE'), ('ARG', '아르헨티나'), ('ARM', '아르메니아'), ('AUS', '호주'), ('AZE', '아제르바이잔'),
  ('BHR', '바레인'), ('BOL', '볼리비아'), ('BRA', '브라질'), ('CAN', '캐나다'), ('CHL', '칠레'),
  ('CHN', '중국'), ('COL', '콜롬비아'), ('CRI', '코스타리카'), ('DEU', '독일'), ('DOM', '도미니카공화국'),
  ('ECU', '에콰도르'), ('ESP', '스페인'), ('GEO', '조지아'), ('GTM', '과테말라'), ('HKG', '홍콩'),
  ('IDN', '인도네시아'), ('IND', '인도'), ('IRQ', '이라크'), ('ISR', '이스라엘'), ('JOR', '요르단'),
  ('JPN', '일본'), ('KAZ', '카자흐스탄'), ('KHM', '캄보디아'), ('KOR', '한국'), ('KWT', '쿠웨이트'),
  ('LAO', '라오스'), ('LBN', '레바논'), ('LBY', '리비아'), ('MEX', '멕시코'), ('MMR', '미얀마'),
  ('MNG', '몽골'), ('MYS', '말레이시아'), ('NLD', '네덜란드'), ('OMN', '오만'), ('PAK', '파키스탄'),
  ('PAN', '파나마'), ('PER', '페루'), ('PHL', '필리핀'), ('POL', '폴란드'), ('PRY', '파라과이'),
  ('QAT', '카타르'), ('RUS', '러시아'), ('SAU', '사우디아라비아'), ('SGP', '싱가포르'), ('THA', '태국'),
  ('TUR', '튀르키예'), ('TWN', '대만'), ('UGA', '우간다'), ('UKR', '우크라이나'), ('USA', '미국'),
  ('UZB', '우즈베키스탄'), ('VNM', '베트남'), ('GBR', '영국'), ('FRA', '프랑스'), ('ITA', '이탈리아')
ON CONFLICT (country_code) DO NOTHING;

-- 도착지 → 실제 고객처 (도착항 코드가 국가 코드보다 우선)
INSERT INTO public.po_destination_map (match_key, target_customer, choice_candidates, note) VALUES
  ('O_LGB', '미국(미국법인)', NULL, '롱비치항 — 미국 서부'),
  ('O_USMNH', '미국(미국동부법인)', NULL, '뉴욕항 — 미국 동부'),
  ('O_USMIA', '베네수엘라(Comercializado)', NULL, '마이애미항 — 베네수엘라 대리점 경유'),
  ('JPN', '일본(일본법인)', NULL, NULL),
  ('CHN', '중국(중국법인)', NULL, NULL),
  ('THA', '태국(InBody Thailand Co., Ltd.)', NULL, NULL),
  ('HKG', '홍콩(Pro-Med)', NULL, NULL),
  ('SGP', '말레이시아(아시아법인)', NULL, '싱가포르 물량은 아시아법인'),
  ('MYS', '말레이시아(아시아법인)', NULL, NULL),
  ('NLD', '네덜란드(유럽법인)', NULL, NULL),
  ('MEX', '멕시코(멕시코법인)', NULL, NULL),
  ('AUS', '호주(호주법인)', NULL, NULL),
  ('IND', '인도(인도법인)', NULL, NULL),
  ('IDN', '인도네시아(PT. InBody Global Healthcare)', NULL, NULL),
  ('SAU', '사우디아라비아(Delta Marketing)', NULL, NULL),
  ('ARE', 'UAE(SPEC BRITE GENERAL TRADING LLC)', NULL, NULL),
  ('KWT', 'UAE(SPEC BRITE GENERAL TRADING LLC)', NULL, '쿠웨이트 물량은 UAE 대리점'),
  ('ARG', '아르헨티나(Cala Med Argentina SRL)', NULL, NULL),
  ('CHL', '칠레(CDM MEDICAL SPA)', NULL, NULL),
  ('CRI', '코스타리카(INSUMED)', NULL, NULL),
  ('DOM', '도미니카공화국(Out Fitness)', NULL, NULL),
  ('JOR', '요르단(Arab Engineers)', NULL, NULL),
  ('PAK', '파키스탄(Aair Medicals)', NULL, NULL),
  ('BRA', '브라질(Ottoboni Ltda.)', NULL, NULL),
  ('COL', '콜롬비아(SPECIALIZED WORLWIDE LOGISTICS SAS)', NULL, NULL),
  ('TWN', NULL, ARRAY['말레이시아(아시아법인)', '대만(KOLY Group)'], '건별 선택'),
  ('ISR', NULL, ARRAY['이스라엘(Energym BashGal)', '팔레스타인(Curatek)'], '건별 선택'),
  ('PAN', NULL, ARRAY['파나마(Innomed)', '파나마(Insumed Comercial Panama)'], '건별 선택'),
  ('PHL', NULL, ARRAY['주식회사 아이비홀딩스', '필리핀(Sportfit)'], '건별 선택')
ON CONFLICT (match_key) DO NOTHING;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['po_via_customers', 'po_country_names', 'po_destination_map'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Authenticated users can view %1$s" ON public.%1$I FOR SELECT USING (auth.uid() IS NOT NULL)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admins can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_po_tracker_admin())', t);
    EXECUTE format('CREATE POLICY "Admins can update %1$s" ON public.%1$I FOR UPDATE USING (public.is_po_tracker_admin())', t);
    EXECUTE format('CREATE POLICY "Admins can delete %1$s" ON public.%1$I FOR DELETE USING (public.is_po_tracker_admin())', t);
  END LOOP;

  ALTER TABLE public.po_order_destinations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Sales team can view po_order_destinations" ON public.po_order_destinations;
  CREATE POLICY "Sales team can view po_order_destinations" ON public.po_order_destinations
    FOR SELECT USING (public.po_is_sales_team());
END $$;


-- ---------------------------------------------------------------------
-- 2. 뷰
-- ---------------------------------------------------------------------
-- 주문별 도착지·실제 고객처·표시명
-- 판단 순서: 건별 선택 → 이름2 메모가 후보 고객처와 맞음 → 도착지 연결표(도착항 우선, 국가) → 국가명 → 도착항 빈칸이면 국내
-- (도착 정보를 아직 받지 못한 주문은 고객처명 그대로)
CREATE OR REPLACE VIEW public.v_order_destinations
WITH (security_invoker = true)
AS
SELECT
  c.order_no,
  c.customer_name,
  c.dest_port,
  c.dest_country,
  COALESCE(cn.name_ko, c.dest_country) AS dest_country_name,
  (vc.customer_name IS NOT NULL) AS is_via_customer,
  rule.choice_candidates,
  od.target_customer AS chosen_customer,
  od.set_by_name AS chosen_by_name,
  od.set_at AS chosen_at,
  t.actual_customer,
  (vc.customer_name IS NOT NULL AND t.actual_customer IS NULL
    AND COALESCE(array_length(rule.choice_candidates, 1), 0) > 0 AND c.dest_port IS NOT NULL) AS needs_destination_choice,
  CASE
    WHEN vc.customer_name IS NULL THEN c.customer_name
    -- 도착 정보가 아직 안 들어온 주문(이 기능 이전 업로드, 이름2도 비어 있음)은 고객처명 그대로
    WHEN c.customer_name2 IS NULL AND c.dest_port IS NULL AND c.dest_country IS NULL THEN c.customer_name
    ELSE c.customer_name || '_' || COALESCE(
      t.actual_customer,
      CASE WHEN c.dest_port IS NULL THEN '국내' END,
      cn.name_ko,
      c.dest_country,
      '국내'
    )
  END AS display_customer_name
FROM public.customer_so_map c
LEFT JOIN public.po_via_customers vc ON vc.customer_name = c.customer_name
LEFT JOIN public.po_country_names cn ON cn.country_code = c.dest_country
LEFT JOIN public.po_order_destinations od ON od.order_no = c.order_no
LEFT JOIN LATERAL (
  SELECT m.target_customer, m.choice_candidates
  FROM public.po_destination_map m
  WHERE m.match_key IN (c.dest_port, c.dest_country)
  ORDER BY (m.match_key = c.dest_port) DESC
  LIMIT 1
) rule ON vc.customer_name IS NOT NULL AND c.dest_port IS NOT NULL
CROSS JOIN LATERAL (
  SELECT COALESCE(
    od.target_customer,
    -- 이름2 "고객처_대만(KOLY)" → 후보 중 이름이 그렇게 시작하는 고객처 (공백·대소문자·닫는 괄호 무시)
    (SELECT cand FROM unnest(COALESCE(rule.choice_candidates, ARRAY[]::TEXT[]) || ARRAY[rule.target_customer]) cand
      WHERE cand IS NOT NULL
        AND position('_' IN COALESCE(c.customer_name2, '')) > 0
        AND lower(replace(cand, ' ', '')) LIKE
            lower(replace(replace(split_part(c.customer_name2, '_', 2), ' ', ''), ')', '')) || '%'
        AND length(split_part(c.customer_name2, '_', 2)) >= 2
      LIMIT 1),
    rule.target_customer
  ) AS actual_customer
) t;

COMMENT ON VIEW public.v_order_destinations IS '주문별 도착항·국가·실제 고객처·표시명 (경유 고객처는 "고객처_실제 고객처/국가/국내")';

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
  rr.set_at AS reason_set_at,
  -- "변경 아님(정정)" 처리 — 통계·사유 입력 대상에서 빠짐 (묶음이 반려되면 묶음 처리를 물려받음)
  (dm.stat_unit_key IS NOT NULL) AS is_dismissed,
  dm.note AS dismiss_note,
  dm.dismissed_by_name,
  dm.dismissed_at,
  -- 경유 고객처(인바디헬스케어·코르트)는 "고객처_실제 고객처/국가/국내" — 조회 범위·담당자는 customer_name 기준
  COALESCE(od.display_customer_name, COALESCE(c.customer_name, CASE WHEN e.is_transfer THEN '이전(Transfer)' END)) AS display_customer_name,
  od.dest_port,
  od.dest_country,
  od.dest_country_name,
  od.actual_customer,
  COALESCE(od.needs_destination_choice, FALSE) AS needs_destination_choice,
  od.choice_candidates AS destination_candidates,
  od.chosen_by_name AS destination_chosen_by_name
FROM public.do_change_events e
LEFT JOIN public.customer_so_map c ON c.order_no = e.order_no
LEFT JOIN public.v_order_destinations od ON od.order_no = e.order_no
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
    -- 같은 날 한 주문의 라인이 모두 삭제(주문 취소)되면 주문 단위 1건
    WHEN e.change_type = 'line_removed' AND NOT EXISTS (
      SELECT 1 FROM public.do_order_lines ol WHERE ol.order_no = e.order_no AND ol.status <> 'removed'
    ) THEN 'order:' || e.upload_id::TEXT || ':' || e.order_no
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
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.po_change_dismissals x
  WHERE x.stat_unit_key = uk.stat_unit_key
     OR (e.candidate_group_id IS NOT NULL AND x.stat_unit_key = 'group:' || e.candidate_group_id::TEXT)
  ORDER BY (x.stat_unit_key = uk.stat_unit_key) DESC
  LIMIT 1
) dm ON TRUE
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
-- 3. 함수
-- ---------------------------------------------------------------------
/**
 * 판매주문조회 반영
 *
 * p_orders: [{ord, acct, name, port, cty, name2}] (port=도착항, cty=국가/지역, name2=이름2)                              판매주문 → 고객처 (전체 주문)
 * p_items:  [{item, nm, cat, typ}]                           품목 → 카테고리 모델·품목유형 (전체 품목)
 * p_lines:  [{ord, ln, item, nm, q_ord, q_shp, q_rem, ls, hs}] 미출고 SO 라인 (상태_라인이 INVOICED가 아니거나 잔여 배송 > 0)
 */
CREATE OR REPLACE FUNCTION public.apply_so_snapshot(
  p_upload_id UUID,
  p_orders JSONB,
  p_items JSONB,
  p_lines JSONB,
  p_row_count INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_up public.po_source_uploads;
  v_summary JSONB;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_up FROM public.po_source_uploads WHERE id = p_upload_id FOR UPDATE;
  IF v_up.id IS NULL OR v_up.kind <> 'sales_order' OR v_up.status <> 'processing' THEN
    RAISE EXCEPTION '처리할 수 없는 업로드입니다. (판매주문조회 업로드가 아니거나 이미 처리됨)';
  END IF;

  -- 판매주문 → 고객처
  INSERT INTO public.customer_so_map AS m
    (order_no, account_no, customer_name, dest_port, dest_country, customer_name2,
     first_seen_upload_id, last_seen_upload_id, last_seen_date)
  SELECT DISTINCT ON (o.ord) o.ord, o.acct, o.name, NULLIF(btrim(o.port), ''), NULLIF(btrim(o.cty), ''), NULLIF(btrim(o.name2), ''),
         p_upload_id, p_upload_id, v_up.snapshot_date
  FROM jsonb_to_recordset(p_orders) AS o(ord TEXT, acct TEXT, name TEXT, port TEXT, cty TEXT, name2 TEXT)
  WHERE o.ord IS NOT NULL
  ORDER BY o.ord
  ON CONFLICT (order_no) DO UPDATE SET
    account_no = EXCLUDED.account_no,
    customer_name = EXCLUDED.customer_name,
    dest_port = EXCLUDED.dest_port,
    dest_country = EXCLUDED.dest_country,
    customer_name2 = EXCLUDED.customer_name2,
    last_seen_upload_id = EXCLUDED.last_seen_upload_id,
    last_seen_date = EXCLUDED.last_seen_date,
    updated_at = NOW();

  -- 품목 → 카테고리 모델 (파일에 값이 없으면 기존 값 유지)
  INSERT INTO public.item_category_map AS m (item_no, item_name, category_model, item_type, last_seen_upload_id)
  SELECT DISTINCT ON (i.item) i.item, i.nm, NULLIF(i.cat, ''), i.typ, p_upload_id
  FROM jsonb_to_recordset(p_items) AS i(item TEXT, nm TEXT, cat TEXT, typ TEXT)
  WHERE i.item IS NOT NULL
  ORDER BY i.item, (i.cat IS NULL)
  ON CONFLICT (item_no) DO UPDATE SET
    item_name = EXCLUDED.item_name,
    category_model = COALESCE(EXCLUDED.category_model, m.category_model),
    item_type = COALESCE(EXCLUDED.item_type, m.item_type),
    last_seen_upload_id = EXCLUDED.last_seen_upload_id;

  -- 미출고 SO 라인 (같은 주문·라인·품목은 합산, 취소가 아닌 상태 우선)
  INSERT INTO public.so_lines AS s (
    order_no, line_no, item_no, item_name, ordered_qty, shipped_qty, remaining_qty,
    line_status, header_status, first_seen_upload_id, first_seen_date, last_seen_upload_id
  )
  SELECT
    l.ord, l.ln, l.item,
    (ARRAY_AGG(l.nm))[1],
    COALESCE(SUM(l.q_ord), 0)::INT,
    COALESCE(SUM(l.q_shp), 0)::INT,
    COALESCE(SUM(l.q_rem), 0)::INT,
    (ARRAY_AGG(l.ls ORDER BY (l.ls = 'CANCELED')))[1],
    (ARRAY_AGG(l.hs))[1],
    p_upload_id, v_up.snapshot_date, p_upload_id
  FROM jsonb_to_recordset(p_lines) AS l(
    ord TEXT, ln INT, item TEXT, nm TEXT, q_ord INT, q_shp INT, q_rem INT, ls TEXT, hs TEXT
  )
  WHERE l.ord IS NOT NULL AND l.item IS NOT NULL
  GROUP BY l.ord, l.ln, l.item
  ON CONFLICT (order_no, line_no, item_no) DO UPDATE SET
    item_name = EXCLUDED.item_name,
    ordered_qty = EXCLUDED.ordered_qty,
    shipped_qty = EXCLUDED.shipped_qty,
    remaining_qty = EXCLUDED.remaining_qty,
    line_status = EXCLUDED.line_status,
    header_status = EXCLUDED.header_status,
    last_seen_upload_id = EXCLUDED.last_seen_upload_id,
    updated_at = NOW();

  -- 이번 파일에 없는 라인은 출하 완료·삭제된 것으로 보고 제거
  DELETE FROM public.so_lines WHERE last_seen_upload_id IS DISTINCT FROM p_upload_id;

  v_summary := jsonb_build_object(
    'orders', (SELECT COUNT(*) FROM public.customer_so_map WHERE last_seen_upload_id = p_upload_id),
    'items', (SELECT COUNT(*) FROM public.item_category_map WHERE last_seen_upload_id = p_upload_id),
    'open_so_lines', (SELECT COUNT(*) FROM public.so_lines),
    'unclassified_items', (
      SELECT COUNT(*)
      FROM public.item_category_map i
      LEFT JOIN public.category_class_settings cs ON cs.category_model = i.category_model
      WHERE i.last_seen_upload_id = p_upload_id AND cs.category_model IS NULL
    )
  );

  UPDATE public.po_source_uploads
  SET status = 'completed', row_count = p_row_count, summary = v_summary, completed_at = NOW()
  WHERE id = p_upload_id;

  RETURN v_summary;
END;
$$;

DROP FUNCTION IF EXISTS public.po_dashboard_changes(DATE, DATE);
CREATE OR REPLACE FUNCTION public.po_dashboard_changes(p_from DATE, p_to DATE)
RETURNS TABLE (
  stat_unit_key TEXT,
  detected_on DATE,
  change_type_code TEXT,
  change_type_label TEXT,
  customer_name TEXT,
  display_customer_name TEXT,
  dest_country_name TEXT,
  product_class TEXT,
  reason TEXT,
  reason_origin_type TEXT,
  reason_origin_code TEXT,
  reason_origin_name TEXT,
  reason_origin_function TEXT,
  group_type TEXT,
  group_status TEXT,
  line_count INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT * INTO s FROM public.po_my_view_scope();
  IF s.scope = 'none' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v.stat_unit_key,
    MIN(v.detected_on),
    MIN(v.change_type_code),
    MIN(v.change_type_label),
    MIN(v.customer_name),
    MIN(v.display_customer_name),
    MIN(v.dest_country_name),
    MIN(v.product_class),
    MIN(v.reason),
    MIN(v.reason_origin_type),
    MIN(v.reason_origin_code),
    MIN(v.reason_origin_name),
    MIN(v.reason_origin_function),
    MIN(v.group_type),
    MIN(v.group_status),
    COUNT(*)::INT
  FROM public.v_do_change_events v
  WHERE v.detected_on BETWEEN p_from AND p_to
    AND NOT v.is_excluded
    AND NOT v.is_dismissed
    AND (
      s.scope = 'all'
      OR (s.scope = 'customer' AND v.customer_name = s.customer_name)
      OR (s.scope = 'department' AND (v.reason_origin_code = s.origin_code OR v.customer_name = ANY (s.granted_customers)))
    )
  GROUP BY v.stat_unit_key;
END;
$$;

/**
 * 경유 고객처 주문의 실제 고객처를 건별로 지정·해제 (영업관리팀)
 * @param p_order_no 판매주문 번호
 * @param p_target 실제 고객처 (NULL이면 지정 해제 → 연결표·국가 기준으로 돌아감)
 */
CREATE OR REPLACE FUNCTION public.set_order_destination(p_order_no TEXT, p_target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dest RECORD;
  v_name TEXT;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dest FROM public.v_order_destinations WHERE order_no = p_order_no;
  IF v_dest.order_no IS NULL OR NOT v_dest.is_via_customer THEN
    RAISE EXCEPTION '경유 고객처 주문이 아닙니다: %', p_order_no USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_target), '') IS NULL THEN
    DELETE FROM public.po_order_destinations WHERE order_no = p_order_no;
    RETURN;
  END IF;

  IF NOT (p_target = ANY (COALESCE(v_dest.choice_candidates, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '이 주문의 후보 고객처가 아닙니다: %', p_target USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();
  INSERT INTO public.po_order_destinations (order_no, target_customer, set_by, set_by_name, set_at)
  VALUES (p_order_no, p_target, auth.uid(), v_name, NOW())
  ON CONFLICT (order_no) DO UPDATE SET
    target_customer = EXCLUDED.target_customer,
    set_by = EXCLUDED.set_by,
    set_by_name = EXCLUDED.set_by_name,
    set_at = EXCLUDED.set_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_destination(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_destination(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.po_dashboard_changes(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_dashboard_changes(DATE, DATE) TO authenticated;
