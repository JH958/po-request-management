-- =====================================================================
-- PO Tracker: 변경 사유 지우기
--
-- clear_change_reasons(): 잘못 입력한 사유를 미입력으로 되돌림 (지운 기록은 po_change_reason_history에 source='cleared')
--
-- 선행: update_po_tracker_change_reasons.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================

/**
 * 변경 사유 지우기 (여러 건 한 번에) — 잘못 입력한 사유를 미입력으로 되돌림, 지운 기록은 이력에 남김
 * @param p_keys 변경 1건 키 목록 (v_do_change_events.stat_unit_key)
 * @returns 지운 건수
 */
CREATE OR REPLACE FUNCTION public.clear_change_reasons(p_keys TEXT[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_count INT;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '사유 입력 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.po_change_reason_history (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name)
  SELECT r.stat_unit_key, r.reason, r.note, r.origin_type, r.origin_code, 'cleared', auth.uid(), v_name
  FROM public.po_change_reasons r
  WHERE r.stat_unit_key = ANY(p_keys);

  DELETE FROM public.po_change_reasons WHERE stat_unit_key = ANY(p_keys);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_change_reasons(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_change_reasons(TEXT[]) TO authenticated;
