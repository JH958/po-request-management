-- =====================================================================
-- PO Tracker: 수량 감소 판정 변경 + 분할/합배송 후보 + 2026-10-13 소급
--
-- 변경 내용 (2026-10-13 결정)
--   1) 기존 주문에 새 DO 라인이 생기면 판매주문조회와 관계없이 "라인 추가"
--   2) 라인이 남아 있고 수량만 줄면 바로 삭제(수량 감소). 라인이 DO에서 사라졌는데
--      판매주문에 미출고로 남아 있을 때만 재등록 대기 5영업일
--   3) 같은 날·같은 고객처·같은 품목의 삭제+추가를 분할/합배송 후보로 묶음
--      - 삭제 합계 = 추가 합계면 여러 라인도 한 묶음, 아니면 같은 수량 1:1
--      - 신규 주문(새 PO) 라인, 재등록 대기에 들어간 라인도 짝이 맞으면 포함
--      - 고객처를 모르면 품목·수량만으로 묶고 "고객처 미확인" 표시
--      - 담당자가 승인/반려 (review_change_group). 통계는 반려되지 않은 묶음을 1건으로 셈
--
-- 계기: ihcPO000000363 L4 480→420 (적재 16PLT 초과로 분할배송) + ihcPO000000347 L2 60 추가
--
-- 선행: migrations/add_po_tracker_do_tracking.sql, seed_po_tracker_settings.sql
-- 여러 번 실행해도 안전합니다 (객체는 교체, 소급은 이미 반영된 것은 건너뜀).
-- =====================================================================


-- 1) 후보 묶음 테이블
-- ---------------------------------------------------------------------
-- 6-1. 변경 후보 묶음 (분할/합배송·품목코드 변경) — 담당자가 승인/반려
--      통계: 반려되지 않은 분할/합배송 묶음은 1건으로 센다 (v_do_change_events.stat_unit_key)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.do_change_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.po_source_uploads(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL CHECK (group_type IN ('split', 'item_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  customer_unverified BOOLEAN NOT NULL DEFAULT FALSE,
  review_note TEXT,
  reviewed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS do_change_groups_upload_idx ON public.do_change_groups (upload_id);
CREATE INDEX IF NOT EXISTS do_change_groups_pending_idx ON public.do_change_groups (status) WHERE status = 'pending';

COMMENT ON TABLE public.do_change_groups IS '변경 이벤트 후보 묶음 — split(분할/합배송: 같은 날·같은 고객처·같은 품목 삭제+추가), item_change(품목코드 변경)';
COMMENT ON COLUMN public.do_change_groups.status IS 'pending(확인 전) / approved(승인) / rejected(반려: 각 이벤트를 개별 삭제·추가로 집계)';
COMMENT ON COLUMN public.do_change_groups.customer_unverified IS '한쪽 주문의 고객처를 판매주문조회에서 찾지 못해 품목·수량만으로 묶음';

-- 기존 후보 묶음 값(있다면)을 품목코드 변경 묶음으로 옮긴 뒤 외래키 연결
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'do_change_events_candidate_group_fk') THEN
    INSERT INTO public.do_change_groups (id, upload_id, group_type)
    SELECT DISTINCT ON (candidate_group_id) candidate_group_id, upload_id, 'item_change'
    FROM public.do_change_events
    WHERE candidate_group_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING;

    ALTER TABLE public.do_change_events
      ADD CONSTRAINT do_change_events_candidate_group_fk
      FOREIGN KEY (candidate_group_id) REFERENCES public.do_change_groups(id) ON DELETE SET NULL;
  END IF;
END $$;


-- 2) 조회용 뷰 (기존 컬럼 순서 유지 + 후보 묶음·통계 컬럼 추가)
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
  COALESCE(cs.product_class, '미분류') AS product_class,
  CASE
    WHEN cs.product_class IN ('제품', '상품') THEN 'product'
    WHEN cs.product_class = '자재' THEN 'material'
  END AS class_group,
  lbl.change_label,
  ex.is_excluded_customer,
  (cs.product_class = '제외') AS is_excluded_item,
  (ex.is_excluded_customer OR COALESCE(cs.product_class = '제외', FALSE)) AS is_excluded,
  g.group_type,
  g.status AS group_status,
  g.customer_unverified,
  -- 통계용: 반려되지 않은 분할/합배송 묶음은 묶음 단위 1건, 나머지는 이벤트 1건
  CASE WHEN g.group_type = 'split' AND g.status <> 'rejected' THEN '분할/합배송' ELSE lbl.change_label END AS stat_label,
  CASE
    WHEN g.group_type = 'split' AND g.status <> 'rejected' THEN 'group:' || g.id::TEXT
    ELSE 'event:' || e.id::TEXT
  END AS stat_unit_key
FROM public.do_change_events e
LEFT JOIN public.customer_so_map c ON c.order_no = e.order_no
LEFT JOIN public.item_category_map i ON i.item_no = COALESCE(e.item_after, e.item_no)
LEFT JOIN public.category_class_settings cs ON cs.category_model = i.category_model
LEFT JOIN public.product_groups pg
  ON pg.code = COALESCE(cs.group_code, NULLIF(split_part(i.category_model, '_', 1), ''))
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.excluded_customers x
    WHERE x.is_active
      AND (x.customer_name = c.customer_name OR (x.account_no IS NOT NULL AND x.account_no = c.account_no))
  ) AS is_excluded_customer
) ex
CROSS JOIN LATERAL (
  SELECT CASE e.direction
    WHEN 'add' THEN CASE
      WHEN cs.product_class IN ('제품', '상품') THEN '제품/상품 추가'
      WHEN cs.product_class = '자재' THEN '자재 추가'
      ELSE '추가(미분류)'
    END
    WHEN 'delete' THEN CASE
      WHEN cs.product_class IN ('제품', '상품') THEN '제품/상품 삭제'
      WHEN cs.product_class = '자재' THEN '자재 삭제'
      ELSE '삭제(미분류)'
    END
    WHEN 'date' THEN '배송일자 변경'
    WHEN 'mode' THEN '운송방법 변경'
    WHEN 'item' THEN '품목코드 변경'
  END AS change_label
) lbl
LEFT JOIN public.do_change_groups g ON g.id = e.candidate_group_id;

