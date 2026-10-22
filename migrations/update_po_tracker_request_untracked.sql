-- =====================================================================
-- PO Tracker: 요청 연결 — DO 추적 전 요청 구분 (2026-10-22)
--
-- DO 추적은 첫 DO 업로드(기준선, 10/12)부터라 그 전에 연결 기간(요청일 + 45일)이 끝난 요청은
-- 앞으로도 변경과 연결될 수 없음 → 미반영 요청 목록에서 빼고, 요청 화면 DO 반영은 '추적 전'(untracked)으로
--
-- 선행: update_po_tracker_request_matching.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


/**
 * DO 추적 시작일 — 처음 완료된 DO 업로드(기준선)의 기준일. 업로드가 없으면 NULL
 * 요청일 + days_after가 이보다 이르면 그 요청은 DO 추적 전에 끝나 연결될 수 없음(추적 전)
 */
CREATE OR REPLACE FUNCTION public.po_tracking_start()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT MIN(snapshot_date) FROM public.po_source_uploads WHERE kind = 'do' AND status = 'completed'
$$;

/**
 * 미반영 요청 (영업관리팀) — 승인·완료됐고 SO가 있는데, 확정 출하일(없으면 희망·현재 출하일)이 지나도록 연결된 변경이 없는 요청
 * (DO 추적 시작 전에 연결 기간이 끝난 요청은 빼고 — 추적 전)
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
    AND NOT (r.request_date + (SELECT COALESCE(MAX(s.days_after), 45) FROM public.po_match_settings s) < public.po_tracking_start())
    AND NOT EXISTS (SELECT 1 FROM public.request_change_links l WHERE l.request_id = r.id AND l.status = 'linked')
  ORDER BY 10, r.request_date;
END;
$$;

/**
 * 요청별 DO 반영 상태 — 요청 화면용. 본인이 볼 수 있는 요청만 (요청 RLS와 같은 기준: 본인 요청, 검토자·관리자, 영업관리팀)
 * @returns reflection: no_so(SO 없음) / untracked(추적 전: DO 추적 시작 전에 연결 기간이 끝남, 연결 없음) / none(연결 없음) / partial(부분 반영: 연결 안 된 품목이 있거나 수량 다름) / reflected(반영됨)
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
      WHEN NOT EXISTS (SELECT 1 FROM lk WHERE lk.request_id = rq.id) THEN CASE
        WHEN rq.request_date + (SELECT COALESCE(MAX(s.days_after), 45) FROM public.po_match_settings s) < public.po_tracking_start() THEN 'untracked'
        ELSE 'none'
      END
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


REVOKE ALL ON FUNCTION public.po_tracking_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_unreflected_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_request_reflections(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_unreflected_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_request_reflections(UUID[]) TO authenticated;
