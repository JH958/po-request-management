-- =====================================================================
-- 요청 최초 요청일 원복 (2026-10-23)
--
-- add_request_original_date.sql(운영에 실행됨, 레포에는 없음)로 추가한 최초 요청일·등록일 기준 판정·등록이 늦어진 이유를
-- 사용자 결정으로 되돌림: 요청일 = 요청 카드를 작성한 날(시스템이 정함, 고칠 수 없음)이고 프로즌 판정은 요청일 기준,
-- 등록일 = 요청이 DO에 반영된 날(연결된 DO 변경의 감지일)로 함.
-- 실행 시점까지 모든 요청의 최초 요청일이 요청일과 같아 잃는 데이터는 없습니다(아래 첫 결과로 확인).
--
-- 여러 번 실행해도 안전합니다.
-- =====================================================================

-- 지우기 전 확인: 최초 요청일이 요청일과 다른 요청 (0이어야 함 — 있으면 목록을 확인하고 실행)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'original_request_date') THEN
    RAISE NOTICE '최초 요청일이 요청일과 다른 요청: %건',
      (SELECT COUNT(*) FROM public.requests WHERE original_request_date IS DISTINCT FROM request_date);
  END IF;
END $$;

DROP TRIGGER IF EXISTS request_original_date_log ON public.requests;
DROP TRIGGER IF EXISTS request_original_date_guard ON public.requests;
DROP FUNCTION IF EXISTS public.request_original_date_log();
DROP FUNCTION IF EXISTS public.request_original_date_guard();

DROP TABLE IF EXISTS public.request_original_date_history;
DROP TABLE IF EXISTS public.request_rule_settings;

-- 대시보드 함수가 지울 열을 쓰고 있으므로 먼저 원래 모양으로
DROP FUNCTION IF EXISTS public.po_dashboard_requests(DATE, DATE);
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

REVOKE ALL ON FUNCTION public.po_dashboard_requests(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_dashboard_requests(DATE, DATE) TO authenticated;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_frozen_status_by_registration_check;
ALTER TABLE public.requests DROP COLUMN IF EXISTS delay_reason;
ALTER TABLE public.requests DROP COLUMN IF EXISTS frozen_status_by_registration;
ALTER TABLE public.requests DROP COLUMN IF EXISTS original_request_date;

COMMENT ON COLUMN public.requests.frozen_status IS '접수 시점 프로즌 판정 (요청일 기준): before(이전), after(이후), unset(미설정)';

-- 결과 확인 (모두 0이어야 함)
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'requests'
     AND column_name IN ('original_request_date', 'frozen_status_by_registration', 'delay_reason')) AS "남은 열",
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'
     AND tablename IN ('request_rule_settings', 'request_original_date_history')) AS "남은 테이블";
