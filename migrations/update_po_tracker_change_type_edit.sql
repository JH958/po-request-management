-- =====================================================================
-- PO Tracker: 변경 유형 고치기 + PO 간 이동·날짜가 다른 짝찾기·직접 묶기 원복 (2026-10-21)
--
-- 변경 내용
--   1) 원복 (update_po_tracker_po_move.sql 이전으로)
--      - PO 간 이동 묶음 → 분할/합배송, 변경 유형·판정 기준 'PO 간 이동'(po_move) 삭제
--      - 날짜가 다른 짝찾기 중지: 같은 날 짝만 찾음. 날짜가 다른 짝이 들어간 묶음(10/20 UAE 합배송)은
--        풀고 그날 업로드를 같은 날 규칙으로 다시 묶음 (묶음 사유·처리 상태·이력은 새 묶음으로 옮김)
--      - 직접 묶기(bundle_changes) 삭제 — 직접 묶은 묶음이 있으면 풀어서 각 라인 1건으로
--   2) 변경 유형 고치기: 영업관리팀이 변경 1건(통계 단위)의 변경 유형을 PO 변경 유형 중 하나로 지정
--      (po_change_type_overrides / set_change_types(), 이력 po_change_type_override_history).
--      화면·통계·대시보드는 고친 유형으로 셈. 자동 판정과 같은 유형을 고르면 고친 값을 지움.
--      후보 묶음은 승인할 때 review_change_group(…, p_type_code)로 함께 저장 — 반려되면 각 라인은 자동 판정
--   3) 주문 전체 삭제(order: 키) 건도 사유를 입력할 수 있게 고침
--
-- 선행: update_po_tracker_po_move.sql (실행한 DB). 실행하지 않은 DB에서도 안전합니다.
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 변경 유형 고치기 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_change_type_overrides (
  stat_unit_key TEXT PRIMARY KEY,
  type_code TEXT NOT NULL REFERENCES public.po_change_type_settings(code) ON UPDATE CASCADE ON DELETE CASCADE,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.po_change_type_overrides IS '영업관리팀이 고친 변경 유형 — 변경 1건(v_do_change_events.stat_unit_key)을 자동 판정 대신 이 유형으로 셈. set_change_types()로만 기록. 묶음이 반려되면 각 라인은 자동 판정으로';

CREATE TABLE IF NOT EXISTS public.po_change_type_override_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_unit_key TEXT NOT NULL,
  type_code TEXT,
  rule_type_code TEXT,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_change_type_override_history_key_idx ON public.po_change_type_override_history (stat_unit_key, created_at);

COMMENT ON TABLE public.po_change_type_override_history IS '변경 유형 고치기 이력 (type_code NULL = 자동 판정으로 되돌림, rule_type_code = 그때의 자동 판정)';


-- ---------------------------------------------------------------------
-- 2. 함수: 같은 날 짝찾기·업로드 비교(원래대로), 사유, 승인, 변경 유형 고치기
--    (직접 묶기·PO 간 이동 구분·사유 옮기기 함수 삭제)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.bundle_changes(UUID[], TEXT, TEXT);
DROP FUNCTION IF EXISTS public.po_finalize_split_groups(UUID);
DROP FUNCTION IF EXISTS public.po_carry_reasons_to_group(UUID, TEXT[]);

/**
 * 분할/합배송 후보 묶기 — 같은 업로드(같은 날)에서 같은 고객처·같은 품목의 삭제와 추가를 묶음
 *
 * 후보
 *   삭제: 이번 업로드의 라인 삭제·수량 감소 이벤트(출하 부족 제외) + 이번 업로드에 재등록 대기로 들어간 라인
 *   추가: 이번 업로드의 라인 추가·수량 증가 이벤트 + 이번 업로드에 처음 나타난 신규 주문의 라인
 * 묶는 방법
 *   1) 같은 고객처·같은 품목에서 삭제 합계 = 추가 합계이면 전부 한 묶음 (같은 PO 안 분할 포함)
 *   2) 남은 것 중 같은 품목·같은 수량이고 고객처가 같거나 한쪽이 미확인이면 1:1 묶음 (미확인은 표시)
 * 묶인 재등록 대기 라인은 대기를 풀고 삭제로 확정, 묶인 신규 주문 라인은 라인 추가 이벤트를 만든다.
 * 이전(Transfer) 주문은 제외. 반환값: 새로 만든 묶음 수
 */
CREATE OR REPLACE FUNCTION public.po_group_split_candidates(p_upload_id UUID)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date DATE;
  v_groups INT := 0;
  v_group UUID;
  v_cur INT;
  v_do TEXT;
  r RECORD;
  m RECORD;
BEGIN
  SELECT snapshot_date INTO v_date FROM public.po_source_uploads WHERE id = p_upload_id;

  DROP TABLE IF EXISTS t_split;
  CREATE TEMP TABLE t_split (
    seq SERIAL PRIMARY KEY,
    side CHAR(1) NOT NULL,
    source TEXT NOT NULL,
    event_id UUID,
    order_no TEXT NOT NULL,
    line_no NUMERIC NOT NULL,
    item_no TEXT,
    qty INT NOT NULL,
    cust_key TEXT,
    group_id UUID
  ) ON COMMIT DROP;

  -- 이번 업로드의 삭제·추가 이벤트 (아직 묶이지 않은 것)
  INSERT INTO t_split (side, source, event_id, order_no, line_no, item_no, qty)
  SELECT CASE WHEN e.direction = 'delete' THEN 'D' ELSE 'A' END, 'event', e.id, e.order_no, e.line_no, e.item_no, e.qty
  FROM public.do_change_events e
  WHERE e.upload_id = p_upload_id
    AND e.change_type IN ('line_removed', 'qty_decreased', 'line_added', 'qty_increased')
    AND e.candidate_group_id IS NULL
    AND NOT e.is_transfer;

  -- 이번 업로드에 재등록 대기로 들어간 라인 (DO에서 사라진 수량)
  INSERT INTO t_split (side, source, order_no, line_no, item_no, qty)
  SELECT 'D', 'pending', o.order_no, o.line_no, o.item_no, o.confirmed_qty - COALESCE(cur.qty, 0)
  FROM public.do_order_lines o
  LEFT JOIN LATERAL (
    SELECT SUM(d.ordered_qty)::INT AS qty
    FROM public.do_lines d
    WHERE d.order_no = o.order_no AND d.line_no = o.line_no AND d.removed_upload_id IS NULL
  ) cur ON TRUE
  WHERE o.status = 'pending'
    AND o.pending_since_upload_id = p_upload_id
    AND NOT o.is_transfer
    AND o.confirmed_qty - COALESCE(cur.qty, 0) > 0;

  -- 이번 업로드에 처음 나타난 신규 주문의 라인
  INSERT INTO t_split (side, source, order_no, line_no, item_no, qty)
  SELECT 'A', 'new_order', o.order_no, o.line_no, o.item_no, o.confirmed_qty
  FROM public.do_order_lines o
  WHERE o.first_seen_upload_id = p_upload_id
    AND NOT o.is_transfer
    AND o.confirmed_qty > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.do_order_lines p
      WHERE p.order_no = o.order_no AND p.first_seen_date < v_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.do_change_events e
      WHERE e.upload_id = p_upload_id AND e.order_no = o.order_no AND e.line_no = o.line_no
    );

  IF NOT EXISTS (SELECT 1 FROM t_split WHERE side = 'D') OR NOT EXISTS (SELECT 1 FROM t_split WHERE side = 'A') THEN
    RETURN 0;
  END IF;

  UPDATE t_split t
  SET cust_key = COALESCE(c.account_no, c.customer_name)
  FROM public.customer_so_map c
  WHERE c.order_no = t.order_no;

  -- 1) 같은 고객처·같은 품목에서 삭제 합계 = 추가 합계 → 한 묶음
  FOR r IN
    SELECT cust_key, item_no
    FROM t_split
    WHERE cust_key IS NOT NULL AND item_no IS NOT NULL
    GROUP BY cust_key, item_no
    HAVING BOOL_OR(side = 'D') AND BOOL_OR(side = 'A')
       AND SUM(qty) FILTER (WHERE side = 'D') = SUM(qty) FILTER (WHERE side = 'A')
  LOOP
    INSERT INTO public.do_change_groups (upload_id, group_type, customer_unverified)
    VALUES (p_upload_id, 'split', FALSE)
    RETURNING id INTO v_group;

    UPDATE t_split SET group_id = v_group WHERE cust_key = r.cust_key AND item_no = r.item_no;
    v_groups := v_groups + 1;
  END LOOP;

  -- 2) 남은 것: 같은 품목·같은 수량 1:1 (고객처가 같거나 한쪽이 미확인)
  FOR r IN SELECT * FROM t_split WHERE side = 'D' AND group_id IS NULL ORDER BY order_no, line_no LOOP
    SELECT * INTO m
    FROM t_split a
    WHERE a.side = 'A'
      AND a.group_id IS NULL
      AND a.item_no = r.item_no
      AND a.qty = r.qty
      AND (a.cust_key = r.cust_key OR a.cust_key IS NULL OR r.cust_key IS NULL)
    ORDER BY (a.cust_key IS NOT DISTINCT FROM r.cust_key) DESC, a.order_no, a.line_no
    LIMIT 1;

    IF m.seq IS NOT NULL THEN
      INSERT INTO public.do_change_groups (upload_id, group_type, customer_unverified)
      VALUES (p_upload_id, 'split', r.cust_key IS NULL OR m.cust_key IS NULL)
      RETURNING id INTO v_group;

      UPDATE t_split SET group_id = v_group WHERE seq IN (r.seq, m.seq);
      v_groups := v_groups + 1;
    END IF;
  END LOOP;

  -- 묶인 재등록 대기 라인 → 대기를 풀고 삭제 확정
  FOR r IN
    SELECT t.*, o.confirmed_qty, o.item_name, o.is_transfer
    FROM t_split t
    JOIN public.do_order_lines o ON o.order_no = t.order_no AND o.line_no = t.line_no
    WHERE t.source = 'pending' AND t.group_id IS NOT NULL
  LOOP
    v_cur := r.confirmed_qty - r.qty;
    v_do := (
      SELECT d.do_no FROM public.do_lines d
      WHERE d.order_no = r.order_no AND d.line_no = r.line_no
      ORDER BY d.updated_at DESC LIMIT 1
    );

    INSERT INTO public.do_change_events (
      upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
      change_type, direction, qty, qty_before, qty_after, detail, candidate_group_id
    ) VALUES (
      p_upload_id, v_date, r.order_no, r.line_no, v_do, r.item_no, r.item_name, r.is_transfer,
      CASE WHEN v_cur = 0 THEN 'line_removed' ELSE 'qty_decreased' END, 'delete',
      r.qty, r.confirmed_qty, v_cur,
      jsonb_build_object('pending_resolved_by_split', TRUE), r.group_id
    );

    UPDATE public.do_order_lines o
    SET
      confirmed_qty = v_cur,
      confirmed_date_dist = COALESCE((
        SELECT jsonb_object_agg(k, q) FROM (
          SELECT COALESCE(to_char(d.requested_delivery_date, 'YYYY-MM-DD'), '(없음)') AS k, SUM(d.ordered_qty) AS q
          FROM public.do_lines d
          WHERE d.order_no = o.order_no AND d.line_no = o.line_no AND d.removed_upload_id IS NULL
          GROUP BY 1
        ) x
      ), '{}'::jsonb),
      confirmed_mode_dist = COALESCE((
        SELECT jsonb_object_agg(k, q) FROM (
          SELECT COALESCE(d.delivery_mode, '(없음)') AS k, SUM(d.ordered_qty) AS q
          FROM public.do_lines d
          WHERE d.order_no = o.order_no AND d.line_no = o.line_no AND d.removed_upload_id IS NULL
          GROUP BY 1
        ) x
      ), '{}'::jsonb),
      status = CASE WHEN v_cur = 0 THEN 'removed' ELSE 'active' END,
      pending_since_upload_id = NULL,
      pending_count = 0,
      changed_upload_id = p_upload_id,
      updated_at = NOW()
    WHERE o.order_no = r.order_no AND o.line_no = r.line_no;
  END LOOP;

  -- 묶인 신규 주문 라인 → 라인 추가 이벤트
  INSERT INTO public.do_change_events (
    upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
    change_type, direction, qty, qty_before, qty_after, detail, candidate_group_id
  )
  SELECT
    p_upload_id, v_date, o.order_no, o.line_no,
    (SELECT d.do_no FROM public.do_lines d
      WHERE d.order_no = o.order_no AND d.line_no = o.line_no
      ORDER BY d.updated_at DESC LIMIT 1),
    o.item_no, o.item_name, o.is_transfer,
    'line_added', 'add', o.confirmed_qty, 0, o.confirmed_qty,
    jsonb_build_object('date_dist', o.confirmed_date_dist, 'mode_dist', o.confirmed_mode_dist, 'new_order', TRUE),
    t.group_id
  FROM t_split t
  JOIN public.do_order_lines o ON o.order_no = t.order_no AND o.line_no = t.line_no
  WHERE t.source = 'new_order' AND t.group_id IS NOT NULL;

  -- 기존 이벤트에 묶음 연결
  UPDATE public.do_change_events e
  SET candidate_group_id = t.group_id
  FROM t_split t
  WHERE t.source = 'event' AND t.event_id = e.id AND t.group_id IS NOT NULL;

  RETURN v_groups;
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
  IF NOT public.po_is_sales_team() THEN
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

  -- 존재하는 변경 1건 키인지 (group:묶음, event:이벤트, shift:일정·운송방법 묶음, order:주문 전체 삭제)
  SELECT COUNT(*) INTO v_found
  FROM unnest(v_keys) k
  WHERE CASE
    WHEN k ~ '^group:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_groups g WHERE g.id = substring(k FROM 7)::UUID)
    WHEN k ~ '^event:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_events e WHERE e.id = substring(k FROM 7)::UUID)
    WHEN k LIKE 'shift:%' OR k LIKE 'order:%' THEN EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = k)
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

