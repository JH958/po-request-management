-- =====================================================================
-- PO Tracker: 영업관리팀 권한을 담당자 표 메일·관리자 승인으로 제한 (2026-10-26)
--
-- 지금까지는 가입할 때 부서를 '영업관리팀'으로 고르기만 하면 영업관리팀 권한(PO 변경·PO 현황·전체 조회·사유 입력)이 생겼음.
-- 앞으로 영업관리팀 권한 = 관리자, 또는 부서에 '영업관리'가 있으면서
--   ① 로그인 메일(인증 정보의 메일)이 고객처 담당자 표(customer_managers.manager_email)에 있거나
--   ② 관리자가 승인한 계정(user_profiles.sales_access_approved)
-- 승인은 관리자 설정 '영업관리팀 계정' 탭(po_sales_access_list / set_sales_access). 본인은 승인 칸을 바꿀 수 없음(po_profile_guard).
--
-- 선행: update_po_tracker_roles_accounts.sql (po_profile_guard), add_app_settings.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS sales_access_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS sales_access_by_name TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS sales_access_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.sales_access_approved IS '관리자가 영업관리팀 권한을 승인함 (고객처 담당자 표에 없는 영업관리팀 인원용)';

/**
 * 영업관리팀 또는 관리자 — PO 변경 페이지·후보 승인/반려·사유 입력, 전체 조회
 * 부서에 '영업관리'가 있고, 로그인 메일이 고객처 담당자 표에 있거나 관리자가 승인한 계정
 */
CREATE OR REPLACE FUNCTION public.po_is_sales_team()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_po_tracker_admin() OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.department LIKE '%영업관리%'
      AND (
        p.sales_access_approved
        OR EXISTS (
          SELECT 1 FROM public.customer_managers m
          WHERE lower(m.manager_email) = lower(NULLIF(btrim(COALESCE(auth.jwt() ->> 'email', '')), ''))
        )
      )
  );
$$;

COMMENT ON FUNCTION public.po_is_sales_team() IS '영업관리팀 또는 관리자 — 부서가 영업관리이고 로그인 메일이 고객처 담당자 표에 있거나 관리자 승인 (PO 변경·사유 입력·전체 조회)';

/**
 * 프로필 보호 (트리거) — 관리자가 아니면 역할·부서·영업관리팀 승인을 바꿀 수 없고, 가입은 항상 requester
 */
CREATE OR REPLACE FUNCTION public.po_profile_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_po_tracker_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'requester';
      NEW.sales_access_approved := FALSE;
      NEW.sales_access_by_name := NULL;
      NEW.sales_access_at := NULL;
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION '역할과 부서는 관리자만 바꿀 수 있습니다.' USING ERRCODE = '42501';
    ELSIF NEW.sales_access_approved IS DISTINCT FROM OLD.sales_access_approved
       OR NEW.sales_access_by_name IS DISTINCT FROM OLD.sales_access_by_name
       OR NEW.sales_access_at IS DISTINCT FROM OLD.sales_access_at THEN
      RAISE EXCEPTION '영업관리팀 승인은 관리자만 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.origin_code := (
    SELECT o.code FROM public.po_request_origins o
    WHERE o.department = NEW.department
    ORDER BY o.is_active DESC, o.sort_order
    LIMIT 1
  );
  RETURN NEW;
END;
$$;

/**
 * 영업관리팀 계정 목록 (관리자) — 부서가 영업관리이거나 승인된 계정, 담당자 표 등록 여부와 지금 권한
 */
CREATE OR REPLACE FUNCTION public.po_sales_access_list()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  department TEXT,
  created_at TIMESTAMPTZ,
  in_manager_list BOOLEAN,
  approved BOOLEAN,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  has_access BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, COALESCE(u.email::TEXT, p.email), p.department, p.created_at,
    EXISTS (SELECT 1 FROM public.customer_managers m WHERE lower(m.manager_email) = lower(COALESCE(u.email::TEXT, p.email))),
    p.sales_access_approved, p.sales_access_by_name, p.sales_access_at,
    ('admin' = ANY (string_to_array(replace(COALESCE(p.role, ''), ' ', ''), ',')))
      OR (p.department LIKE '%영업관리%' AND (
        p.sales_access_approved
        OR EXISTS (SELECT 1 FROM public.customer_managers m WHERE lower(m.manager_email) = lower(COALESCE(u.email::TEXT, p.email)))
      ))
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.department LIKE '%영업관리%' OR p.sales_access_approved
  ORDER BY 10, p.created_at DESC;
END;
$$;

/**
 * 영업관리팀 권한 승인·해제 (관리자)
 * @param p_user_id 계정 ID
 * @param p_approved 승인(TRUE) / 해제(FALSE)
 */
CREATE OR REPLACE FUNCTION public.set_sales_access(p_user_id UUID, p_approved BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '관리자만 승인할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();

  UPDATE public.user_profiles
  SET sales_access_approved = COALESCE(p_approved, FALSE),
      sales_access_by_name = v_name,
      sales_access_at = NOW()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.po_is_sales_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_is_sales_team() TO authenticated;
REVOKE ALL ON FUNCTION public.po_sales_access_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_sales_access_list() TO authenticated;
REVOKE ALL ON FUNCTION public.set_sales_access(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sales_access(UUID, BOOLEAN) TO authenticated;

-- 결과 확인: 지금 영업관리팀 부서 계정과 권한 (관리자 화면과 같은 기준)
SELECT p.full_name AS "이름", COALESCE(u.email::TEXT, p.email) AS "메일", p.department AS "부서",
  EXISTS (SELECT 1 FROM public.customer_managers m WHERE lower(m.manager_email) = lower(COALESCE(u.email::TEXT, p.email))) AS "담당자 표에 있음",
  p.sales_access_approved AS "관리자 승인"
FROM public.user_profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.department LIKE '%영업관리%';
