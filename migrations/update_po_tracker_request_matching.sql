-- =====================================================================
-- PO Tracker: 요청 ↔ DO 변경 연결 (3단계, 2026-10-22)
--
-- DO에서 찾은 변경 1건마다 등록된 요청서에 따른 변경인지 판정
--   1) 연결 후보: SO 번호 같음(필수) + 품목코드 같음(출하일정·운송방법 변경은 요청 단위)
--                 + 변경 감지일이 요청일 -7일 ~ +45일 안 (관리자 설정 '요청 연결 기준')
--   2) 자동 연결: 유형(요청구분 = 변경 유형, 고친 유형 기준)·수량까지 모두 맞고 양쪽 후보가 하나뿐일 때
--      — DO 업로드가 끝날 때, 요청을 등록·수정할 때 (반려된 요청·예외 처리한 변경·해제한 짝은 제외)
--      그 밖의 후보는 영업관리팀이 골라서 연결 (link_change_request), 해제는 메모 필수 (unlink_change_request)
--   3) 연결되면 변경 사유가 비어 있을 때만 요청서의 사유·출처·상세 내용으로 채움 (po_change_reasons.source = 'request')
--      연결이 모두 풀리면 요청서에서 가져온 채 고치지 않은 사유는 지움
--   4) 등록 상태(v_do_change_events.registration_status): pre 사전 등록 / post 사후 등록 / exempt 예외 처리 /
--      waiting 확인 대기(감지 후 5영업일 안) / unregistered 미등록
--   5) 예외 처리(set_change_exemptions, 메모 필수): 변경은 맞지만 요청서가 필요 없었던 건 — "변경 아님(정정)"과 다름
--   6) 요청 쪽: po_request_reflections(DO 반영 — 반영됨/부분 반영/연결 없음/SO 없음), po_unreflected_requests(미반영 요청)
--   7) PO 현황 대시보드: po_dashboard_changes에 등록 상태 열 추가
--
-- 선행: update_po_tracker_type_override_cleanup.sql
-- 여러 번 실행해도 안전합니다. 실행만으로는 연결하지 않습니다 — 지금 requests에 시험 데이터가 있어,
-- PO 변경 > 미등록 변경의 '다시 매칭' 버튼이나 다음 DO 업로드·요청 등록 때부터 자동 연결됩니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 요청 ↔ DO 변경 연결 테이블·헬퍼
--      변경 1건(stat_unit_key)과 요청서(요청 1건 × 품목, 일정·운송방법은 요청 단위)를 연결해 등록 여부를 판정
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_match_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  days_before INT NOT NULL DEFAULT 7 CHECK (days_before BETWEEN 0 AND 365),
  days_after INT NOT NULL DEFAULT 45 CHECK (days_after BETWEEN 0 AND 365),
  grace_business_days INT NOT NULL DEFAULT 5 CHECK (grace_business_days BETWEEN 0 AND 60),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

INSERT INTO public.po_match_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.po_match_settings IS '요청 ↔ DO 변경 연결 기준 (한 행) — 관리자 설정 ''요청 연결 기준''';
COMMENT ON COLUMN public.po_match_settings.days_before IS 'DO 변경이 요청일보다 이만큼(일) 먼저 감지돼도 후보 (사후 등록)';
COMMENT ON COLUMN public.po_match_settings.days_after IS 'DO 변경이 요청일 뒤 이만큼(일) 안에 감지되면 후보';
COMMENT ON COLUMN public.po_match_settings.grace_business_days IS '연결 없는 변경을 미등록으로 보기 전 기다리는 영업일 (그 전은 확인 대기)';

CREATE TABLE IF NOT EXISTS public.request_change_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  -- 요청 품목코드 (일정·운송방법처럼 요청 단위로 연결하면 빈칸)
  item_key TEXT NOT NULL DEFAULT '',
  stat_unit_key TEXT NOT NULL,
  request_date DATE NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('auto', 'manual')),
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('linked', 'unlinked')),
  note TEXT,
  linked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  linked_by_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  unlinked_by_name TEXT,
  unlinked_at TIMESTAMPTZ,
  UNIQUE (request_id, item_key, stat_unit_key)
);

CREATE INDEX IF NOT EXISTS request_change_links_key_idx ON public.request_change_links (stat_unit_key) WHERE status = 'linked';

COMMENT ON TABLE public.request_change_links IS '요청 ↔ 변경 1건 연결 — 자동 연결(po_run_auto_link) 또는 영업관리팀 연결. 해제한 짝(unlinked)은 자동으로 다시 연결하지 않음';
COMMENT ON COLUMN public.request_change_links.request_date IS '요청일 (requests.request_date 복사 — 사전/사후 등록 판정용, 요청이 바뀌면 트리거가 갱신)';

CREATE TABLE IF NOT EXISTS public.request_change_link_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID,
  request_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  stat_unit_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('linked', 'unlinked')),
  link_type TEXT,
  note TEXT,
  acted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  acted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS request_change_link_history_key_idx ON public.request_change_link_history (stat_unit_key, created_at);

COMMENT ON TABLE public.request_change_link_history IS '요청 ↔ 변경 연결·해제 이력';

CREATE TABLE IF NOT EXISTS public.po_change_exemptions (
  stat_unit_key TEXT PRIMARY KEY,
  note TEXT NOT NULL CHECK (btrim(note) <> ''),
  exempted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  exempted_by_name TEXT,
  exempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.po_change_exemptions IS '예외 처리 — 변경은 맞지만 요청서가 필요 없었던 건 (미등록에서 빠짐). "변경 아님(정정)"과 다름. set_change_exemptions()로만 기록';

CREATE TABLE IF NOT EXISTS public.po_change_exemption_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_unit_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('exempted', 'restored')),
  note TEXT,
  acted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  acted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_change_exemption_history_key_idx ON public.po_change_exemption_history (stat_unit_key, created_at);

COMMENT ON TABLE public.po_change_exemption_history IS '예외 처리·해제 이력';