/**
 * 변경 유형 고치기 (여러 건 한 번에) — 자동 판정과 다르게 셀 변경을 영업관리팀이 PO 변경 유형 중 하나로 지정
 * 자동 판정과 같은 유형을 고르거나 p_type_code가 NULL이면 고친 값을 지우고 자동 판정으로 되돌린다. 모든 처리는 이력에 남김
 * @param p_keys 변경 1건 키 목록 (v_do_change_events.stat_unit_key)
 * @param p_type_code PO 변경 유형 코드 (po_change_type_settings.code), NULL = 자동 판정으로
 * @returns 처리한 건수
 */
CREATE OR REPLACE FUNCTION public.set_change_types(p_keys TEXT[], p_type_code TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type TEXT := NULLIF(btrim(p_type_code), '');
  v_keys TEXT[];
  v_name TEXT;
  r RECORD;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '변경 유형을 고칠 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY_AGG(DISTINCT k) INTO v_keys FROM unnest(p_keys) k WHERE NULLIF(btrim(k), '') IS NOT NULL;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION '처리할 변경을 선택해주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.po_change_type_settings WHERE code = v_type AND is_active) THEN
    RAISE EXCEPTION '사용 중인 변경 유형이 아닙니다: %', v_type USING ERRCODE = '22023';
  END IF;

  -- 키마다 자동 판정 유형 (없으면 찾을 수 없는 변경)
  DROP TABLE IF EXISTS t_type_keys;
  CREATE TEMP TABLE t_type_keys ON COMMIT DROP AS
  SELECT k AS stat_unit_key, x.rule_type_code
  FROM unnest(v_keys) k
  LEFT JOIN (
    SELECT v.stat_unit_key, MIN(v.rule_type_code) AS rule_type_code
    FROM public.v_do_change_events v
    WHERE v.stat_unit_key = ANY (v_keys)
    GROUP BY v.stat_unit_key
  ) x ON x.stat_unit_key = k;

  IF EXISTS (SELECT 1 FROM t_type_keys WHERE rule_type_code IS NULL) THEN
    RAISE EXCEPTION '찾을 수 없는 변경이 있습니다. 새로고침 후 다시 시도해주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  FOR r IN SELECT * FROM t_type_keys LOOP
    IF v_type IS NULL OR v_type = r.rule_type_code THEN
      DELETE FROM public.po_change_type_overrides WHERE stat_unit_key = r.stat_unit_key;
    ELSE
      INSERT INTO public.po_change_type_overrides (stat_unit_key, type_code, set_by, set_by_name, set_at)
      VALUES (r.stat_unit_key, v_type, auth.uid(), v_name, NOW())
      ON CONFLICT (stat_unit_key) DO UPDATE SET
        type_code = EXCLUDED.type_code,
        set_by = EXCLUDED.set_by,
        set_by_name = EXCLUDED.set_by_name,
        set_at = EXCLUDED.set_at;
    END IF;

    INSERT INTO public.po_change_type_override_history (stat_unit_key, type_code, rule_type_code, set_by, set_by_name)
    VALUES (
      r.stat_unit_key,
      CASE WHEN v_type = r.rule_type_code THEN NULL ELSE v_type END,
      r.rule_type_code, auth.uid(), v_name
    );
  END LOOP;

  RETURN array_length(v_keys, 1);
