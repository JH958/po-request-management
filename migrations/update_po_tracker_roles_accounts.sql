-- =====================================================================
-- PO Tracker C-1: 관리자/영업관리팀 권한 분리 + 계정 종류(요청 부서·고객처 계정) 정리
--
-- 변경 내용 (2026-10-20 결정)
--   1) 권한
--      - 관리자 = role에 admin (우선 jhee105@inbody.com만): 데이터 업로드, 관리자 설정 전체(조회 권한 부여 포함)
--      - 영업관리팀 = 부서에 '영업관리' 또는 관리자: PO 변경 페이지, 후보 승인/반려, 사유 입력, 전체 조회
--      - is_po_tracker_admin()은 관리자만, po_is_sales_team() 추가
--      - 관리자 설정 테이블(프로즌 데이트·PO 변경 사유·요청구분)의 수정 권한도 관리자만
--   2) 고객처 계정 목록 po_customer_accounts (관리자 설정 '고객처 계정', 초기값 기존 회원가입 목록 29곳)
--   3) 계정 종류: user_profiles.origin_code = 요청 부서(po_request_origins) 연결
--      부서명이 요청 부서 목록에 있으면 본사/국내법인, 고객처 계정 목록에 있으면 고객처
--      기존 부서 이동: 혈압계팀 → 생산관리팀(코르트), W팀 → 제조팀 (요청서의 요청 부서도 같이)
--   4) 보안 보완
--      - 회원가입 시 메타데이터의 role을 받지 않음 (항상 requester)
--      - 관리자가 아니면 본인 프로필의 역할·부서를 바꿀 수 없음
--   5) 회원가입 화면(로그인 전)에서 사용 중인 부서·고객처 목록을 읽을 수 있게 함
--
-- 선행: update_po_tracker_clear_reasons.sql
-- 여러 번 실행해도 안전합니다. 마지막 결과 표에서 부서가 목록과 맞지 않는 계정과 관리자 계정을 확인하세요.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 권한 헬퍼
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_po_tracker_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND 'admin' = ANY (string_to_array(replace(COALESCE(role, ''), ' ', ''), ','))
  );
$$;

COMMENT ON FUNCTION public.is_po_tracker_admin() IS '관리자(role에 admin) — 데이터 업로드·관리자 설정 전체·조회 권한 부여';

/**
 * 영업관리팀 또는 관리자 — PO 변경 페이지·후보 승인/반려·사유 입력, 전체 조회
 */
CREATE OR REPLACE FUNCTION public.po_is_sales_team()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_po_tracker_admin() OR EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND department LIKE '%영업관리%'
  );
$$;

COMMENT ON FUNCTION public.po_is_sales_team() IS '영업관리팀 또는 관리자 — PO 변경 페이지·후보 승인/반려·사유 입력, 전체 조회';