/**
 * 주문번호·품목코드 비교용 정리 — 공백 제거, 대문자, 빈칸은 NULL
 */
CREATE OR REPLACE FUNCTION public.po_norm_code(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p_value, ''), '\s', '', 'g')), '')
$$;

/**
 * 두 날짜 사이 영업일 수 (p_from 다음 날 ~ p_to, 토·일 제외, 공휴일은 따지지 않음)
 */
CREATE OR REPLACE FUNCTION public.po_business_days_between(p_from DATE, p_to DATE)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COUNT(*)::INT
  FROM generate_series(p_from + 1, p_to, INTERVAL '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6
$$;

/**
 * 오늘 날짜 (한국 시간)
 */
CREATE OR REPLACE FUNCTION public.po_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::DATE
$$;

/**
 * 요청서의 품목 목록 — items 배열 우선, 없으면 단일 품목 칸. 같은 품목코드는 수량을 합침 (수량은 절댓값)
 * @returns item_key(정리한 품목코드), item_name, qty
 */
CREATE OR REPLACE FUNCTION public.po_request_items(p_items JSONB, p_erp_code TEXT, p_item_name TEXT, p_quantity INT)
RETURNS TABLE (item_key TEXT, item_name TEXT, qty INT)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH raw AS (
    SELECT
      public.po_norm_code(x->>'erp_code') AS item_key,
      NULLIF(btrim(x->>'item_name'), '') AS item_name,
      CASE WHEN (x->>'quantity') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN abs(btrim(x->>'quantity')::NUMERIC) END AS qty
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::JSONB END) x
    WHERE jsonb_typeof(x) = 'object'
  )
  SELECT raw.item_key, MIN(raw.item_name), ROUND(SUM(raw.qty))::INT
  FROM raw
  WHERE raw.item_key IS NOT NULL
  GROUP BY raw.item_key
  UNION ALL
  SELECT public.po_norm_code(p_erp_code), NULLIF(btrim(p_item_name), ''), abs(p_quantity)
  WHERE public.po_norm_code(p_erp_code) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM raw WHERE raw.item_key IS NOT NULL)
$$;


-- ---------------------------------------------------------------------
-- RLS: 연결 기준은 로그인 사용자 조회·관리자 수정, 연결·예외 처리는 영업관리팀만 조회 (쓰기는 함수로만)
-- ---------------------------------------------------------------------
ALTER TABLE public.po_match_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_change_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_change_link_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_exemption_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view po_match_settings" ON public.po_match_settings;
CREATE POLICY "Authenticated users can view po_match_settings" ON public.po_match_settings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins can insert po_match_settings" ON public.po_match_settings;
DROP POLICY IF EXISTS "Admins can update po_match_settings" ON public.po_match_settings;
DROP POLICY IF EXISTS "Admins can delete po_match_settings" ON public.po_match_settings;
CREATE POLICY "Admins can insert po_match_settings" ON public.po_match_settings FOR INSERT WITH CHECK (public.is_po_tracker_admin());
CREATE POLICY "Admins can update po_match_settings" ON public.po_match_settings FOR UPDATE USING (public.is_po_tracker_admin());
CREATE POLICY "Admins can delete po_match_settings" ON public.po_match_settings FOR DELETE USING (public.is_po_tracker_admin());

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['request_change_links', 'request_change_link_history', 'po_change_exemptions', 'po_change_exemption_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Sales team can view %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Sales team can view %1$s" ON public.%1$I FOR SELECT USING (public.po_is_sales_team())', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 조회용 뷰 (요청 연결·등록 상태 열 추가)
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
  -- 통계 표시명: 관리자 설정의 변경 유형 이름 (영업관리팀이 고친 유형 우선)
  COALESCE(tos.label, ts.label, oth.label, '기타') AS stat_label,
  -- 통계용: 반려되지 않은 후보 묶음(분할/합배송·품목코드 변경)은 묶음 단위 1건, 나머지는 이벤트 1건
  uk.stat_unit_key,
  (ov.item_no IS NOT NULL) AS is_class_overridden,
  rk.rule_key AS change_rule,
  COALESCE(tos.code, ts.code, 'other') AS change_type_code,
  COALESCE(tos.label, ts.label, oth.label, '기타') AS change_type_label,
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
  od.chosen_by_name AS destination_chosen_by_name,
  -- 변경 유형을 영업관리팀이 고쳤는지(고친 유형이 자동 판정과 다를 때만), 자동 판정 유형, 고친 사람
  (tos.code IS NOT NULL AND tos.code <> COALESCE(ts.code, 'other')) AS is_type_overridden,
  COALESCE(ts.code, 'other') AS rule_type_code,
  CASE WHEN tos.code IS NOT NULL AND tos.code <> COALESCE(ts.code, 'other') THEN tov.set_by_name END AS type_set_by_name,
  CASE WHEN tos.code IS NOT NULL AND tos.code <> COALESCE(ts.code, 'other') THEN tov.set_at END AS type_set_at,
  -- 요청 연결 (3단계): 연결된 요청 수, 가장 이른 요청일, 예외 처리, 등록 상태
  --   pre 사전 등록(변경 감지일 이전 요청) / post 사후 등록 / exempt 예외 처리 / waiting 확인 대기(유예 영업일 안) / unregistered 미등록
  COALESCE(lk.linked_request_count, 0) AS linked_request_count,
  lk.first_request_date AS linked_request_date,
  (xm.stat_unit_key IS NOT NULL) AS is_exempt,
  xm.note AS exempt_note,
  xm.exempted_by_name,
  xm.exempted_at,
  CASE
    WHEN lk.linked_request_count > 0 THEN CASE WHEN lk.first_request_date <= e.detected_on THEN 'pre' ELSE 'post' END
    WHEN xm.stat_unit_key IS NOT NULL THEN 'exempt'
    WHEN public.po_business_days_between(e.detected_on, public.po_today()) < COALESCE(ms.grace_business_days, 5) THEN 'waiting'
    ELSE 'unregistered'
  END AS registration_status
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
LEFT JOIN public.po_change_type_settings oth ON oth.code = 'other'
-- 영업관리팀이 고친 변경 유형 (변경 1건 키 기준, 꺼진 유형이면 자동 판정으로)
LEFT JOIN public.po_change_type_overrides tov ON tov.stat_unit_key = uk.stat_unit_key
LEFT JOIN public.po_change_type_settings tos ON tos.code = tov.type_code AND tos.is_active
-- 요청 연결·예외 처리 (묶음이 반려되면 각 라인이 묶음 연결·처리를 물려받음)
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT l.request_id)::INT AS linked_request_count, MIN(l.request_date) AS first_request_date
  FROM public.request_change_links l
  WHERE l.status = 'linked'
    AND (l.stat_unit_key = uk.stat_unit_key
      OR (e.candidate_group_id IS NOT NULL AND l.stat_unit_key = 'group:' || e.candidate_group_id::TEXT))
) lk ON TRUE
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.po_change_exemptions x
  WHERE x.stat_unit_key = uk.stat_unit_key
     OR (e.candidate_group_id IS NOT NULL AND x.stat_unit_key = 'group:' || e.candidate_group_id::TEXT)
  ORDER BY (x.stat_unit_key = uk.stat_unit_key) DESC
  LIMIT 1
) xm ON TRUE
LEFT JOIN public.po_match_settings ms ON ms.id;

