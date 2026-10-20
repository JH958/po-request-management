-- =====================================================================
-- PO Tracker C-2: 조회 범위 — 변경 데이터는 영업관리팀만, 대시보드는 범위 안의 집계만
--
-- 변경 내용 (2026-10-20 결정)
--   1) 업로드·변경 데이터(업로드 기록, 판매주문·DO 라인, 변경 이벤트, 후보, 사유, 고객처 매핑·담당자)는
--      영업관리팀·관리자만 직접 조회 (지금까지는 로그인 사용자 전체)
--   2) po_view_grants: 추가 조회 권한 (부서 단위 → 고객처), 관리자만 관리 (관리자 설정 '조회 권한')
--   3) PO 현황 대시보드용 함수 (조회 범위를 함수 안에서 적용)
--      - po_my_view_scope(): 내 조회 범위
--      - po_dashboard_changes(시작, 끝): 변경 1건 = 1행 (주문·품목 상세 없이 집계용 값만)
--      - po_dashboard_requests(시작, 끝): 요청 목록 (집계용 값만)
--      범위: 영업관리팀·관리자 = 전체 / 고객처 계정 = 자기 고객처 /
--            본사·국내법인 부서 = 요청 출처(변경)·요청 부서(요청)가 자기 부서 + 추가 조회 권한으로 열린 고객처
--
-- 선행: update_po_tracker_roles_accounts.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 추가 조회 권한
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_view_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_code TEXT NOT NULL REFERENCES public.po_request_origins(code) ON UPDATE CASCADE ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  note TEXT,
  granted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  granted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origin_code, customer_name)
);

COMMENT ON TABLE public.po_view_grants IS '추가 조회 권한 — 본사/국내법인 부서(요청 부서)에 특정 고객처의 변경·요청 통계를 열어 줌. 관리자만 관리';
COMMENT ON COLUMN public.po_view_grants.customer_name IS '판매주문조회 고객처 이름 (customer_so_map.customer_name / requests.customer)';

ALTER TABLE public.po_view_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can insert po_view_grants" ON public.po_view_grants;
DROP POLICY IF EXISTS "Admins can update po_view_grants" ON public.po_view_grants;
DROP POLICY IF EXISTS "Admins can delete po_view_grants" ON public.po_view_grants;
CREATE POLICY "Admins can insert po_view_grants" ON public.po_view_grants
  FOR INSERT WITH CHECK (public.is_po_tracker_admin());
CREATE POLICY "Admins can update po_view_grants" ON public.po_view_grants
  FOR UPDATE USING (public.is_po_tracker_admin());
CREATE POLICY "Admins can delete po_view_grants" ON public.po_view_grants
  FOR DELETE USING (public.is_po_tracker_admin());


-- ---------------------------------------------------------------------
-- 2. 조회 정책
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  -- 설정 테이블: 로그인 사용자 전체 (요청서·회원가입·화면 표시용)
  FOREACH t IN ARRAY ARRAY[
    'product_groups', 'category_class_settings', 'excluded_customers', 'item_class_overrides', 'po_change_type_settings',
    'po_change_type_rules', 'po_request_origins', 'po_customer_accounts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated users can view %1$s" ON public.%1$I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t
    );
  END LOOP;

  -- 업로드·변경 데이터: 영업관리팀·관리자만 (다른 사용자는 po_dashboard_* 함수로 범위 안의 집계만)
  FOREACH t IN ARRAY ARRAY[
    'po_source_uploads', 'customer_so_map', 'item_category_map', 'so_lines', 'do_lines',
    'do_order_lines', 'do_change_events', 'do_change_groups', 'do_change_group_reviews', 'po_change_reasons',
    'po_change_reason_history', 'customer_managers', 'po_view_grants'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sales team can view %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Sales team can view %1$s" ON public.%1$I FOR SELECT USING (public.po_is_sales_team())',
      t
    );
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. 대시보드용 함수
-- ---------------------------------------------------------------------
/**
 * 추가 조회 권한 저장 시 부여자 이름 기록
 */