COMMENT ON VIEW public.v_do_change_events IS '변경 이벤트 + 고객처·품목군·구분·변경 유형 표시명·제외 여부·후보 묶음 — 통계는 stat_unit_key 기준으로 셀 것';

-- 3) 후보 묶음 테이블 RLS (조회: 로그인 사용자 / 쓰기: 처리·승인 함수로만)
ALTER TABLE public.do_change_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view do_change_groups" ON public.do_change_groups;
CREATE POLICY "Authenticated users can view do_change_groups" ON public.do_change_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- 4) 판정·후보·승인 함수
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
 * 후보 묶음 승인·반려 (담당자 확인) — 반려하면 통계에서 각 이벤트를 개별 삭제·추가로 센다
 */
CREATE OR REPLACE FUNCTION public.review_change_group(p_group_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '검토 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION '알 수 없는 상태입니다: %', p_status;
  END IF;

  UPDATE public.do_change_groups
  SET
    status = p_status,
    review_note = p_note,
    reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
    reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE NOW() END
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '후보 묶음을 찾을 수 없습니다.';
  END IF;
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
 *   - 같은 날·같은 고객처·같은 품목의 삭제+추가는 분할/합배송 후보로 묶음 (po_group_split_candidates)
 *   - 요청받은 배송 일자·납품 모드: 값이 바뀐 수량만큼 변경 이벤트
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
      SELECT * INTO v_shift FROM public.po_dist_shift(r.conf_date, r.cur_date);
      IF v_shift.moved > 0 THEN
        PERFORM public.po_insert_change_event(
          p_upload_id, v_date, r.order_no, r.line_no, v_do, r.cur_item, r.cur_item_name, r.is_transfer,
          'delivery_date_changed', v_shift.moved,
          p_date_before => NULLIF(v_shift.from_key, '(없음)')::DATE,
          p_date_after => NULLIF(v_shift.to_key, '(없음)')::DATE,
          p_detail => jsonb_build_object('before', r.conf_date, 'after', r.cur_date)
        );
      END IF;

      SELECT * INTO v_shift FROM public.po_dist_shift(r.conf_mode, r.cur_mode);
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

  -- 10) 분할/합배송 후보: 같은 날·같은 고객처·같은 품목의 삭제+추가
  PERFORM public.po_group_split_candidates(p_upload_id);

  -- 10-1) 품목코드 변경 후보: 남은 이벤트 중 같은 SO에서 삭제와 추가 수량이 같고 품목이 다른 쌍
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