END;
$$;

-- 이전 버전 제거 (같은 이름 함수가 두 개 생기지 않도록 — 인자 3개·6개, 인자 이름이 달랐던 7개)
DROP FUNCTION IF EXISTS public.review_change_group(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

/**
 * 후보 묶음 승인·반려·되돌리기 (담당자 확인) — 반려하면 통계에서 각 이벤트를 개별 삭제·추가로 센다
 * 승인·반려는 메모 필수. 처리자 이름은 묶음에 저장하고 모든 처리를 이력에 남긴다
 * 사유(p_reason)를 함께 넘기면 메모를 상세 사유로 하여 묶음의 변경 사유도 저장한다
 * (반려되면 각 라인이 묶음 사유를 물려받음)
 * 승인할 때 변경 유형(p_type_code)을 넘기면 묶음을 그 유형으로 센다 (자동 판정과 같으면 고친 값 없음, 반려되면 각 라인은 자동 판정)
 */
CREATE OR REPLACE FUNCTION public.review_change_group(
  p_group_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL,
  p_origin_code TEXT DEFAULT NULL,
  p_type_code TEXT DEFAULT NULL
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
  IF NOT public.po_is_sales_team() THEN
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

  -- 묶음 변경 유형 (승인과 함께)
  IF p_status = 'approved' AND NULLIF(btrim(p_type_code), '') IS NOT NULL THEN
    PERFORM public.set_change_types(ARRAY['group:' || p_group_id::TEXT], p_type_code);
  END IF;
END;
$$;


-- ---------------------------------------------------------------------
-- 3. 데이터 원복
-- ---------------------------------------------------------------------
-- 2-1) 직접 묶음 삭제 (라인은 묶음에서 빠지고 각자 1건으로, 직접 묶음 키의 사유·변경 아님은 정리 — 이력은 남김)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'do_change_groups' AND column_name = 'is_manual') THEN
    EXECUTE $q$
      DELETE FROM public.po_change_reasons r
      USING public.do_change_groups g
      WHERE g.is_manual AND r.stat_unit_key = 'group:' || g.id::TEXT
    $q$;
    EXECUTE $q$
      DELETE FROM public.po_change_dismissals d
      USING public.do_change_groups g
      WHERE g.is_manual AND d.stat_unit_key = 'group:' || g.id::TEXT
    $q$;
    EXECUTE $q$
      UPDATE public.do_change_events e SET candidate_group_id = NULL
      FROM public.do_change_groups g
      WHERE g.is_manual AND e.candidate_group_id = g.id
    $q$;
    EXECUTE 'DELETE FROM public.do_change_groups WHERE is_manual';
  END IF;