CREATE OR REPLACE FUNCTION public.po_view_grants_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.granted_by := auth.uid();
  NEW.granted_by_name := (SELECT full_name FROM public.user_profiles WHERE id = auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_view_grants_stamp ON public.po_view_grants;
CREATE TRIGGER po_view_grants_stamp
  BEFORE INSERT ON public.po_view_grants
  FOR EACH ROW EXECUTE FUNCTION public.po_view_grants_stamp();

/**
 * 로그인 사용자의 PO 현황 조회 범위
 * @returns scope('all' 영업관리팀·관리자 / 'customer' 고객처 계정 / 'department' 본사·국내법인 / 'none'),
 *          customer_name(고객처 계정의 고객처), origin_code(부서), granted_customers(추가 조회 권한으로 열린 고객처)
 */
CREATE OR REPLACE FUNCTION public.po_my_view_scope()
RETURNS TABLE (scope TEXT, customer_name TEXT, origin_code TEXT, granted_customers TEXT[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.user_profiles;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::TEXT, NULL::TEXT, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF public.po_is_sales_team() THEN
    RETURN QUERY SELECT 'all'::TEXT, NULL::TEXT, NULL::TEXT, ARRAY[]::TEXT[];
  ELSIF v_profile.origin_code IS NOT NULL THEN
    RETURN QUERY SELECT 'department'::TEXT, NULL::TEXT, v_profile.origin_code,
      COALESCE((SELECT ARRAY_AGG(g.customer_name ORDER BY g.customer_name) FROM public.po_view_grants g
                WHERE g.origin_code = v_profile.origin_code), ARRAY[]::TEXT[]);
  ELSIF EXISTS (SELECT 1 FROM public.po_customer_accounts a WHERE a.customer_name = v_profile.department) THEN
    RETURN QUERY SELECT 'customer'::TEXT, v_profile.department, NULL::TEXT, ARRAY[]::TEXT[];
  ELSE
    RETURN QUERY SELECT 'none'::TEXT, NULL::TEXT, NULL::TEXT, ARRAY[]::TEXT[];
  END IF;
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
    AND (
      s.scope = 'all'
      OR (s.scope = 'customer' AND v.customer_name = s.customer_name)
      OR (s.scope = 'department' AND (v.reason_origin_code = s.origin_code OR v.customer_name = ANY (s.granted_customers)))
    )
  GROUP BY v.stat_unit_key;
END;
$$;

/**
 * PO 현황 대시보드용 요청 목록 (조회 범위 적용, 삭제된 요청 제외)
 *   - 영업관리팀·관리자: 전체
 *   - 고객처 계정: 자기 고객처 요청
 *   - 본사·국내법인 부서: 자기 부서가 요청한 건 + 추가 조회 권한으로 열린 고객처의 요청
 */
CREATE OR REPLACE FUNCTION public.po_dashboard_requests(p_from DATE, p_to DATE)
RETURNS TABLE (
  id UUID,
  request_date DATE,
  customer TEXT,
  requesting_dept TEXT,
  category_of_request TEXT,
  reason_for_request TEXT,
  priority TEXT,
  status TEXT,
  frozen_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s RECORD;
  v_department TEXT;
BEGIN
  SELECT * INTO s FROM public.po_my_view_scope();
  IF s.scope = 'none' THEN
    RETURN;
  END IF;
  SELECT department INTO v_department FROM public.user_profiles WHERE user_profiles.id = auth.uid();

  RETURN QUERY
  SELECT r.id, r.request_date, r.customer, r.requesting_dept, r.category_of_request, r.reason_for_request,
         r.priority, r.status, r.frozen_status::TEXT
  FROM public.requests r
  WHERE r.deleted_at IS NULL
    AND r.request_date BETWEEN p_from AND p_to
    AND (
      s.scope = 'all'
      OR (s.scope = 'customer' AND r.customer = s.customer_name)
      OR (s.scope = 'department' AND (r.requesting_dept = v_department OR r.customer = ANY (s.granted_customers)))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.po_my_view_scope() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_dashboard_changes(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_dashboard_requests(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_my_view_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_dashboard_changes(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_dashboard_requests(DATE, DATE) TO authenticated;