-- ---------------------------------------------------------------------
-- 2. 고객처 계정
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_customer_accounts (
  customer_name TEXT PRIMARY KEY,
  account_no TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_customer_accounts IS '회원가입·요청서에서 고르는 고객처 계정 (고객처 이름 = 판매주문조회 고객처 이름 = 계정의 부서명) — 관리자 설정 ''고객처 계정''';

-- 고객처 계정 (기존 회원가입 목록 29곳, 계정 번호는 고객처 담당자 표에서 이름으로 찾음)
INSERT INTO public.po_customer_accounts (customer_name, account_no, sort_order)
SELECT v.name, (SELECT m.account_no FROM public.customer_managers m WHERE m.customer_name = v.name ORDER BY m.account_no LIMIT 1), v.ord
FROM (VALUES
  ('일본(일본법인)', 1),
  ('미국(미국법인)', 2),
  ('중국(중국법인)', 3),
  ('말레이시아(아시아법인)', 4),
  ('인도(인도법인)', 5),
  ('네덜란드(유럽법인)', 6),
  ('멕시코(멕시코법인)', 7),
  ('중국(중국법인_생산)', 8),
  ('독일(유럽법인_독일지사)', 9),
  ('주식회사 코르트', 10),
  ('호주(호주법인)', 11),
  ('미국(미국동부법인)', 12),
  ('주식회사 인바디헬스케어', 13),
  ('영국(유럽법인_영국지사)', 14),
  ('베트남(베트남법인)', 15),
  ('튀르키예(튀르키예법인)', 16),
  ('국내_인바디 서부지사', 17),
  ('국내_인바디 남부지사', 18),
  ('국내_인바디 강남지사', 19),
  ('국내_인바디 대전지사', 20),
  ('국내_인바디 대구지사', 21),
  ('국내_인바디 광주지사', 22),
  ('국내_인바디 강북지사', 23),
  ('국내_인바디 강서지사', 24),
  ('국내_인바디 강원지사', 25),
  ('국내_인바디 중부지사', 26),
  ('국내_인바디 부산지사', 27),
  ('태국(InBody Thailand Co., Ltd.)', 28),
  ('인도네시아(PT. InBody Global Healthcare)', 29)
) AS v(name, ord)
ON CONFLICT (customer_name) DO NOTHING;

ALTER TABLE public.po_customer_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view po_customer_accounts" ON public.po_customer_accounts;
CREATE POLICY "Authenticated users can view po_customer_accounts" ON public.po_customer_accounts
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins can insert po_customer_accounts" ON public.po_customer_accounts;
DROP POLICY IF EXISTS "Admins can update po_customer_accounts" ON public.po_customer_accounts;
DROP POLICY IF EXISTS "Admins can delete po_customer_accounts" ON public.po_customer_accounts;
CREATE POLICY "Admins can insert po_customer_accounts" ON public.po_customer_accounts
  FOR INSERT WITH CHECK (public.is_po_tracker_admin());
CREATE POLICY "Admins can update po_customer_accounts" ON public.po_customer_accounts
  FOR UPDATE USING (public.is_po_tracker_admin());
CREATE POLICY "Admins can delete po_customer_accounts" ON public.po_customer_accounts
  FOR DELETE USING (public.is_po_tracker_admin());

-- 회원가입 화면(로그인 전)에서 부서·고객처 목록을 고를 수 있도록 사용 중인 항목만 공개
DROP POLICY IF EXISTS "Anyone can view active po_request_origins" ON public.po_request_origins;
CREATE POLICY "Anyone can view active po_request_origins" ON public.po_request_origins
  FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS "Anyone can view active po_customer_accounts" ON public.po_customer_accounts;
CREATE POLICY "Anyone can view active po_customer_accounts" ON public.po_customer_accounts
  FOR SELECT TO anon USING (is_active);

DROP TRIGGER IF EXISTS update_po_customer_accounts_updated_at ON public.po_customer_accounts;
CREATE TRIGGER update_po_customer_accounts_updated_at
  BEFORE UPDATE ON public.po_customer_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------
-- 3. 계정 종류: 프로필 ↔ 요청 부서 연결, 역할·부서 변경 보호
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS origin_code TEXT REFERENCES public.po_request_origins(code) ON UPDATE CASCADE ON DELETE SET NULL;

COMMENT ON COLUMN public.user_profiles.origin_code IS '요청 부서(po_request_origins) — 있으면 본사/국내법인 계정, 부서명이 고객처 계정 목록에 있으면 고객처 계정';

/**
 * 프로필 저장 전 — 부서명으로 요청 부서를 연결하고, 관리자가 아니면 역할·부서를 바꾸지 못하게 함
 * (SQL Editor처럼 로그인 사용자가 없는 실행은 허용)
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
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION '역할과 부서는 관리자만 바꿀 수 있습니다.' USING ERRCODE = '42501';
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

DROP TRIGGER IF EXISTS po_profile_guard ON public.user_profiles;
CREATE TRIGGER po_profile_guard
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.po_profile_guard();

-- 회원가입: 메타데이터의 role은 받지 않음 (역할은 관리자가 부여)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, department, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '사용자'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'department', ''), '미지정'),
    'requester'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 목록에 없는 기존 부서 이동 (요청서의 요청 부서도 같이)
UPDATE public.user_profiles SET department = '생산관리팀' WHERE department = '혈압계팀';
UPDATE public.user_profiles SET department = '제조팀' WHERE department = 'W팀';
UPDATE public.requests SET requesting_dept = '생산관리팀' WHERE requesting_dept = '혈압계팀';
UPDATE public.requests SET requesting_dept = '제조팀' WHERE requesting_dept = 'W팀';

-- 기존 계정의 요청 부서 연결 (트리거가 채움)
UPDATE public.user_profiles SET department = department;

-- 관리자: jhee105@inbody.com
UPDATE public.user_profiles
SET role = CASE
  WHEN 'admin' = ANY (string_to_array(replace(COALESCE(role, ''), ' ', ''), ',')) THEN role
  WHEN COALESCE(role, '') = '' THEN 'admin'
  ELSE role || ',admin'
END
WHERE lower(email) = 'jhee105@inbody.com';


-- ---------------------------------------------------------------------
-- 4. 관리자 설정 테이블 수정 권한 → 관리자만
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.frozen_date_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can insert frozen date settings" ON public.frozen_date_settings;
    CREATE POLICY "Admins can insert frozen date settings" ON public.frozen_date_settings FOR INSERT WITH CHECK (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can update frozen date settings" ON public.frozen_date_settings;
    CREATE POLICY "Admins can update frozen date settings" ON public.frozen_date_settings FOR UPDATE USING (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can delete frozen date settings" ON public.frozen_date_settings;
    CREATE POLICY "Admins can delete frozen date settings" ON public.frozen_date_settings FOR DELETE USING (public.is_po_tracker_admin());
  END IF;
  IF to_regclass('public.request_reason_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can insert request reasons" ON public.request_reason_settings;
    CREATE POLICY "Admins can insert request reasons" ON public.request_reason_settings FOR INSERT WITH CHECK (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can update request reasons" ON public.request_reason_settings;
    CREATE POLICY "Admins can update request reasons" ON public.request_reason_settings FOR UPDATE USING (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can delete request reasons" ON public.request_reason_settings;
    CREATE POLICY "Admins can delete request reasons" ON public.request_reason_settings FOR DELETE USING (public.is_po_tracker_admin());
  END IF;
  IF to_regclass('public.request_type_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can insert request types" ON public.request_type_settings;
    CREATE POLICY "Admins can insert request types" ON public.request_type_settings FOR INSERT WITH CHECK (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can update request types" ON public.request_type_settings;
    CREATE POLICY "Admins can update request types" ON public.request_type_settings FOR UPDATE USING (public.is_po_tracker_admin());
    DROP POLICY IF EXISTS "Admins can delete request types" ON public.request_type_settings;
    CREATE POLICY "Admins can delete request types" ON public.request_type_settings FOR DELETE USING (public.is_po_tracker_admin());
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 5. 후보 승인·사유 입력 함수 → 영업관리팀
-- ---------------------------------------------------------------------
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

  -- 존재하는 변경 1건 키인지 (group:묶음, event:이벤트, shift:일정·운송방법 묶음)
  SELECT COUNT(*) INTO v_found
  FROM unnest(v_keys) k
  WHERE CASE
    WHEN k ~ '^group:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_groups g WHERE g.id = substring(k FROM 7)::UUID)
    WHEN k ~ '^event:[0-9a-f-]{36}$' THEN EXISTS (SELECT 1 FROM public.do_change_events e WHERE e.id = substring(k FROM 7)::UUID)
    WHEN k LIKE 'shift:%' THEN EXISTS (SELECT 1 FROM public.v_do_change_events v WHERE v.stat_unit_key = k)
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
  IF NOT public.po_is_sales_team() THEN
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

/**
 * 후보 묶음 승인·반려·되돌리기 (담당자 확인) — 반려하면 통계에서 각 이벤트를 개별 삭제·추가로 센다
 * 승인·반려는 메모 필수. 처리자 이름은 묶음에 저장하고 모든 처리를 이력에 남긴다
 * 사유(p_reason)를 함께 넘기면 메모를 상세 사유로 하여 묶음의 변경 사유도 저장한다
 * (반려되면 각 라인이 묶음 사유를 물려받음)
 */
CREATE OR REPLACE FUNCTION public.review_change_group(
  p_group_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL,
  p_origin_code TEXT DEFAULT NULL
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
END;
$$;


-- ---------------------------------------------------------------------
-- 6. 확인: 관리자 계정, 부서가 목록과 맞지 않는 계정
-- ---------------------------------------------------------------------
SELECT '관리자' AS "구분", p.full_name AS "이름", p.email AS "메일", p.department AS "부서", p.role AS "역할"
FROM public.user_profiles p
WHERE 'admin' = ANY (string_to_array(replace(COALESCE(p.role, ''), ' ', ''), ','))
UNION ALL
SELECT '부서 확인 필요', p.full_name, p.email, p.department, p.role
FROM public.user_profiles p
WHERE p.origin_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.po_customer_accounts a WHERE a.customer_name = p.department)
ORDER BY 1, 4, 2;