END $$;

-- 2-2) PO 간 이동 → 분할/합배송
UPDATE public.do_change_groups SET group_type = 'split' WHERE group_type = 'move';

-- 2-3) 날짜가 다른 짝이 들어간 묶음: 풀고 그 업로드를 같은 날 규칙으로 다시 묶음
--      (원래 묶음의 사유·처리 상태·처리 이력은 같은 라인이 든 새 묶음으로 옮김)
DO $$
DECLARE
  g RECORD;
  n RECORD;
  v_old public.do_change_groups;
  v_reason RECORD;
  v_first UUID;
BEGIN
  FOR g IN
    SELECT DISTINCT cg.id, cg.upload_id
    FROM public.do_change_groups cg
    JOIN public.po_source_uploads u ON u.id = cg.upload_id
    JOIN public.do_change_events e ON e.candidate_group_id = cg.id
    WHERE cg.group_type = 'split' AND e.detected_on <> u.snapshot_date
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.do_change_events e
      WHERE e.candidate_group_id = g.id AND e.detail ? 'pending_resolved_by_split'
        AND e.detected_on <> (SELECT snapshot_date FROM public.po_source_uploads WHERE id = g.upload_id)
    ) THEN
      RAISE EXCEPTION '재등록 대기 라인이 날짜가 다른 짝으로 묶인 묶음이 있습니다 (%). 실행을 멈췄습니다 — 개발 담당에게 알려주세요.', g.id;
    END IF;

    SELECT * INTO v_old FROM public.do_change_groups WHERE id = g.id;
    SELECT * INTO v_reason FROM public.po_change_reasons WHERE stat_unit_key = 'group:' || g.id::TEXT;
    DROP TABLE IF EXISTS t_old_lines;
    CREATE TEMP TABLE t_old_lines ON COMMIT DROP AS
    SELECT order_no, line_no FROM public.do_change_events WHERE candidate_group_id = g.id;

    -- 묶을 때 만든 새 주문 라인 추가 이벤트는 지우고, 나머지는 묶음에서 뺀 뒤 같은 날 규칙으로 다시 묶음
    DELETE FROM public.do_change_events WHERE candidate_group_id = g.id AND detail ? 'new_order';
    UPDATE public.do_change_events SET candidate_group_id = NULL WHERE candidate_group_id = g.id;
    PERFORM public.po_group_split_candidates(g.upload_id);
    PERFORM public.po_merge_split_groups(g.upload_id);

    v_first := NULL;
    FOR n IN
      SELECT DISTINCT cg.id, cg.created_at
      FROM public.do_change_groups cg
      JOIN public.do_change_events e ON e.candidate_group_id = cg.id
      JOIN t_old_lines o ON o.order_no = e.order_no AND o.line_no = e.line_no
      WHERE cg.upload_id = g.upload_id AND cg.id <> g.id AND cg.status = 'pending'
        AND cg.created_at >= v_old.created_at
      ORDER BY cg.created_at, cg.id
    LOOP
      v_first := COALESCE(v_first, n.id);
      UPDATE public.do_change_groups
      SET status = v_old.status, review_note = v_old.review_note, reviewed_by = v_old.reviewed_by,
          reviewed_by_name = v_old.reviewed_by_name, reviewed_at = v_old.reviewed_at,
          customer_unverified = customer_unverified OR v_old.customer_unverified
      WHERE id = n.id;

      IF v_reason.stat_unit_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.po_change_reasons x WHERE x.stat_unit_key = 'group:' || n.id::TEXT) THEN
        INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
        VALUES ('group:' || n.id::TEXT, v_reason.reason, v_reason.note, v_reason.origin_type, v_reason.origin_code,
                v_reason.source, v_reason.set_by, v_reason.set_by_name, v_reason.set_at);
        INSERT INTO public.po_change_reason_history (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name)
        VALUES ('group:' || n.id::TEXT, v_reason.reason, v_reason.note, v_reason.origin_type, v_reason.origin_code,
                'regrouped', v_reason.set_by, v_reason.set_by_name);
      END IF;
    END LOOP;

    IF v_first IS NOT NULL THEN
      UPDATE public.do_change_group_reviews SET group_id = v_first WHERE group_id = g.id;
    END IF;
    DELETE FROM public.po_change_reasons WHERE stat_unit_key = 'group:' || g.id::TEXT;
    DELETE FROM public.do_change_groups WHERE id = g.id;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 4. 구조 원복 (직접 묶음 열, PO 간 이동 유형·판정 기준) + 조회용 뷰 다시 만들기
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_do_change_events;