-- 5) 함수 실행 권한
REVOKE ALL ON FUNCTION public.po_group_split_candidates(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_change_group(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_change_group(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_do_snapshot(UUID, INT) TO authenticated;


-- 6) 소급: 이전 규칙으로 처리된 업로드를 새 규칙 결과로 맞춤
DO $$
DECLARE
  u RECORD;
  r RECORD;
BEGIN
  -- 6-1) 기존 주문에 새로 생겼는데 이벤트가 없는 라인 → 라인 추가
  INSERT INTO public.do_change_events (
    upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
    change_type, direction, qty, qty_before, qty_after, detail
  )
  SELECT
    up.id, up.snapshot_date, o.order_no, o.line_no,
    (SELECT d.do_no FROM public.do_lines d
      WHERE d.order_no = o.order_no AND d.line_no = o.line_no
      ORDER BY d.updated_at DESC LIMIT 1),
    o.item_no, o.item_name, o.is_transfer,
    'line_added', 'add', o.confirmed_qty, 0, o.confirmed_qty,
    jsonb_build_object('date_dist', o.confirmed_date_dist, 'mode_dist', o.confirmed_mode_dist, 'backfilled', TRUE)
  FROM public.do_order_lines o
  JOIN public.po_source_uploads up
    ON up.id = o.first_seen_upload_id AND up.kind = 'do' AND up.status = 'completed' AND NOT up.is_baseline
  WHERE o.confirmed_qty > 0
    AND EXISTS (
      SELECT 1 FROM public.do_order_lines p
      WHERE p.order_no = o.order_no AND p.first_seen_date < up.snapshot_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.do_change_events e
      WHERE e.upload_id = up.id AND e.order_no = o.order_no AND e.line_no = o.line_no
    );

  -- 6-2) 라인이 남아 있는데 재등록 대기 중인 건 → 대기를 시작한 날짜로 수량 감소 확정
  FOR r IN
    SELECT
      o.order_no, o.line_no, o.item_no, o.item_name, o.is_transfer, o.confirmed_qty,
      o.pending_since_upload_id, up.snapshot_date,
      cur.qty AS cur_qty, cur.do_no, cur.all_closed
    FROM public.do_order_lines o
    JOIN public.po_source_uploads up ON up.id = o.pending_since_upload_id
    CROSS JOIN LATERAL (
      SELECT
        SUM(d.ordered_qty)::INT AS qty,
        (ARRAY_AGG(d.do_no ORDER BY d.is_closed, d.do_no DESC))[1] AS do_no,
        BOOL_AND(d.is_closed) AS all_closed
      FROM public.do_lines d
      WHERE d.order_no = o.order_no AND d.line_no = o.line_no AND d.removed_upload_id IS NULL
    ) cur
    WHERE o.status = 'pending' AND cur.qty > 0 AND cur.qty < o.confirmed_qty
  LOOP
    INSERT INTO public.do_change_events (
      upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
      change_type, direction, qty, qty_before, qty_after, detail
    ) VALUES (
      r.pending_since_upload_id, r.snapshot_date, r.order_no, r.line_no, r.do_no, r.item_no, r.item_name, r.is_transfer,
      'qty_decreased', 'delete', r.confirmed_qty - r.cur_qty, r.confirmed_qty, r.cur_qty,
      jsonb_build_object('backfilled', TRUE, 'pending_released', TRUE)
    );

    UPDATE public.do_order_lines o
    SET
      confirmed_qty = r.cur_qty,
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
      status = CASE WHEN r.all_closed THEN 'closed' ELSE 'active' END,
      pending_since_upload_id = NULL,
      pending_count = 0,
      changed_upload_id = r.pending_since_upload_id,
      updated_at = NOW()
    WHERE o.order_no = r.order_no AND o.line_no = r.line_no;
  END LOOP;

  -- 6-3) 업로드별 분할/합배송 후보 묶기 + 요약 다시 계산
  FOR u IN
    SELECT id FROM public.po_source_uploads
    WHERE kind = 'do' AND status = 'completed' AND NOT is_baseline
    ORDER BY snapshot_date
  LOOP
    PERFORM public.po_group_split_candidates(u.id);

    UPDATE public.po_source_uploads s
    SET summary = s.summary
      || jsonb_build_object(
        'events', COALESCE((
          SELECT jsonb_object_agg(change_type, cnt)
          FROM (
            SELECT change_type, COUNT(*) AS cnt
            FROM public.do_change_events WHERE upload_id = s.id
            GROUP BY change_type
          ) e
        ), '{}'::jsonb),
        'item_change_candidates', (
          SELECT COUNT(*) FROM public.do_change_groups WHERE upload_id = s.id AND group_type = 'item_change'
        ),
        'split_candidates', (
          SELECT COUNT(*) FROM public.do_change_groups WHERE upload_id = s.id AND group_type = 'split'
        ),
        'pending_lines', (SELECT COUNT(*) FROM public.do_order_lines WHERE status = 'pending')
      )
    WHERE s.id = u.id;
  END LOOP;
END $$;
