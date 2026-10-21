-- =====================================================================
-- PO Tracker: 판정 보완 2차 + "변경 아님(정정)" 처리 + 10/13~ 소급 (2026-10-21)
--
-- 변경 내용
--   1) 운송방법(납품 모드)은 값이 다른 값으로 바뀔 때만 변경 — 빈칸 → 값 입력은 변경 아님
--      (코르트 공장 물량은 운송방법을 비워 두었다가 나중에 채움)
--   2) 이번 업로드에서 출하 완료(미종료 → 종료)되는 라인의 요청 배송일 갱신은 기록하지 않음
--      (출하 처리 때의 정보 정리. 예: krtPO000001122 10/26→10/22). 출하 부족은 그대로.
--      운송방법이 실제로 다른 값으로 바뀐 것은 출하 시점이어도 기록 (예: SO000100224 DHL→Fedex)
--   3) 같은 날 한 주문의 라인이 모두 삭제(주문 취소)되면 주문 단위 1건 (예: 철원군청 SO000102237 3건 → 1건)
--   4) "변경 아님(정정)" 처리: po_change_dismissals / dismiss_changes() / restore_changes() — 영업관리팀이
--      오입력 정정 등을 표시하면 변경 건수·통계·사유 입력 대상에서 빠짐 (메모 필수, 처리자·이력 저장)
--
-- 소급: 이미 기록된 이벤트 중 1)·2)에 해당하는 운송방법·일정 변경을 지우고, 주문 단위로 묶이는 삭제의
--       기존 사유를 새 키로 옮긴 뒤 업로드 요약을 다시 계산
--
-- 선행: update_po_tracker_view_scope.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. "변경 아님" 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_change_dismissals (
  stat_unit_key TEXT PRIMARY KEY,
  note TEXT NOT NULL CHECK (btrim(note) <> ''),
  dismissed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  dismissed_by_name TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.po_change_dismissals IS '"변경 아님(정정)" 처리 — 오입력 정정 등 실제 변경이 아닌 건. 변경 건수·통계·사유 입력 대상에서 빠짐. dismiss_changes()로만 기록';

CREATE TABLE IF NOT EXISTS public.po_change_dismissal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_unit_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'restored')),
  note TEXT,
  acted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  acted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_change_dismissal_history_key_idx ON public.po_change_dismissal_history (stat_unit_key, created_at);

COMMENT ON TABLE public.po_change_dismissal_history IS '"변경 아님" 처리·해제 이력';

ALTER TABLE public.po_change_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_dismissal_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sales team can view po_change_dismissals" ON public.po_change_dismissals;
CREATE POLICY "Sales team can view po_change_dismissals" ON public.po_change_dismissals
  FOR SELECT USING (public.po_is_sales_team());
DROP POLICY IF EXISTS "Sales team can view po_change_dismissal_history" ON public.po_change_dismissal_history;
CREATE POLICY "Sales team can view po_change_dismissal_history" ON public.po_change_dismissal_history
  FOR SELECT USING (public.po_is_sales_team());


-- ---------------------------------------------------------------------
-- 2. 조회용 뷰 (주문 전체 삭제 1건, 변경 아님 열)
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
  rr.set_at AS reason_set_at,
  -- "변경 아님(정정)" 처리 — 통계·사유 입력 대상에서 빠짐 (묶음이 반려되면 묶음 처리를 물려받음)
  (dm.stat_unit_key IS NOT NULL) AS is_dismissed,
  dm.note AS dismiss_note,
  dm.dismissed_by_name,
  dm.dismissed_at
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
-- 3. 판정·대시보드 함수
-- ---------------------------------------------------------------------
/**
 * 같은 주문·같은 품목의 삭제와 추가를 차이만큼으로 정리 (apply_do_snapshot 내부 전용, 분할 후보 묶기 전에 실행)
 *
 * 같은 업로드에서 한 주문의 같은 품목이 삭제(라인 삭제·수량 감소)되고 추가(라인 추가·수량 증가)되면
 * DO 라인 번호만 바뀌어 다시 등록된 것으로 보고 차이만 남긴다.
 *   - 삭제 합계 > 추가 합계: 가장 큰 삭제 이벤트 하나를 수량 감소(차이)로 남김
 *   - 추가 합계 > 삭제 합계: 가장 큰 추가 이벤트 하나를 수량 증가(차이)로 남김
 *   - 같으면: 변경 아님 (이벤트 모두 삭제)
 * 옮겨 간 수량의 요청 배송일·납품 모드가 달라졌으면 그만큼 일정·운송방법 변경 이벤트를 남긴다.
 * 이미 후보 묶음에 들어간 이벤트와 출하 부족은 건드리지 않는다. 반환값: 정리한 (주문, 품목) 수
 */
CREATE OR REPLACE FUNCTION public.po_net_same_item_changes(p_upload_id UUID)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date DATE;
  v_count INT := 0;
  v_net INT;
  v_keep UUID;
  v_ref RECORD;
  v_shift RECORD;
  v_date_before JSONB;
  v_date_after JSONB;
  v_mode_before JSONB;
  v_mode_after JSONB;
  r RECORD;