ALTER TABLE public.do_change_groups DROP COLUMN IF EXISTS is_manual;
ALTER TABLE public.do_change_groups DROP CONSTRAINT IF EXISTS do_change_groups_group_type_check;
ALTER TABLE public.do_change_groups ADD CONSTRAINT do_change_groups_group_type_check
  CHECK (group_type IN ('split', 'item_change'));
COMMENT ON TABLE public.do_change_groups IS '변경 이벤트 후보 묶음 — split(분할/합배송: 같은 날·같은 고객처·같은 품목 삭제+추가), item_change(품목코드 변경)';

DELETE FROM public.po_change_type_rules WHERE rule_key = 'po_move';
ALTER TABLE public.po_change_type_rules DROP CONSTRAINT IF EXISTS po_change_type_rules_rule_key_check;
ALTER TABLE public.po_change_type_rules ADD CONSTRAINT po_change_type_rules_rule_key_check CHECK (rule_key IN (
  'add_product', 'add_material', 'add_other',
  'delete_product', 'delete_material', 'delete_other',
  'item_change', 'date_change', 'mode_change', 'split'
));
COMMENT ON COLUMN public.po_change_type_rules.rule_key IS
  'add_/delete_product(제품·상품) material(자재) other(미분류·제외), item_change(품목코드 변경 후보·품목 변경), date_change(요청 배송일), mode_change(납품 모드), split(분할/합배송 후보)';