COMMENT ON VIEW public.v_do_change_events IS '변경 이벤트 + 고객처·담당자·변경 사유·요청 출처·품목군·구분(품목 예외 우선)·변경 유형(관리자 설정, 영업관리팀이 고친 유형 우선)·제외 여부·후보 묶음·요청 연결(등록 상태) — 통계는 stat_unit_key 기준으로 셀 것 (후보 묶음·일정/운송방법 묶음은 1건)';


-- ---------------------------------------------------------------------
-- PO 현황 대시보드용 변경 목록 (등록 상태 열 추가)
-- ---------------------------------------------------------------------
/**
 * PO 현황 대시보드용 변경 목록 (변경 1건 = 1행, 조회 범위 적용, 추적 제외 제외)
 * 주문·품목 상세 없이 집계에 필요한 값만 돌려줌
 *   - 영업관리팀·관리자: 전체
 *   - 고객처 계정: 자기 고객처 주문의 변경
 *   - 본사·국내법인 부서: 요청 출처가 자기 부서인 변경 + 추가 조회 권한으로 열린 고객처의 변경
 */
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
  registration_status TEXT,
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
    MIN(v.registration_status),
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


-- ---------------------------------------------------------------------
-- 처리 함수: 요청 ↔ DO 변경 연결
--   후보 조건: SO 번호 같음(필수) + 품목코드 같음(일정·운송방법 변경은 요청 단위라 품목 없어도 됨)
--              + 변경 감지일이 요청일 -days_before ~ +days_after 안
--   일치 정도: 유형(요청구분 = 변경 유형, 고친 유형 기준)·수량(요청 수량 = 변경 수량)
--   자동 연결: 유형·수량까지 모두 맞고, 그 변경의 후보 요청이 하나뿐이며 그 요청 품목의 후보 변경도 하나뿐일 때
--              (반려된 요청·예외 처리한 변경·해제한 짝은 자동 연결하지 않음)
--   연결되면 변경 사유가 비어 있을 때만 요청서의 사유·출처·상세 내용으로 채움 (source = 'request')
-- ---------------------------------------------------------------------

/**
 * 변경 1건의 수량 — 한 방향이면 합계, 분할/합배송처럼 삭제+추가가 섞이면 옮긴 수량(큰 쪽)
 */