BEGIN
  SELECT snapshot_date INTO v_date FROM public.po_source_uploads WHERE id = p_upload_id;

  FOR r IN
    SELECT
      e.order_no,
      e.item_no,
      COALESCE(SUM(e.qty) FILTER (WHERE e.direction = 'delete'), 0)::INT AS d_qty,
      COALESCE(SUM(e.qty) FILTER (WHERE e.direction = 'add'), 0)::INT AS a_qty,
      ARRAY_AGG(e.id) AS ids,
      ARRAY_AGG(e.line_no ORDER BY e.line_no) FILTER (WHERE e.direction = 'delete') AS d_lines,
      ARRAY_AGG(e.line_no ORDER BY e.line_no) FILTER (WHERE e.direction = 'add') AS a_lines
    FROM public.do_change_events e
    WHERE e.upload_id = p_upload_id
      AND e.candidate_group_id IS NULL
      AND e.change_type IN ('line_removed', 'qty_decreased', 'line_added', 'qty_increased')
      AND e.item_no IS NOT NULL
    GROUP BY e.order_no, e.item_no
    HAVING BOOL_OR(e.direction = 'delete') AND BOOL_OR(e.direction = 'add')
  LOOP
    -- 옮겨 간 수량의 대표 배송일·납품 모드: 삭제 쪽은 이번에 빠진 행 포함, 추가 쪽은 현재 행 기준
    WITH ev AS (
      SELECT e.line_no, e.direction, e.qty
      FROM public.do_change_events e
      WHERE e.id = ANY(r.ids)
    ),
    dom AS (
      SELECT
        ev.direction,
        ev.qty,
        (SELECT COALESCE(to_char(d.requested_delivery_date, 'YYYY-MM-DD'), '(없음)')
           FROM public.do_lines d
          WHERE d.order_no = r.order_no AND d.line_no = ev.line_no
            AND (d.removed_upload_id IS NULL OR (ev.direction = 'delete' AND d.removed_upload_id = p_upload_id))
          ORDER BY d.ordered_qty DESC, d.do_no LIMIT 1) AS dt,
        (SELECT COALESCE(d.delivery_mode, '(없음)')
           FROM public.do_lines d
          WHERE d.order_no = r.order_no AND d.line_no = ev.line_no
            AND (d.removed_upload_id IS NULL OR (ev.direction = 'delete' AND d.removed_upload_id = p_upload_id))
          ORDER BY d.ordered_qty DESC, d.do_no LIMIT 1) AS md
      FROM ev
    )
    SELECT
      COALESCE((SELECT jsonb_object_agg(dt, q) FROM (SELECT dt, SUM(qty) q FROM dom WHERE direction = 'delete' AND dt IS NOT NULL GROUP BY dt) x), '{}'),
      COALESCE((SELECT jsonb_object_agg(dt, q) FROM (SELECT dt, SUM(qty) q FROM dom WHERE direction = 'add' AND dt IS NOT NULL GROUP BY dt) x), '{}'),
      COALESCE((SELECT jsonb_object_agg(md, q) FROM (SELECT md, SUM(qty) q FROM dom WHERE direction = 'delete' AND md IS NOT NULL GROUP BY md) x), '{}'),
      COALESCE((SELECT jsonb_object_agg(md, q) FROM (SELECT md, SUM(qty) q FROM dom WHERE direction = 'add' AND md IS NOT NULL GROUP BY md) x), '{}')
    INTO v_date_before, v_date_after, v_mode_before, v_mode_after;

    v_net := r.a_qty - r.d_qty;
    v_keep := NULL;

    -- 남길 이벤트: 차이 방향에서 수량이 가장 큰 것
    IF v_net <> 0 THEN
      SELECT e.id INTO v_keep
      FROM public.do_change_events e
      WHERE e.id = ANY(r.ids) AND e.direction = CASE WHEN v_net > 0 THEN 'add' ELSE 'delete' END
      ORDER BY e.qty DESC, e.line_no
      LIMIT 1;
    END IF;

    -- 일정·운송방법 변경을 붙일 기준 라인 (남긴 이벤트, 없으면 가장 큰 추가 라인)
    SELECT e.line_no, e.do_no, e.item_name, e.is_transfer INTO v_ref
    FROM public.do_change_events e
    WHERE e.id = COALESCE(v_keep, (
      SELECT x.id FROM public.do_change_events x
      WHERE x.id = ANY(r.ids) AND x.direction = 'add'
      ORDER BY x.qty DESC, x.line_no LIMIT 1
    ));

    DELETE FROM public.do_change_events
    WHERE id = ANY(r.ids) AND id IS DISTINCT FROM v_keep;

    IF v_keep IS NOT NULL THEN
      UPDATE public.do_change_events
      SET
        change_type = CASE WHEN v_net > 0 THEN 'qty_increased' ELSE 'qty_decreased' END,
        qty = ABS(v_net),
        qty_before = r.d_qty,
        qty_after = r.a_qty,
        detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
          'netted', TRUE, 'removed_lines', r.d_lines, 'added_lines', r.a_lines
        )
      WHERE id = v_keep;
    END IF;

    SELECT * INTO v_shift FROM public.po_dist_shift(v_date_before, v_date_after);
    IF v_shift.moved > 0 THEN
      PERFORM public.po_insert_change_event(
        p_upload_id, v_date, r.order_no, v_ref.line_no, v_ref.do_no, r.item_no, v_ref.item_name, v_ref.is_transfer,
        'delivery_date_changed', v_shift.moved,
        p_date_before => NULLIF(v_shift.from_key, '(없음)')::DATE,
        p_date_after => NULLIF(v_shift.to_key, '(없음)')::DATE,
        p_detail => jsonb_build_object('netted', TRUE, 'before', v_date_before, 'after', v_date_after)
      );
    END IF;

    SELECT * INTO v_shift FROM public.po_dist_shift(v_mode_before - '(없음)', v_mode_after - '(없음)');
    IF v_shift.moved > 0 THEN
      PERFORM public.po_insert_change_event(
        p_upload_id, v_date, r.order_no, v_ref.line_no, v_ref.do_no, r.item_no, v_ref.item_name, v_ref.is_transfer,
        'delivery_mode_changed', v_shift.moved,
        p_mode_before => NULLIF(v_shift.from_key, '(없음)'),
        p_mode_after => NULLIF(v_shift.to_key, '(없음)'),
        p_detail => jsonb_build_object('netted', TRUE, 'before', v_mode_before, 'after', v_mode_after)
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

/**
 * DO등록현황조회 반영 — stage_po_upload_chunk()로 적재한 행을 직전 확정 상태와 비교해 변경 이벤트 생성
 *
 * 적재 행 형식: [{ord, ln, dn, tr, mode, hs, ls, wo, wi, sd, rd, qd, item, nm, q_ord, q_reg, q_shp, scf, lcf, closed}]
 *   ord=주문 번호, ln=라인번호(소수 그대로), dn=배송오더 번호, tr=참조가 이전(Transfer)인지,
 *   mode=납품 모드, hs/ls=H_Status/L_Status, wo/wi=출고/입고 창고, sd/rd/qd=선적/입고/요청받은 배송 일자(YYYY-MM-DD),
 *   q_ord/q_reg/q_shp=이전/등록/선적된 수량, scf/lcf=영업/물류 확정, closed=종료
 *
 * 판정 규칙
 *   - 판매주문 라인(주문번호+라인번호) 단위로 DO를 합산해 비교 → DO 분할·재배정은 합계가 같으면 변경 아님
 *   - 처음 보는 주문번호: 신규 PO (이벤트 없음, 요약에 신규 주문 수)
 *   - 기존 주문의 새 라인: 판매주문조회와 관계없이 라인 추가 (DO 수량 변화는 그대로 변경으로 기록)
 *   - 라인이 남아 있고 수량만 감소: 바로 삭제(수량 감소)
 *   - 라인이 DO에서 사라짐: 판매주문조회에 취소되지 않은 미출고 수량이 남아 있으면 DO 재등록 대기,
 *     5회 업로드(5영업일) 안에 돌아오지 않으면 그때 삭제 확정. SO에서도 취소됐으면 바로 확정
 *   - 같은 주문·같은 품목의 삭제+추가는 차이만 남김, 같으면 변경 아님 (po_net_same_item_changes)
 *   - 같은 날·같은 고객처·같은 품목의 삭제+추가는 분할/합배송 후보로 묶음 (po_group_split_candidates),
 *     주문을 공유하는 후보는 한 묶음 (po_merge_split_groups)
 *   - 통계: 같은 날·같은 주문·같은 DO의 같은 일정·운송방법 변경은 1건 (v_do_change_events.stat_unit_key)
 *   - 요청받은 배송 일자·납품 모드: 값이 바뀐 수량만큼 변경 이벤트 (납품 모드는 빈칸 → 값 입력 제외,
 *     이번에 출하 완료되는 라인의 요청 배송일 갱신은 출하 처리 때의 정리로 보고 제외)
 *   - 미종료 → 종료 전환 시 등록 수량 < 이전 수량이면 차이만큼 출하 부족(삭제)
 *   - 이미 종료된 라인이 파일에서 빠지면 조회 범위 이탈로 보고 변경 아님
 */
CREATE OR REPLACE FUNCTION public.apply_do_snapshot(
  p_upload_id UUID,
  p_row_count INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_wait_uploads CONSTANT INT := 5;
  v_up public.po_source_uploads;
  v_baseline BOOLEAN;
  v_so_date DATE;
  v_date DATE;
  v_new_orders INT := 0;
  v_missing INT;
  v_so_ok BOOLEAN;
  v_do TEXT;
  v_match UUID;
  v_group UUID;
  v_summary JSONB;
  r RECORD;
  v_shift RECORD;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_up FROM public.po_source_uploads WHERE id = p_upload_id FOR UPDATE;
  IF v_up.id IS NULL OR v_up.kind <> 'do' OR v_up.status <> 'processing' THEN
    RAISE EXCEPTION '처리할 수 없는 업로드입니다. (DO 업로드가 아니거나 이미 처리됨)';
  END IF;

  v_date := v_up.snapshot_date;
  v_baseline := NOT EXISTS (
    SELECT 1 FROM public.po_source_uploads WHERE kind = 'do' AND status = 'completed'
  );
  SELECT MAX(snapshot_date) INTO v_so_date
  FROM public.po_source_uploads
  WHERE kind = 'sales_order' AND status = 'completed' AND snapshot_date <= v_date;

  -- 1) 입력 적재: 주문번호+라인번호+배송오더번호 기준 합산 (중복 소수 라인)
  DROP TABLE IF EXISTS t_rows;
  CREATE TEMP TABLE t_rows ON COMMIT DROP AS
  SELECT
    x.ord AS order_no,
    x.ln AS line_no,
    x.dn AS do_no,
    BOOL_OR(COALESCE(x.tr, FALSE)) AS is_transfer,
    (ARRAY_AGG(x.mode))[1] AS delivery_mode,
    (ARRAY_AGG(x.hs))[1] AS header_status,
    (ARRAY_AGG(x.ls))[1] AS line_status,
    (ARRAY_AGG(x.wo))[1] AS ship_warehouse,
    (ARRAY_AGG(x.wi))[1] AS receive_warehouse,
    (ARRAY_AGG(x.sd))[1] AS ship_date,
    (ARRAY_AGG(x.rd))[1] AS receive_date,
    (ARRAY_AGG(x.qd))[1] AS requested_delivery_date,
    (ARRAY_AGG(x.item))[1] AS item_no,
    (ARRAY_AGG(x.nm))[1] AS item_name,
    COALESCE(SUM(x.q_ord), 0)::INT AS ordered_qty,
    COALESCE(SUM(x.q_reg), 0)::INT AS registered_qty,
    COALESCE(SUM(x.q_shp), 0)::INT AS shipped_qty,
    BOOL_AND(x.scf) AS sales_confirmed,
    BOOL_AND(x.lcf) AS logistics_confirmed,
    BOOL_AND(COALESCE(x.closed, FALSE)) AS is_closed,
    COUNT(*)::INT AS merged_row_count
  FROM public.po_upload_chunks c
  CROSS JOIN LATERAL jsonb_to_recordset(c.rows) AS x(
    ord TEXT, ln NUMERIC, dn TEXT, tr BOOLEAN, mode TEXT, hs TEXT, ls TEXT, wo TEXT, wi TEXT,
    sd DATE, rd DATE, qd DATE, item TEXT, nm TEXT, q_ord INT, q_reg INT, q_shp INT,
    scf BOOLEAN, lcf BOOLEAN, closed BOOLEAN
  )
  WHERE c.upload_id = p_upload_id
    AND x.ord IS NOT NULL AND x.ln IS NOT NULL AND x.dn IS NOT NULL AND x.item IS NOT NULL
  GROUP BY x.ord, x.ln, x.dn;

  IF NOT EXISTS (SELECT 1 FROM t_rows) THEN
    RAISE EXCEPTION 'DO 행이 없습니다. 파일 형식을 확인해주세요.';
  END IF;

  CREATE UNIQUE INDEX ON t_rows (order_no, line_no, do_no);
  ANALYZE t_rows;

  -- 2) 출하 부족: 미종료 → 종료로 바뀐 행에서 등록 수량 < 이전 수량 (do_lines 갱신 전에 판정)
  IF NOT v_baseline THEN
    INSERT INTO public.do_change_events (
      upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
      change_type, direction, qty, qty_before, qty_after, detail
    )
    SELECT
      p_upload_id, v_date, t.order_no, t.line_no, t.do_no, t.item_no, t.item_name, t.is_transfer,
      'shipment_shortfall', 'delete', t.ordered_qty - t.registered_qty, t.ordered_qty, t.registered_qty,
      jsonb_build_object('shipped_qty', t.shipped_qty)
    FROM t_rows t
    JOIN public.do_lines d USING (order_no, line_no, do_no)
    WHERE t.is_closed AND NOT d.is_closed AND t.registered_qty < t.ordered_qty;
  END IF;

  -- 3) DO 행 현재 상태 갱신
  INSERT INTO public.do_lines AS d (
    order_no, line_no, do_no, is_transfer, delivery_mode, header_status, line_status,
    ship_warehouse, receive_warehouse, ship_date, receive_date, requested_delivery_date,
    item_no, item_name, ordered_qty, registered_qty, shipped_qty,
    sales_confirmed, logistics_confirmed, is_closed, merged_row_count,
    first_seen_upload_id, changed_upload_id, removed_upload_id, closed_upload_id
  )
  SELECT
    order_no, line_no, do_no, is_transfer, delivery_mode, header_status, line_status,
    ship_warehouse, receive_warehouse, ship_date, receive_date, requested_delivery_date,
    item_no, item_name, ordered_qty, registered_qty, shipped_qty,
    sales_confirmed, logistics_confirmed, is_closed, merged_row_count,
    p_upload_id, p_upload_id, NULL, CASE WHEN is_closed THEN p_upload_id END
  FROM t_rows
  -- 값이 같은 행은 다시 쓰지 않음 (매일 대부분의 행이 그대로라 처리 시간을 크게 줄임)
  ON CONFLICT (order_no, line_no, do_no) DO UPDATE SET
    is_transfer = EXCLUDED.is_transfer,
    delivery_mode = EXCLUDED.delivery_mode,
    header_status = EXCLUDED.header_status,
    line_status = EXCLUDED.line_status,
    ship_warehouse = EXCLUDED.ship_warehouse,
    receive_warehouse = EXCLUDED.receive_warehouse,
    ship_date = EXCLUDED.ship_date,
    receive_date = EXCLUDED.receive_date,
    requested_delivery_date = EXCLUDED.requested_delivery_date,
    item_no = EXCLUDED.item_no,
    item_name = EXCLUDED.item_name,
    ordered_qty = EXCLUDED.ordered_qty,
    registered_qty = EXCLUDED.registered_qty,
    shipped_qty = EXCLUDED.shipped_qty,
    sales_confirmed = EXCLUDED.sales_confirmed,
    logistics_confirmed = EXCLUDED.logistics_confirmed,
    is_closed = EXCLUDED.is_closed,
    merged_row_count = EXCLUDED.merged_row_count,
    changed_upload_id = EXCLUDED.changed_upload_id,
    removed_upload_id = NULL,
    closed_upload_id = CASE
      WHEN EXCLUDED.is_closed AND NOT d.is_closed THEN EXCLUDED.changed_upload_id
      WHEN EXCLUDED.is_closed THEN d.closed_upload_id
    END,
    updated_at = NOW()
  WHERE (
    d.is_transfer, d.delivery_mode, d.header_status, d.line_status, d.ship_warehouse, d.receive_warehouse,
    d.ship_date, d.receive_date, d.requested_delivery_date, d.item_no, d.item_name,
    d.ordered_qty, d.registered_qty, d.shipped_qty, d.sales_confirmed, d.logistics_confirmed,
    d.is_closed, d.merged_row_count, d.removed_upload_id
  ) IS DISTINCT FROM (
    EXCLUDED.is_transfer, EXCLUDED.delivery_mode, EXCLUDED.header_status, EXCLUDED.line_status,
    EXCLUDED.ship_warehouse, EXCLUDED.receive_warehouse, EXCLUDED.ship_date, EXCLUDED.receive_date,
    EXCLUDED.requested_delivery_date, EXCLUDED.item_no, EXCLUDED.item_name,
    EXCLUDED.ordered_qty, EXCLUDED.registered_qty, EXCLUDED.shipped_qty,
    EXCLUDED.sales_confirmed, EXCLUDED.logistics_confirmed,
    EXCLUDED.is_closed, EXCLUDED.merged_row_count, EXCLUDED.removed_upload_id
  );

  UPDATE public.do_lines d
  SET removed_upload_id = p_upload_id, updated_at = NOW()
  WHERE d.removed_upload_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM t_rows t
      WHERE t.order_no = d.order_no AND t.line_no = d.line_no AND t.do_no = d.do_no
    );

  -- 4) 판매주문 라인 단위 현재 상태 (DO 합산)
  DROP TABLE IF EXISTS t_cur;
  CREATE TEMP TABLE t_cur ON COMMIT DROP AS
  WITH dd AS (
    SELECT order_no, line_no, jsonb_object_agg(k, q) AS dist
    FROM (
      SELECT order_no, line_no,
        COALESCE(to_char(requested_delivery_date, 'YYYY-MM-DD'), '(없음)') AS k,
        SUM(ordered_qty) AS q
      FROM t_rows GROUP BY 1, 2, 3
    ) s
    GROUP BY 1, 2
  ),
  md AS (
    SELECT order_no, line_no, jsonb_object_agg(k, q) AS dist
    FROM (
      SELECT order_no, line_no, COALESCE(delivery_mode, '(없음)') AS k, SUM(ordered_qty) AS q
      FROM t_rows GROUP BY 1, 2, 3
    ) s
    GROUP BY 1, 2
  )
  SELECT
    t.order_no,
    t.line_no,
    BOOL_OR(t.is_transfer) AS is_transfer,
    MIN(t.item_no) AS item_no,
    (ARRAY_AGG(t.item_name ORDER BY t.item_no))[1] AS item_name,
    SUM(t.ordered_qty)::INT AS qty,
    BOOL_AND(t.is_closed) AS all_closed,
    (ARRAY_AGG(t.do_no ORDER BY t.is_closed, t.do_no DESC))[1] AS do_no,
    dd.dist AS date_dist,
    md.dist AS mode_dist
  FROM t_rows t
  JOIN dd USING (order_no, line_no)
  JOIN md USING (order_no, line_no)
  GROUP BY t.order_no, t.line_no, dd.dist, md.dist;

  CREATE UNIQUE INDEX ON t_cur (order_no, line_no);
  ANALYZE t_cur;

  -- 5) 첫 업로드: 확정 상태만 적재
  IF v_baseline THEN
    INSERT INTO public.do_order_lines (
      order_no, line_no, is_transfer, item_no, item_name, confirmed_qty,
      confirmed_date_dist, confirmed_mode_dist, status,
      first_seen_upload_id, first_seen_date, changed_upload_id
    )
    SELECT
      order_no, line_no, is_transfer, item_no, item_name, qty, date_dist, mode_dist,
      CASE WHEN all_closed THEN 'closed' ELSE 'active' END,
      p_upload_id, v_date, p_upload_id
    FROM t_cur;

    v_summary := jsonb_build_object(
      'baseline', TRUE,
      'order_lines', (SELECT COUNT(*) FROM t_cur),
      'open_order_lines', (SELECT COUNT(*) FROM t_cur WHERE NOT all_closed),
      'so_snapshot_date', v_so_date
    );

    UPDATE public.po_source_uploads
    SET status = 'completed', is_baseline = TRUE, row_count = p_row_count,
        summary = v_summary, completed_at = NOW()
    WHERE id = p_upload_id;

    DELETE FROM public.po_upload_chunks WHERE upload_id = p_upload_id;

    RETURN v_summary;
  END IF;

  -- 6) 비교 대상 분리 (확정 상태를 바꾸기 전에 모두 계산)
  DROP TABLE IF EXISTS t_new;
  CREATE TEMP TABLE t_new ON COMMIT DROP AS
  SELECT
    c.*,
    k.order_first_date IS NOT NULL AS order_known,
    k.order_first_date
  FROM t_cur c
  LEFT JOIN (
    SELECT order_no, MIN(first_seen_date) AS order_first_date
    FROM public.do_order_lines GROUP BY order_no
  ) k ON k.order_no = c.order_no
  WHERE NOT EXISTS (
    SELECT 1 FROM public.do_order_lines o WHERE o.order_no = c.order_no AND o.line_no = c.line_no
  );

  DROP TABLE IF EXISTS t_cmp;
  CREATE TEMP TABLE t_cmp ON COMMIT DROP AS
  SELECT
    o.order_no,
    o.line_no,
    COALESCE(c.is_transfer, o.is_transfer) AS is_transfer,
    o.item_no AS conf_item,
    o.item_name AS conf_item_name,
    o.confirmed_qty AS conf_qty,
    o.confirmed_date_dist AS conf_date,
    o.confirmed_mode_dist AS conf_mode,
    o.status,
    o.pending_count,
    (c.order_no IS NOT NULL) AS present,
    c.item_no AS cur_item,
    c.item_name AS cur_item_name,
    COALESCE(c.qty, 0) AS cur_qty,
    COALESCE(c.date_dist, '{}'::jsonb) AS cur_date,
    COALESCE(c.mode_dist, '{}'::jsonb) AS cur_mode,
    COALESCE(c.all_closed, FALSE) AS cur_closed,
    c.do_no AS cur_do,
    CASE
      -- 종료 라인: 계속 종료이거나 파일에서 빠지면(조회 범위 이탈) 변경 아님
      WHEN o.status = 'closed' AND (c.order_no IS NULL OR c.all_closed) THEN FALSE
      WHEN c.order_no IS NULL THEN o.confirmed_qty > 0
      ELSE (
        c.qty <> o.confirmed_qty
        OR c.item_no IS DISTINCT FROM o.item_no
        OR c.date_dist <> o.confirmed_date_dist
        OR c.mode_dist <> o.confirmed_mode_dist
      )
    END AS changed
  FROM public.do_order_lines o
  LEFT JOIN t_cur c ON c.order_no = o.order_no AND c.line_no = o.line_no
  WHERE o.status <> 'removed' OR c.order_no IS NOT NULL;

  SELECT COUNT(DISTINCT order_no) INTO v_new_orders FROM t_new WHERE NOT order_known;

  -- 7) 변화 없는 라인: 상태가 바뀌는 행만 갱신 (종료·사라짐·재등록 대기 중 원상 복귀)
  UPDATE public.do_order_lines o
  SET
    status = t.new_status,
    pending_since_upload_id = NULL,
    pending_count = 0,
    changed_upload_id = p_upload_id,
    updated_at = NOW()
  FROM (
    SELECT
      order_no, line_no,
      CASE WHEN NOT present THEN 'removed' WHEN cur_closed THEN 'closed' ELSE 'active' END AS new_status
    FROM t_cmp
    WHERE NOT changed
  ) t
  WHERE o.order_no = t.order_no AND o.line_no = t.line_no
    AND (o.status <> t.new_status OR o.pending_count <> 0 OR o.pending_since_upload_id IS NOT NULL);

  -- 8) 새로 나타난 라인
  FOR r IN SELECT * FROM t_new ORDER BY order_no, line_no LOOP
    INSERT INTO public.do_order_lines (
      order_no, line_no, is_transfer, item_no, item_name, confirmed_qty,
      confirmed_date_dist, confirmed_mode_dist, status,
      first_seen_upload_id, first_seen_date, changed_upload_id
    ) VALUES (
      r.order_no, r.line_no, r.is_transfer, r.item_no, r.item_name, r.qty,
      r.date_dist, r.mode_dist, CASE WHEN r.all_closed THEN 'closed' ELSE 'active' END,
      p_upload_id, v_date, p_upload_id
    );

    -- 신규 주문만 변경 아님. 기존 주문에 생긴 라인은 판매주문조회와 관계없이 라인 추가
    -- (DO 수량 변화는 판매주문 수량과 비교하지 않고 그대로 변경으로 기록 — 2026-10-13 결정)
    CONTINUE WHEN NOT r.order_known;

    PERFORM public.po_insert_change_event(
      p_upload_id, v_date, r.order_no, r.line_no, r.do_no, r.item_no, r.item_name, r.is_transfer,
      'line_added', r.qty,
      p_qty_before => 0,
      p_qty_after => r.qty,
      p_detail => jsonb_build_object('date_dist', r.date_dist, 'mode_dist', r.mode_dist)
    );
  END LOOP;

  -- 9) 바뀐 기존 라인
  FOR r IN SELECT * FROM t_cmp WHERE changed ORDER BY order_no, line_no LOOP
    -- 9-1) 라인이 DO에서 사라짐 → 판매주문조회에 미출고 수량이 남아 있으면 DO 재등록 대기
    --      (라인이 남아 있고 수량만 줄었으면 대기 없이 바로 삭제 — 2026-10-13 결정)
    v_missing := r.conf_qty - r.cur_qty;
    IF v_missing > 0 AND NOT r.present AND NOT r.is_transfer THEN
      SELECT COALESCE(SUM(s.remaining_qty), 0) >= v_missing AND BOOL_OR(s.line_status IS DISTINCT FROM 'CANCELED')
      INTO v_so_ok
      FROM public.so_lines s
      WHERE s.order_no = r.order_no AND s.item_no = r.conf_item;

      IF COALESCE(v_so_ok, FALSE) AND (r.status <> 'pending' OR r.pending_count + 1 < c_wait_uploads) THEN
        UPDATE public.do_order_lines
        SET
          status = 'pending',
          pending_since_upload_id = CASE WHEN r.status = 'pending' THEN pending_since_upload_id ELSE p_upload_id END,
          pending_count = CASE WHEN r.status = 'pending' THEN pending_count + 1 ELSE 0 END,
          changed_upload_id = p_upload_id,
          updated_at = NOW()
        WHERE order_no = r.order_no AND line_no = r.line_no;
        CONTINUE;
      END IF;
    END IF;

    -- 9-2) 확정 상태 대비 순변경을 이벤트로 기록
    v_do := COALESCE(r.cur_do, (
      SELECT d.do_no FROM public.do_lines d
      WHERE d.order_no = r.order_no AND d.line_no = r.line_no
      ORDER BY d.updated_at DESC LIMIT 1
    ));

    IF r.present AND r.conf_item IS NOT NULL AND r.cur_item IS DISTINCT FROM r.conf_item THEN
      PERFORM public.po_insert_change_event(
        p_upload_id, v_date, r.order_no, r.line_no, v_do, r.cur_item, r.cur_item_name, r.is_transfer,
        'item_changed', r.cur_qty,
        p_item_before => r.conf_item,
        p_item_after => r.cur_item
      );
    END IF;

    IF r.cur_qty > r.conf_qty THEN
      PERFORM public.po_insert_change_event(
        p_upload_id, v_date, r.order_no, r.line_no, v_do,
        COALESCE(r.cur_item, r.conf_item), COALESCE(r.cur_item_name, r.conf_item_name), r.is_transfer,
        CASE WHEN r.conf_qty = 0 THEN 'line_added' ELSE 'qty_increased' END,
        r.cur_qty - r.conf_qty,
        p_qty_before => r.conf_qty,
        p_qty_after => r.cur_qty
      );
    ELSIF r.cur_qty < r.conf_qty THEN
      PERFORM public.po_insert_change_event(
        p_upload_id, v_date, r.order_no, r.line_no, v_do,
        COALESCE(r.cur_item, r.conf_item), COALESCE(r.cur_item_name, r.conf_item_name), r.is_transfer,
        CASE WHEN r.cur_qty = 0 THEN 'line_removed' ELSE 'qty_decreased' END,
        r.conf_qty - r.cur_qty,
        p_qty_before => r.conf_qty,
        p_qty_after => r.cur_qty,
        p_detail => CASE WHEN r.status = 'pending'
          THEN jsonb_build_object('confirmed_after_pending_uploads', r.pending_count + 1)
        END
      );
    END IF;

    IF r.present AND r.cur_qty > 0 AND r.conf_qty > 0 THEN
      -- 요청 배송일: 이번에 출하 완료(미종료 → 종료)되는 라인은 출하 처리 때의 정보 정리로 보고 기록하지 않음
      SELECT * INTO v_shift FROM public.po_dist_shift(r.conf_date, r.cur_date);
      IF v_shift.moved > 0 AND NOT (r.cur_closed AND r.status <> 'closed') THEN
        PERFORM public.po_insert_change_event(
          p_upload_id, v_date, r.order_no, r.line_no, v_do, r.cur_item, r.cur_item_name, r.is_transfer,
          'delivery_date_changed', v_shift.moved,
          p_date_before => NULLIF(v_shift.from_key, '(없음)')::DATE,
          p_date_after => NULLIF(v_shift.to_key, '(없음)')::DATE,
          p_detail => jsonb_build_object('before', r.conf_date, 'after', r.cur_date)
        );
      END IF;

      -- 운송방법은 값이 다른 값으로 바뀔 때만 (빈칸 → 값 입력은 변경 아님)
      SELECT * INTO v_shift FROM public.po_dist_shift(r.conf_mode - '(없음)', r.cur_mode - '(없음)');
      IF v_shift.moved > 0 THEN
        PERFORM public.po_insert_change_event(
          p_upload_id, v_date, r.order_no, r.line_no, v_do, r.cur_item, r.cur_item_name, r.is_transfer,
          'delivery_mode_changed', v_shift.moved,
          p_mode_before => NULLIF(v_shift.from_key, '(없음)'),
          p_mode_after => NULLIF(v_shift.to_key, '(없음)'),
          p_detail => jsonb_build_object('before', r.conf_mode, 'after', r.cur_mode)
        );
      END IF;
    END IF;

    UPDATE public.do_order_lines
    SET
      is_transfer = r.is_transfer,
      item_no = COALESCE(r.cur_item, item_no),
      item_name = COALESCE(r.cur_item_name, item_name),
      confirmed_qty = r.cur_qty,
      confirmed_date_dist = r.cur_date,
      confirmed_mode_dist = r.cur_mode,
      status = CASE WHEN NOT r.present THEN 'removed' WHEN r.cur_closed THEN 'closed' ELSE 'active' END,
      pending_since_upload_id = NULL,
      pending_count = 0,
      changed_upload_id = p_upload_id,
      updated_at = NOW()
    WHERE order_no = r.order_no AND line_no = r.line_no;
  END LOOP;

  -- 10) 같은 주문·같은 품목의 삭제+추가는 차이만 남김 (DO 라인 번호만 바뀐 재등록)
  PERFORM public.po_net_same_item_changes(p_upload_id);

  -- 10-1) 분할/합배송 후보: 같은 날·같은 고객처·같은 품목의 삭제+추가, 주문을 공유하는 묶음은 하나로
  PERFORM public.po_group_split_candidates(p_upload_id);
  PERFORM public.po_merge_split_groups(p_upload_id);

  -- 10-2) 품목코드 변경 후보: 남은 이벤트 중 같은 SO에서 삭제와 추가 수량이 같고 품목이 다른 쌍
  FOR r IN
    SELECT id, order_no, qty, item_no
    FROM public.do_change_events
    WHERE upload_id = p_upload_id
      AND change_type IN ('line_removed', 'qty_decreased')
      AND candidate_group_id IS NULL
    ORDER BY order_no, line_no
  LOOP
    SELECT e.id INTO v_match
    FROM public.do_change_events e
    WHERE e.upload_id = p_upload_id
      AND e.order_no = r.order_no
      AND e.change_type IN ('line_added', 'qty_increased')
      AND e.qty = r.qty
      AND e.item_no IS DISTINCT FROM r.item_no
      AND e.candidate_group_id IS NULL
    ORDER BY e.line_no
    LIMIT 1;

    IF v_match IS NOT NULL THEN
      INSERT INTO public.do_change_groups (upload_id, group_type)
      VALUES (p_upload_id, 'item_change')
      RETURNING id INTO v_group;

      UPDATE public.do_change_events SET candidate_group_id = v_group WHERE id IN (r.id, v_match);
    END IF;
  END LOOP;

  -- 11) 요약
  v_summary := jsonb_build_object(
    'baseline', FALSE,
    'events', COALESCE((
      SELECT jsonb_object_agg(change_type, cnt)
      FROM (
        SELECT change_type, COUNT(*) AS cnt
        FROM public.do_change_events WHERE upload_id = p_upload_id
        GROUP BY change_type
      ) e
    ), '{}'::jsonb),
    'new_orders', v_new_orders,
    'pending_lines', (SELECT COUNT(*) FROM public.do_order_lines WHERE status = 'pending'),
    'item_change_candidates', (
      SELECT COUNT(*) FROM public.do_change_groups WHERE upload_id = p_upload_id AND group_type = 'item_change'
    ),
    'split_candidates', (
      SELECT COUNT(*) FROM public.do_change_groups WHERE upload_id = p_upload_id AND group_type = 'split'
    ),
    'stat_units', (SELECT COUNT(DISTINCT stat_unit_key) FROM public.v_do_change_events WHERE upload_id = p_upload_id),
    'so_snapshot_date', v_so_date,
    'so_snapshot_stale', v_so_date IS DISTINCT FROM v_date
  );

  UPDATE public.po_source_uploads
  SET status = 'completed', row_count = p_row_count, summary = v_summary, completed_at = NOW()
  WHERE id = p_upload_id;

  DELETE FROM public.po_upload_chunks WHERE upload_id = p_upload_id;

  RETURN v_summary;