DELETE FROM public.po_change_type_settings WHERE code = 'po_move';

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
  -- 변경 유형을 영업관리팀이 고쳤는지, 자동 판정 유형, 고친 사람
  (tos.code IS NOT NULL) AS is_type_overridden,
  COALESCE(ts.code, 'other') AS rule_type_code,
  CASE WHEN tos.code IS NOT NULL THEN tov.set_by_name END AS type_set_by_name,
  CASE WHEN tos.code IS NOT NULL THEN tov.set_at END AS type_set_at
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
LEFT JOIN public.po_change_type_settings tos ON tos.code = tov.type_code AND tos.is_active;

COMMENT ON VIEW public.v_do_change_events IS '변경 이벤트 + 고객처·담당자·변경 사유·요청 출처·품목군·구분(품목 예외 우선)·변경 유형(관리자 설정, 영업관리팀이 고친 유형 우선)·제외 여부·후보 묶음 — 통계는 stat_unit_key 기준으로 셀 것 (후보 묶음·일정/운송방법 묶음은 1건)';


-- ---------------------------------------------------------------------
-- 5. 조회 권한·실행 권한
-- ---------------------------------------------------------------------
ALTER TABLE public.po_change_type_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_override_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sales team can view po_change_type_overrides" ON public.po_change_type_overrides;
CREATE POLICY "Sales team can view po_change_type_overrides" ON public.po_change_type_overrides
  FOR SELECT USING (public.po_is_sales_team());