CREATE OR REPLACE FUNCTION public.po_unit_qty(p_key TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (CASE
    WHEN COALESCE(SUM(v.qty) FILTER (WHERE v.direction = 'add'), 0) > 0
     AND COALESCE(SUM(v.qty) FILTER (WHERE v.direction = 'delete'), 0) > 0
    THEN GREATEST(SUM(v.qty) FILTER (WHERE v.direction = 'add'), SUM(v.qty) FILTER (WHERE v.direction = 'delete'))
    ELSE SUM(v.qty)
  END)::INT
  FROM public.v_do_change_events v
  WHERE v.stat_unit_key = p_key
$$;

/**
 * 요청 ↔ 변경 후보 전체 (내부용) — 추적 제외·"변경 아님" 변경과 삭제된 요청·SO 없는 요청은 뺌
 * @returns 변경 1건 × 요청 품목(일정·운송방법은 요청 단위, item_key 빈칸)마다 한 행과 일치 정도
 */
CREATE OR REPLACE FUNCTION public.po_match_pairs()
RETURNS TABLE (
  stat_unit_key TEXT,
  request_id UUID,
  item_key TEXT,
  detected_on DATE,
  is_shift BOOLEAN,
  unit_qty INT,
  unit_type_code TEXT,
  unit_is_linked BOOLEAN,
  unit_is_exempt BOOLEAN,
  request_qty INT,
  request_type_code TEXT,
  request_status TEXT,
  type_match BOOLEAN,
  qty_match BOOLEAN,
  is_full BOOLEAN,
  score INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ms AS (
    SELECT COALESCE(MAX(s.days_before), 7) AS days_before, COALESCE(MAX(s.days_after), 45) AS days_after
    FROM public.po_match_settings s
  ),
  ev AS MATERIALIZED (
    SELECT v.stat_unit_key, v.detected_on, v.order_no, v.item_no, v.item_before, v.item_after, v.direction, v.qty,
           v.change_type_code, v.linked_request_count, v.is_exempt
    FROM public.v_do_change_events v
    WHERE NOT v.is_excluded AND NOT v.is_dismissed
  ),
  units AS (
    SELECT
      ev.stat_unit_key,
      MIN(ev.detected_on) AS detected_on,
      ARRAY_AGG(DISTINCT public.po_norm_code(ev.order_no)) AS orders,
      BOOL_AND(ev.direction IN ('date', 'mode')) AS is_shift,
      COALESCE(SUM(ev.qty) FILTER (WHERE ev.direction = 'add'), 0) AS q_add,
      COALESCE(SUM(ev.qty) FILTER (WHERE ev.direction = 'delete'), 0) AS q_del,
      SUM(ev.qty) AS q_all,
      MIN(ev.change_type_code) AS type_code,
      BOOL_OR(ev.linked_request_count > 0) AS is_linked,
      BOOL_OR(ev.is_exempt) AS is_exempt
    FROM ev
    GROUP BY ev.stat_unit_key
  ),
  unit_items AS (
    SELECT ev.stat_unit_key, ARRAY_AGG(DISTINCT it) AS items
    FROM ev
    CROSS JOIN LATERAL unnest(ARRAY[
      public.po_norm_code(ev.item_no), public.po_norm_code(ev.item_before), public.po_norm_code(ev.item_after)
    ]) it
    WHERE it IS NOT NULL
    GROUP BY ev.stat_unit_key
  ),
  u AS (
    SELECT units.*, COALESCE(ui.items, ARRAY[]::TEXT[]) AS items,
      (CASE WHEN units.q_add > 0 AND units.q_del > 0 THEN GREATEST(units.q_add, units.q_del) ELSE units.q_all END)::INT AS qty
    FROM units
    LEFT JOIN unit_items ui ON ui.stat_unit_key = units.stat_unit_key
  ),
  req AS (
    SELECT r.id, r.request_date, r.status, public.po_norm_code(r.so_number) AS so, ts.code AS type_code,
           r.items, r.erp_code, r.item_name, r.quantity
    FROM public.requests r
    LEFT JOIN public.po_change_type_settings ts ON ts.label = r.category_of_request
    WHERE r.deleted_at IS NULL AND public.po_norm_code(r.so_number) IS NOT NULL
  ),
  req_items AS (
    SELECT req.id, ri.item_key, ri.qty
    FROM req
    CROSS JOIN LATERAL public.po_request_items(req.items, req.erp_code, req.item_name, req.quantity) ri
  ),
  pairs AS (
    -- 추가·삭제·품목코드 변경·분할/합배송: 요청 품목마다
    SELECT u.stat_unit_key, req.id AS request_id, ri.item_key, u.detected_on, u.is_shift, u.qty AS unit_qty,
           u.type_code AS unit_type_code, u.is_linked, u.is_exempt, ri.qty AS request_qty, req.type_code AS request_type_code,
           req.status AS request_status, (req.type_code = u.type_code) AS type_match, (ri.qty = u.qty) AS qty_match
    FROM req
    JOIN req_items ri ON ri.id = req.id
    CROSS JOIN ms
    JOIN u ON NOT u.is_shift AND req.so = ANY (u.orders) AND ri.item_key = ANY (u.items)
    WHERE u.detected_on BETWEEN req.request_date - ms.days_before AND req.request_date + ms.days_after
    UNION ALL
    -- 출하일정·운송방법 변경: 요청 단위 (요청에 품목이 있으면 그중 하나는 같아야 함), 수량은 비교하지 않음
    SELECT u.stat_unit_key, req.id, '', u.detected_on, u.is_shift, u.qty, u.type_code, u.is_linked, u.is_exempt,
           NULL::INT, req.type_code, req.status, (req.type_code = u.type_code), NULL::BOOLEAN
    FROM req
    CROSS JOIN ms
    JOIN u ON u.is_shift AND req.so = ANY (u.orders)
    WHERE u.detected_on BETWEEN req.request_date - ms.days_before AND req.request_date + ms.days_after
      AND (
        NOT EXISTS (SELECT 1 FROM req_items ri WHERE ri.id = req.id)
        OR EXISTS (SELECT 1 FROM req_items ri WHERE ri.id = req.id AND ri.item_key = ANY (u.items))
      )
  )
  SELECT
    p.stat_unit_key, p.request_id, p.item_key, p.detected_on, p.is_shift, p.unit_qty, p.unit_type_code,
    p.is_linked, p.is_exempt, p.request_qty, p.request_type_code, p.request_status,
    COALESCE(p.type_match, FALSE),
    p.qty_match,
    (COALESCE(p.type_match, FALSE) AND (p.is_shift OR COALESCE(p.qty_match, FALSE))),
    60 + CASE WHEN p.type_match THEN 25 ELSE 0 END + CASE WHEN p.is_shift OR p.qty_match THEN 15 ELSE 0 END
  FROM pairs p
$$;

/**
 * 요청서 값으로 변경 사유 미리 채우기 (내부용) — 사유가 비어 있을 때만, 사유가 PO 변경 사유 목록에 있고 출처를 알 수 있을 때만
 *   출처: 요청 부서가 요청 부서 목록에 있으면 그 부서, 고객처 계정이면 고객처
 * @returns 채웠으면 TRUE
 */
CREATE OR REPLACE FUNCTION public.po_prefill_request_reason(p_key TEXT, p_request_id UUID, p_by UUID, p_by_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_reason TEXT;
  v_origin_type TEXT;
  v_origin_code TEXT;
  v_note TEXT;
BEGIN
  -- 이미 사유가 있으면(묶음에서 물려받은 사유 포함) 그대로 둠
  IF EXISTS (SELECT 1 FROM public.po_change_reasons WHERE stat_unit_key = p_key)
     OR EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = p_key AND v.reason IS NOT NULL) THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_reason := NULLIF(btrim(r.reason_for_request), '');
  IF v_reason IS NULL THEN
    RETURN FALSE;
  END IF;
  IF to_regclass('public.request_reason_settings') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.request_reason_settings)
     AND NOT EXISTS (SELECT 1 FROM public.request_reason_settings WHERE value = v_reason) THEN
    RETURN FALSE;
  END IF;

  SELECT o.code INTO v_origin_code
  FROM public.po_request_origins o
  WHERE o.department = r.requesting_dept AND o.is_active
  ORDER BY o.sort_order
  LIMIT 1;
  IF v_origin_code IS NOT NULL THEN
    v_origin_type := 'department';
  ELSIF EXISTS (SELECT 1 FROM public.po_customer_accounts a WHERE a.customer_name = r.requesting_dept)
     OR r.requesting_dept = r.customer THEN
    v_origin_type := 'customer';
  ELSE
    RETURN FALSE;
  END IF;

  v_note := format('[요청서 %s · %s] %s',
    to_char(r.request_date, 'YYYY-MM-DD'), r.requester_name,
    COALESCE(NULLIF(btrim(r.request_details), ''), 'SO ' || COALESCE(r.so_number, '-')));

  INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
  VALUES (p_key, v_reason, v_note, v_origin_type, v_origin_code, 'request', p_by, p_by_name, NOW());

  INSERT INTO public.po_change_reason_history (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name)
  VALUES (p_key, v_reason, v_note, v_origin_type, v_origin_code, 'request', p_by, p_by_name);

  RETURN TRUE;
END;
$$;

/**
 * 연결이 모두 풀린 변경의 요청서 사유 지우기 (내부용) — 요청서에서 가져온 채 아무도 고치지 않은 사유만, 이력에 남김
 */
CREATE OR REPLACE FUNCTION public.po_release_request_reason(p_key TEXT, p_by UUID, p_by_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.request_change_links WHERE stat_unit_key = p_key AND status = 'linked') THEN
    RETURN;
  END IF;

  INSERT INTO public.po_change_reason_history (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name)
  SELECT r.stat_unit_key, r.reason, r.note, r.origin_type, r.origin_code, 'cleared', p_by, p_by_name
  FROM public.po_change_reasons r
  WHERE r.stat_unit_key = p_key AND r.source = 'request';

  DELETE FROM public.po_change_reasons WHERE stat_unit_key = p_key AND source = 'request';
END;
$$;

/**
 * 자동 연결 (내부용) — 유형·수량까지 모두 맞고 양쪽 후보가 하나뿐인 짝만 연결하고 사유를 미리 채움
 * 일정·운송방법 변경은 요청 단위라 한 요청이 같은 SO의 여러 변경과 연결될 수 있음
 * @returns 새로 연결한 건수
 */
CREATE OR REPLACE FUNCTION public.po_run_auto_link(p_by UUID, p_by_name TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_id UUID;
  v_count INT := 0;
BEGIN
  FOR r IN
    WITH e AS (
      SELECT p.*
      FROM public.po_match_pairs() p
      WHERE p.is_full
        AND p.request_status <> 'rejected'
        AND NOT p.unit_is_linked
        AND NOT p.unit_is_exempt
        -- 해제한 짝은 다시 연결하지 않음
        AND NOT EXISTS (
          SELECT 1 FROM public.request_change_links l
          WHERE l.request_id = p.request_id AND l.item_key = p.item_key AND l.stat_unit_key = p.stat_unit_key
        )
        -- 이미 연결된 요청 품목은 그대로 (요청 단위 연결은 여러 변경 가능)
        AND (p.item_key = '' OR NOT EXISTS (
          SELECT 1 FROM public.request_change_links l
          WHERE l.request_id = p.request_id AND l.item_key = p.item_key AND l.status = 'linked'
        ))
    )
    SELECT e.stat_unit_key, e.request_id, e.item_key, rq.request_date
    FROM e
    JOIN public.requests rq ON rq.id = e.request_id
    WHERE (SELECT COUNT(*) FROM e x WHERE x.stat_unit_key = e.stat_unit_key) = 1
      AND (e.item_key = '' OR (SELECT COUNT(*) FROM e x WHERE x.request_id = e.request_id AND x.item_key = e.item_key) = 1)
  LOOP
    INSERT INTO public.request_change_links (request_id, item_key, stat_unit_key, request_date, link_type, status, note, linked_by, linked_by_name)
    VALUES (r.request_id, r.item_key, r.stat_unit_key, r.request_date, 'auto', 'linked', 'SO·품목·유형·수량 일치', p_by, p_by_name)
    ON CONFLICT (request_id, item_key, stat_unit_key) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      INSERT INTO public.request_change_link_history (link_id, request_id, item_key, stat_unit_key, action, link_type, note, acted_by, acted_by_name)
      VALUES (v_id, r.request_id, r.item_key, r.stat_unit_key, 'linked', 'auto', 'SO·품목·유형·수량 일치', p_by, p_by_name);
      PERFORM public.po_prefill_request_reason(r.stat_unit_key, r.request_id, p_by, p_by_name);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

/**
 * 요청의 연결을 모두 해제 (내부용) — 요청 삭제 시. 요청서에서 가져온 사유도 지움
 */
CREATE OR REPLACE FUNCTION public.po_release_request_links(p_request_id UUID, p_note TEXT, p_by UUID, p_by_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  l RECORD;
BEGIN
  FOR l IN
    UPDATE public.request_change_links
    SET status = 'unlinked', unlinked_by = p_by, unlinked_by_name = p_by_name, unlinked_at = NOW(), note = p_note
    WHERE request_id = p_request_id AND status = 'linked'
    RETURNING *
  LOOP
    INSERT INTO public.request_change_link_history (link_id, request_id, item_key, stat_unit_key, action, link_type, note, acted_by, acted_by_name)
    VALUES (l.id, l.request_id, l.item_key, l.stat_unit_key, 'unlinked', l.link_type, p_note, p_by, p_by_name);
    PERFORM public.po_release_request_reason(l.stat_unit_key, p_by, p_by_name);
  END LOOP;
END;
$$;

/**
 * 다시 매칭 (영업관리팀 버튼) — 자동 연결 조건에 맞는 짝을 찾아 연결
 * @returns 새로 연결한 건수
 */
CREATE OR REPLACE FUNCTION public.rematch_change_requests()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;
  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();
  RETURN public.po_run_auto_link(auth.uid(), v_name);
END;
$$;

/**
 * 요청과 변경 연결 (영업관리팀) — 후보에서 골라 확정. 해제했던 짝도 다시 연결 가능. 사유가 비어 있으면 요청서로 채움
 * @param p_key 변경 1건 키 (v_do_change_events.stat_unit_key)
 * @param p_request_id 요청 ID
 * @param p_item_key 요청 품목코드 (요청 단위 연결이면 NULL·빈칸)
 * @param p_note 메모 (선택)
 * @returns 연결 ID
 */
CREATE OR REPLACE FUNCTION public.link_change_request(p_key TEXT, p_request_id UUID, p_item_key TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_item TEXT := COALESCE(public.po_norm_code(p_item_key), '');
  v_note TEXT := NULLIF(btrim(p_note), '');
  v_date DATE;
  v_id UUID;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = p_key) THEN
    RAISE EXCEPTION '찾을 수 없는 변경입니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;
  SELECT request_date INTO v_date FROM public.requests WHERE id = p_request_id AND deleted_at IS NULL;
  IF v_date IS NULL THEN
    RAISE EXCEPTION '요청을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.request_change_links (request_id, item_key, stat_unit_key, request_date, link_type, status, note, linked_by, linked_by_name)
  VALUES (p_request_id, v_item, p_key, v_date, 'manual', 'linked', v_note, auth.uid(), v_name)
  ON CONFLICT (request_id, item_key, stat_unit_key) DO UPDATE SET
    status = 'linked', link_type = 'manual', note = EXCLUDED.note, request_date = EXCLUDED.request_date,
    linked_by = EXCLUDED.linked_by, linked_by_name = EXCLUDED.linked_by_name, linked_at = NOW(),
    unlinked_by = NULL, unlinked_by_name = NULL, unlinked_at = NULL
  RETURNING id INTO v_id;

  INSERT INTO public.request_change_link_history (link_id, request_id, item_key, stat_unit_key, action, link_type, note, acted_by, acted_by_name)
  VALUES (v_id, p_request_id, v_item, p_key, 'linked', 'manual', v_note, auth.uid(), v_name);

  PERFORM public.po_prefill_request_reason(p_key, p_request_id, auth.uid(), v_name);
  RETURN v_id;
END;
$$;

/**
 * 연결 해제 (영업관리팀) — 메모 필수. 연결이 모두 풀리면 요청서에서 가져온 채 고치지 않은 사유도 지움
 * @param p_link_id 연결 ID (request_change_links.id)
 * @param p_note 해제 이유 (필수)
 */
CREATE OR REPLACE FUNCTION public.unlink_change_request(p_link_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_note TEXT := NULLIF(btrim(p_note), '');
  l public.request_change_links;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION '연결을 해제하는 이유를 메모로 입력해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  UPDATE public.request_change_links
  SET status = 'unlinked', note = v_note, unlinked_by = auth.uid(), unlinked_by_name = v_name, unlinked_at = NOW()
  WHERE id = p_link_id AND status = 'linked'
  RETURNING * INTO l;
  IF l.id IS NULL THEN
    RAISE EXCEPTION '연결을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.request_change_link_history (link_id, request_id, item_key, stat_unit_key, action, link_type, note, acted_by, acted_by_name)
  VALUES (l.id, l.request_id, l.item_key, l.stat_unit_key, 'unlinked', l.link_type, v_note, auth.uid(), v_name);

  PERFORM public.po_release_request_reason(l.stat_unit_key, auth.uid(), v_name);
END;
$$;

/**
 * 예외 처리 (여러 건 한 번에) — 변경은 맞지만 요청서가 필요 없었던 건을 미등록에서 뺌
 * @param p_keys 변경 1건 키 목록
 * @param p_note 요청이 필요 없었던 이유 (필수)
 * @returns 처리한 건수
 */
CREATE OR REPLACE FUNCTION public.set_change_exemptions(p_keys TEXT[], p_note TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(p_note), '');
  v_name TEXT;
  v_keys TEXT[];
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION '요청서가 필요 없었던 이유를 메모로 입력해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT ARRAY_AGG(DISTINCT k) INTO v_keys FROM unnest(p_keys) k WHERE NULLIF(btrim(k), '') IS NOT NULL;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION '처리할 변경을 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_keys) k WHERE NOT EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = k)) THEN
    RAISE EXCEPTION '찾을 수 없는 변경이 있습니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.po_change_exemptions (stat_unit_key, note, exempted_by, exempted_by_name, exempted_at)
  SELECT k, v_note, auth.uid(), v_name, NOW() FROM unnest(v_keys) k
  ON CONFLICT (stat_unit_key) DO UPDATE SET
    note = EXCLUDED.note,
    exempted_by = EXCLUDED.exempted_by,
    exempted_by_name = EXCLUDED.exempted_by_name,
    exempted_at = EXCLUDED.exempted_at;

  INSERT INTO public.po_change_exemption_history (stat_unit_key, action, note, acted_by, acted_by_name)
  SELECT k, 'exempted', v_note, auth.uid(), v_name FROM unnest(v_keys) k;

  RETURN array_length(v_keys, 1);
END;
$$;

/**
 * 예외 처리 해제 — 다시 확인 대기·미등록으로
 * @returns 해제한 건수
 */
CREATE OR REPLACE FUNCTION public.clear_change_exemptions(p_keys TEXT[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_count INT;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.po_change_exemption_history (stat_unit_key, action, note, acted_by, acted_by_name)
  SELECT x.stat_unit_key, 'restored', x.note, auth.uid(), v_name
  FROM public.po_change_exemptions x WHERE x.stat_unit_key = ANY(p_keys);

  DELETE FROM public.po_change_exemptions WHERE stat_unit_key = ANY(p_keys);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

/**
 * 기간 안 변경의 연결 후보 (영업관리팀) — 이미 연결된 짝은 빼고, 해제했던 짝은 표시
 * @returns 후보마다 일치 정도와 요청 요약 (영업관리팀은 요청 원본을 못 읽을 수 있어 함께 돌려줌)
 */
CREATE OR REPLACE FUNCTION public.po_match_candidates(p_from DATE, p_to DATE)
RETURNS TABLE (
  stat_unit_key TEXT,
  request_id UUID,
  item_key TEXT,
  item_name TEXT,
  type_match BOOLEAN,
  qty_match BOOLEAN,
  is_full BOOLEAN,
  score INT,
  unit_qty INT,
  request_qty INT,
  was_unlinked BOOLEAN,
  request_date DATE,
  requester_name TEXT,
  requesting_dept TEXT,
  customer TEXT,
  so_number TEXT,
  category_of_request TEXT,
  reason_for_request TEXT,
  request_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '조회 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.stat_unit_key, p.request_id, p.item_key,
    (SELECT ri.item_name FROM public.po_request_items(rq.items, rq.erp_code, rq.item_name, rq.quantity) ri WHERE ri.item_key = p.item_key LIMIT 1),
    p.type_match, p.qty_match, p.is_full, p.score, p.unit_qty, p.request_qty,
    EXISTS (SELECT 1 FROM public.request_change_links l
            WHERE l.request_id = p.request_id AND l.item_key = p.item_key AND l.stat_unit_key = p.stat_unit_key AND l.status = 'unlinked'),
    rq.request_date, rq.requester_name, rq.requesting_dept, rq.customer, rq.so_number, rq.category_of_request,
    rq.reason_for_request, rq.status
  FROM public.po_match_pairs() p
  JOIN public.requests rq ON rq.id = p.request_id
  WHERE p.detected_on BETWEEN p_from AND p_to
    AND NOT EXISTS (SELECT 1 FROM public.request_change_links l
                    WHERE l.request_id = p.request_id AND l.item_key = p.item_key AND l.stat_unit_key = p.stat_unit_key AND l.status = 'linked');
END;
$$;

/**
 * 기간 안 변경에 연결된 요청 (영업관리팀) — 묶음이 반려되면 각 라인에 묶음 연결을 함께 보여 줌
 * @returns unit_key(화면의 변경 1건 키)별 연결과 요청 요약
 */
CREATE OR REPLACE FUNCTION public.po_change_links(p_from DATE, p_to DATE)
RETURNS TABLE (
  unit_key TEXT,
  link_id UUID,
  link_key TEXT,
  request_id UUID,
  item_key TEXT,
  item_name TEXT,
  link_type TEXT,
  note TEXT,
  linked_by_name TEXT,
  linked_at TIMESTAMPTZ,
  unit_qty INT,
  request_qty INT,
  request_date DATE,
  requester_name TEXT,
  requesting_dept TEXT,
  customer TEXT,
  so_number TEXT,
  category_of_request TEXT,
  reason_for_request TEXT,
  request_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '조회 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH units AS (
    SELECT DISTINCT v.stat_unit_key, v.candidate_group_id
    FROM public.v_do_change_events v
    WHERE v.detected_on BETWEEN p_from AND p_to
  )
  SELECT DISTINCT ON (u.stat_unit_key, l.id)
    u.stat_unit_key, l.id, l.stat_unit_key, l.request_id, l.item_key, ri.item_name, l.link_type, l.note,
    l.linked_by_name, l.linked_at, public.po_unit_qty(u.stat_unit_key), ri.qty,
    rq.request_date, rq.requester_name, rq.requesting_dept, rq.customer, rq.so_number, rq.category_of_request,
    rq.reason_for_request, rq.status
  FROM units u
  JOIN public.request_change_links l
    ON l.status = 'linked'
   AND (l.stat_unit_key = u.stat_unit_key
     OR (u.candidate_group_id IS NOT NULL AND l.stat_unit_key = 'group:' || u.candidate_group_id::TEXT))
  JOIN public.requests rq ON rq.id = l.request_id
  LEFT JOIN LATERAL (
    SELECT x.item_name, x.qty FROM public.po_request_items(rq.items, rq.erp_code, rq.item_name, rq.quantity) x
    WHERE x.item_key = l.item_key LIMIT 1
  ) ri ON TRUE
  ORDER BY u.stat_unit_key, l.id;
END;
$$;

/**
 * 미반영 요청 (영업관리팀) — 승인·완료됐고 SO가 있는데, 확정 출하일(없으면 희망·현재 출하일)이 지나도록 연결된 변경이 없는 요청
 */
CREATE OR REPLACE FUNCTION public.po_unreflected_requests()
RETURNS TABLE (
  id UUID,
  request_date DATE,
  requester_name TEXT,
  requesting_dept TEXT,
  customer TEXT,
  so_number TEXT,
  category_of_request TEXT,
  reason_for_request TEXT,
  status TEXT,
  due_date DATE,
  items TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '조회 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.request_date, r.requester_name, r.requesting_dept, r.customer, r.so_number, r.category_of_request,
    r.reason_for_request, r.status,
    COALESCE(r.confirmed_shipment_date, r.desired_shipment_date, r.factory_shipment_date),
    (SELECT string_agg(COALESCE(ri.item_name, ri.item_key) || COALESCE(' ' || ri.qty, ''), ', ')
     FROM public.po_request_items(r.items, r.erp_code, r.item_name, r.quantity) ri)
  FROM public.requests r
  WHERE r.deleted_at IS NULL
    AND r.status IN ('approved', 'completed')
    AND public.po_norm_code(r.so_number) IS NOT NULL
    AND COALESCE(r.confirmed_shipment_date, r.desired_shipment_date, r.factory_shipment_date) < public.po_today()
    AND NOT EXISTS (SELECT 1 FROM public.request_change_links l WHERE l.request_id = r.id AND l.status = 'linked')
  ORDER BY 10, r.request_date;
END;
$$;

/**
 * 요청별 DO 반영 상태 — 요청 화면용. 본인이 볼 수 있는 요청만 (요청 RLS와 같은 기준: 본인 요청, 검토자·관리자, 영업관리팀)
 * @returns reflection: no_so(SO 없음) / none(연결 없음) / partial(부분 반영: 연결 안 된 품목이 있거나 수량 다름) / reflected(반영됨)
 */
CREATE OR REPLACE FUNCTION public.po_request_reflections(p_ids UUID[])
RETURNS TABLE (request_id UUID, reflection TEXT, linked_unit_count INT, reflected_on DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_all BOOLEAN;
BEGIN
  SELECT public.po_is_sales_team() OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid() AND (p.role LIKE '%reviewer%' OR p.role LIKE '%admin%')
  ) INTO v_all;

  RETURN QUERY
  WITH rq AS (
    SELECT r.* FROM public.requests r
    WHERE r.id = ANY (p_ids) AND r.deleted_at IS NULL AND (v_all OR r.requester_id = auth.uid())
  ),
  lk AS (
    SELECT l.request_id, l.item_key, l.stat_unit_key, public.po_unit_qty(l.stat_unit_key) AS unit_qty,
      (SELECT MIN(v.detected_on) FROM public.v_do_change_events v WHERE v.stat_unit_key = l.stat_unit_key) AS detected_on
    FROM public.request_change_links l
    WHERE l.request_id IN (SELECT rq.id FROM rq) AND l.status = 'linked'
  )
  SELECT rq.id,
    CASE
      WHEN public.po_norm_code(rq.so_number) IS NULL THEN 'no_so'
      WHEN NOT EXISTS (SELECT 1 FROM lk WHERE lk.request_id = rq.id) THEN 'none'
      -- 요청 단위 연결(일정·운송방법)만 있으면 반영됨
      WHEN NOT EXISTS (SELECT 1 FROM lk WHERE lk.request_id = rq.id AND lk.item_key <> '') THEN 'reflected'
      WHEN EXISTS (
        SELECT 1 FROM public.po_request_items(rq.items, rq.erp_code, rq.item_name, rq.quantity) ri
        WHERE NOT EXISTS (SELECT 1 FROM lk WHERE lk.request_id = rq.id AND lk.item_key = ri.item_key)
           OR (ri.qty IS NOT NULL AND ri.qty <> (SELECT SUM(lk.unit_qty) FROM lk WHERE lk.request_id = rq.id AND lk.item_key = ri.item_key))
      ) THEN 'partial'
      ELSE 'reflected'
    END,
    (SELECT COUNT(DISTINCT lk.stat_unit_key)::INT FROM lk WHERE lk.request_id = rq.id),
    (SELECT MAX(lk.detected_on) FROM lk WHERE lk.request_id = rq.id)
  FROM rq;
END;
$$;

/**
 * 요청 등록·수정 후 연결 갱신 (트리거) — 삭제되면 연결 해제, 요청일이 바뀌면 연결의 요청일 갱신, 그 뒤 자동 연결
 * 연결이 실패해도 요청 저장은 막지 않음 (경고만 남김)
 */
CREATE OR REPLACE FUNCTION public.po_requests_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      PERFORM public.po_release_request_links(NEW.id, '요청 삭제', NULL, '요청 삭제');
    ELSE
      IF TG_OP = 'UPDATE' AND NEW.request_date IS DISTINCT FROM OLD.request_date THEN
        UPDATE public.request_change_links SET request_date = NEW.request_date WHERE request_id = NEW.id;
      END IF;
      IF NEW.deleted_at IS NULL THEN
        PERFORM public.po_run_auto_link(NULL, '자동 연결');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '요청-DO 변경 자동 연결 실패: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

/**
 * 요청을 지우기 전 연결 해제 (트리거) — 요청서에서 가져온 사유도 지움
 */
CREATE OR REPLACE FUNCTION public.po_requests_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.po_release_request_links(OLD.id, '요청 삭제', NULL, '요청 삭제');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '요청-DO 변경 연결 해제 실패: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

/**
 * DO 업로드가 끝나면 자동 연결 (트리거) — 실패해도 업로드는 막지 않음
 */
CREATE OR REPLACE FUNCTION public.po_uploads_after_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.po_run_auto_link(NULL, '자동 연결');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '요청-DO 변경 자동 연결 실패: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS po_requests_match_after_insert ON public.requests;
CREATE TRIGGER po_requests_match_after_insert
  AFTER INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.po_requests_after_change();

DROP TRIGGER IF EXISTS po_requests_match_after_update ON public.requests;
CREATE TRIGGER po_requests_match_after_update
  AFTER UPDATE OF so_number, items, erp_code, quantity, status, category_of_request, request_date, deleted_at ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.po_requests_after_change();

DROP TRIGGER IF EXISTS po_requests_match_before_delete ON public.requests;
CREATE TRIGGER po_requests_match_before_delete
  BEFORE DELETE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.po_requests_before_delete();

DROP TRIGGER IF EXISTS po_uploads_auto_link ON public.po_source_uploads;
CREATE TRIGGER po_uploads_auto_link
  AFTER UPDATE OF status ON public.po_source_uploads
  FOR EACH ROW
  WHEN (NEW.kind = 'do' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.po_uploads_after_complete();


-- ---------------------------------------------------------------------
-- 함수 실행 권한
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.po_dashboard_changes(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_dashboard_changes(DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.po_unit_qty(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_match_pairs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_prefill_request_reason(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_release_request_reason(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_run_auto_link(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_release_request_links(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rematch_change_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_change_request(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_change_request(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_change_exemptions(TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_change_exemptions(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_match_candidates(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_change_links(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_unreflected_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_request_reflections(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rematch_change_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_change_request(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_change_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_change_exemptions(TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_change_exemptions(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_match_candidates(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_change_links(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_unreflected_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_request_reflections(UUID[]) TO authenticated;