END;
$$;

/**
 * PO 현황 대시보드용 변경 목록 (변경 1건 = 1행, 조회 범위 적용, 추적 제외 제외)
 * 주문·품목 상세 없이 집계에 필요한 값만 돌려줌
 *   - 영업관리팀·관리자: 전체
 *   - 고객처 계정: 자기 고객처 주문의 변경
 *   - 본사·국내법인 부서: 요청 출처가 자기 부서인 변경 + 추가 조회 권한으로 열린 고객처의 변경
 */
CREATE OR REPLACE FUNCTION public.po_dashboard_changes(p_from DATE, p_to DATE)
RETURNS TABLE (
  stat_unit_key TEXT,
  detected_on DATE,
  change_type_code TEXT,
  change_type_label TEXT,
  customer_name TEXT,
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
 * "변경 아님(정정)" 처리 (여러 건 한 번에) — 오입력 정정 등 실제 변경이 아닌 건을 통계에서 뺌
 * @param p_keys 변경 1건 키 목록 (v_do_change_events.stat_unit_key)
 * @param p_note 정정 내용 메모 (필수)
 * @returns 처리한 건수
 */
CREATE OR REPLACE FUNCTION public.dismiss_changes(p_keys TEXT[], p_note TEXT)
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
    RAISE EXCEPTION '변경이 아닌 이유를 메모로 입력해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT ARRAY_AGG(DISTINCT k) INTO v_keys FROM unnest(p_keys) k WHERE NULLIF(btrim(k), '') IS NOT NULL;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION '처리할 변경을 선택해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.po_change_dismissals (stat_unit_key, note, dismissed_by, dismissed_by_name, dismissed_at)
  SELECT k, v_note, auth.uid(), v_name, NOW() FROM unnest(v_keys) k
  ON CONFLICT (stat_unit_key) DO UPDATE SET
    note = EXCLUDED.note,
    dismissed_by = EXCLUDED.dismissed_by,
    dismissed_by_name = EXCLUDED.dismissed_by_name,
    dismissed_at = EXCLUDED.dismissed_at;

  INSERT INTO public.po_change_dismissal_history (stat_unit_key, action, note, acted_by, acted_by_name)
  SELECT k, 'dismissed', v_note, auth.uid(), v_name FROM unnest(v_keys) k;

  RETURN array_length(v_keys, 1);
END;
$$;

/**
 * "변경 아님" 해제 — 다시 변경으로 셈
 * @returns 해제한 건수
 */
CREATE OR REPLACE FUNCTION public.restore_changes(p_keys TEXT[])
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

  INSERT INTO public.po_change_dismissal_history (stat_unit_key, action, note, acted_by, acted_by_name)
  SELECT d.stat_unit_key, 'restored', d.note, auth.uid(), v_name
  FROM public.po_change_dismissals d WHERE d.stat_unit_key = ANY(p_keys);

  DELETE FROM public.po_change_dismissals WHERE stat_unit_key = ANY(p_keys);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_changes(TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_changes(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_changes(TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_changes(TEXT[]) TO authenticated;


-- ---------------------------------------------------------------------
-- 4. 소급
-- ---------------------------------------------------------------------
-- 4-1) 운송방법 빈칸 → 값 / 값 → 빈칸 이벤트 삭제
DELETE FROM public.do_change_events
WHERE change_type = 'delivery_mode_changed' AND (mode_before IS NULL OR mode_after IS NULL);

-- 4-2) 출하 완료되던 순간의 요청 배송일 이벤트 삭제 (그 업로드에서 해당 라인의 DO 행이 종료됨)
DELETE FROM public.do_change_events e
WHERE e.change_type = 'delivery_date_changed'
  AND EXISTS (
    SELECT 1 FROM public.do_lines d
    WHERE d.order_no = e.order_no AND d.line_no = e.line_no AND d.closed_upload_id = e.upload_id
  );

-- 4-3) 주문 단위로 묶이는 삭제: 라인별로 넣었던 사유·변경 아님을 주문 키로 옮김 (주문 키에 이미 있으면 그대로)
INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
SELECT DISTINCT ON (v.stat_unit_key) v.stat_unit_key, r.reason, r.note, r.origin_type, r.origin_code, r.source, r.set_by, r.set_by_name, r.set_at
FROM public.v_do_change_events v
JOIN public.po_change_reasons r ON r.stat_unit_key = 'event:' || v.id::TEXT
WHERE v.stat_unit_key LIKE 'order:%'
ORDER BY v.stat_unit_key, r.set_at DESC
ON CONFLICT (stat_unit_key) DO NOTHING;

-- 4-4) 남은 이벤트가 없는 사유 정리 (이벤트 키·일정 묶음 키, 이력은 남김)
DELETE FROM public.po_change_reasons r
WHERE (r.stat_unit_key LIKE 'event:%' OR r.stat_unit_key LIKE 'shift:%')
  AND NOT EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = r.stat_unit_key);

-- 4-5) 업로드 요약 다시 계산
UPDATE public.po_source_uploads s
SET summary = COALESCE(s.summary, '{}'::jsonb) || jsonb_build_object(
  'events', COALESCE((
    SELECT jsonb_object_agg(change_type, cnt)
    FROM (SELECT change_type, COUNT(*) AS cnt FROM public.do_change_events WHERE upload_id = s.id GROUP BY change_type) e
  ), '{}'::jsonb),
  'stat_units', (SELECT COUNT(DISTINCT stat_unit_key) FROM public.v_do_change_events WHERE upload_id = s.id)
)
WHERE s.kind = 'do' AND s.status = 'completed' AND NOT s.is_baseline;

-- 결과: 업로드별 변경 건수
SELECT snapshot_date AS "기준일", (summary->>'stat_units')::INT AS "변경 건수"
FROM public.po_source_uploads
WHERE kind = 'do' AND status = 'completed' AND NOT is_baseline
ORDER BY snapshot_date;