DROP POLICY IF EXISTS "Sales team can view po_change_type_override_history" ON public.po_change_type_override_history;
CREATE POLICY "Sales team can view po_change_type_override_history" ON public.po_change_type_override_history
  FOR SELECT USING (public.po_is_sales_team());

REVOKE ALL ON FUNCTION public.po_group_split_candidates(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_do_snapshot(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_do_snapshot(UUID, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_change_types(TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_change_types(TEXT[], TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 6. 업로드 요약 다시 계산 + 결과 확인
-- ---------------------------------------------------------------------
UPDATE public.po_source_uploads s
SET summary = COALESCE(s.summary, '{}'::jsonb) || jsonb_build_object(
  'events', COALESCE((
    SELECT jsonb_object_agg(change_type, cnt)
    FROM (SELECT change_type, COUNT(*) AS cnt FROM public.do_change_events WHERE upload_id = s.id GROUP BY change_type) e
  ), '{}'::jsonb),
  'split_candidates', (SELECT COUNT(*) FROM public.do_change_groups WHERE upload_id = s.id AND group_type = 'split'),
  'stat_units', (SELECT COUNT(DISTINCT stat_unit_key) FROM public.v_do_change_events WHERE upload_id = s.id)
)
WHERE s.kind = 'do' AND s.status = 'completed' AND NOT s.is_baseline;

-- 분할/합배송 묶음 (모두 같은 날짜여야 함)
SELECT
  CASE g.status WHEN 'pending' THEN '확인 전' WHEN 'approved' THEN '승인' ELSE '반려' END AS "상태",
  string_agg(DISTINCT e.detected_on::TEXT, ', ') AS "날짜",
  string_agg(
    e.order_no || ' L' || e.line_no::TEXT || ' ' || CASE e.direction WHEN 'delete' THEN '-' ELSE '+' END || e.qty::TEXT,
    ' / ' ORDER BY e.direction DESC, e.order_no, e.line_no
  ) AS "라인"
FROM public.do_change_groups g
JOIN public.do_change_events e ON e.candidate_group_id = g.id
WHERE g.group_type = 'split'
GROUP BY g.id, g.status
ORDER BY MIN(e.detected_on), "라인";
