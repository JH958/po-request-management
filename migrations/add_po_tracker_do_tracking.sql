-- =====================================================================
-- PO Tracker: DO 업로드·비교(변경 이벤트) 스키마
--
-- 실행 순서
--   1) 이 파일
--   2) migrations/seed_po_tracker_settings.sql (품목군·세부분류 매핑·추적 제외 고객처·변경 유형·요청 부서 초기값)
--   3) migrations/seed_customer_managers.sql (고객처 담당자 초기값)
--
-- 처리 흐름 (영업일 매일, 판매주문조회 → DO등록현황조회 순서)
--   start_po_upload()        업로드 기록 생성 + Storage 경로 발급
--   (브라우저) 원본 xlsx를 po-tracker-uploads 버킷에 저장, 필요한 열만 JSON으로 정리
--   apply_so_snapshot()      판매주문조회: 고객처·품목 카테고리 매핑, 미출고 SO 라인 갱신
--   stage_po_upload_chunk()  DO 행을 약 3,000행씩 나눠 적재 (요청 크기 제한 대응)
--   apply_do_snapshot()      DO등록현황조회: 적재한 행을 직전 상태와 비교해 변경 이벤트 생성
--   review_change_group()    분할/합배송·품목코드 변경 후보 승인/반려 (담당자 확인, 사유 함께 저장)
--   set_change_reasons()     변경 1건마다 사유·메모·요청 출처 입력 (영업관리팀)
--   clear_change_reasons()   잘못 입력한 사유 지우기 (이력에 남김)
--   po_dashboard_changes() / po_dashboard_requests()  PO 현황 대시보드용 (조회 범위 적용)
--   dismiss_changes() / restore_changes()  "변경 아님(정정)" 처리·해제 (영업관리팀)
--   set_order_destination()  경유 고객처 주문의 실제 고객처 건별 지정 (영업관리팀)
--   (3단계) 요청 ↔ 변경 연결: DO 업로드·요청 등록 때 자동 연결(po_run_auto_link), link_change_request() /
--            unlink_change_request() / set_change_exemptions()(예외 처리) / rematch_change_requests()(다시 매칭)
--   fail_po_upload()         처리 실패 시 업로드 기록을 실패로 표시
--
-- PO 변경 판단 단위는 판매주문 라인(주문번호+라인번호)이며 DO는 합산해서 본다.
-- DO 분할·재배정은 라인 합계가 같으면 변경이 아니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 권한 헬퍼 (2026-10-20 분리: 관리자 = role에 admin, 영업관리팀 = 부서에 영업관리 또는 관리자)
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
-- 1. 업로드 이력
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_source_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('do', 'sales_order')),
  snapshot_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  storage_path TEXT,
  row_count INT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  summary JSONB,
  error_message TEXT,
  uploaded_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS po_source_uploads_completed_date_uniq
  ON public.po_source_uploads (kind, snapshot_date) WHERE status = 'completed';
CREATE UNIQUE INDEX IF NOT EXISTS po_source_uploads_completed_hash_uniq
  ON public.po_source_uploads (kind, file_hash) WHERE status = 'completed';

COMMENT ON TABLE public.po_source_uploads IS 'DO등록현황조회·판매주문조회 업로드 이력';
COMMENT ON COLUMN public.po_source_uploads.snapshot_date IS '파일 기준일(파일명 끝 YYMMDD)';
COMMENT ON COLUMN public.po_source_uploads.is_baseline IS '첫 DO 업로드: 현재 상태만 적재하고 변경 이벤트는 만들지 않음';
COMMENT ON COLUMN public.po_source_uploads.summary IS '처리 결과 요약(유형별 이벤트 수, 신규 주문 수, 재등록 대기 라인 수 등)';


-- ---------------------------------------------------------------------
-- 2. 관리자 설정: 품목군 / 세부분류 → 구분 / 추적 제외 고객처 / 품목 구분 예외 / 변경 유형 / 고객처 담당자
--    / 요청 부서 / 변경 사유 / 고객처 계정 / 추가 조회 권한 / 경유 고객처·도착지
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_groups (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.product_groups IS '품목군 코드(카테고리 모델 접두어) 표시명';

CREATE TABLE IF NOT EXISTS public.category_class_settings (
  category_model TEXT PRIMARY KEY,
  group_code TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  product_class TEXT NOT NULL CHECK (product_class IN ('제품', '상품', '자재', '제외')),
  basis TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.category_class_settings IS '카테고리 모델(품목군코드_세부분류) → 제품/상품/자재/제외 구분';
COMMENT ON COLUMN public.category_class_settings.basis IS '초기값 근거(담당자 답변/규칙/서비스 품목/제안값)';

CREATE TABLE IF NOT EXISTS public.excluded_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL UNIQUE,
  account_no TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.excluded_customers IS '변경 추적·통계에서 제외할 고객처 (이름 또는 계정 번호로 매칭)';


CREATE TABLE IF NOT EXISTS public.item_class_overrides (
  item_no TEXT PRIMARY KEY,
  product_class TEXT NOT NULL CHECK (product_class IN ('제품', '상품', '자재', '제외')),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_class_overrides IS '품목번호 → 구분 예외 지정 (카테고리 모델 구분보다 우선)';

CREATE TABLE IF NOT EXISTS public.po_change_type_settings (
  code TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  label TEXT NOT NULL UNIQUE,
  label_en TEXT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_change_type_settings IS 'PO 변경 유형 = 요청접수 요청구분 (화면 필터·통계·요청 카드). code ''other''(기타)는 연결 없는 기준이 모이는 곳이라 지우지 않음';
ALTER TABLE public.po_change_type_settings ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN public.po_change_type_settings.description IS '요청접수 카드 툴팁에 보이는 설명 (요청구분 = PO 변경 유형)';

CREATE TABLE IF NOT EXISTS public.po_change_type_rules (
  rule_key TEXT PRIMARY KEY CHECK (rule_key IN (
    'add_product', 'add_material', 'add_other',
    'delete_product', 'delete_material', 'delete_other',
    'item_change', 'date_change', 'mode_change', 'split'
  )),
  type_code TEXT REFERENCES public.po_change_type_settings(code) ON DELETE SET NULL ON UPDATE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_change_type_rules IS '시스템 판정 기준 → 변경 유형 연결 (없으면 기타)';
COMMENT ON COLUMN public.po_change_type_rules.rule_key IS
  'add_/delete_product(제품·상품) material(자재) other(미분류·제외), item_change(품목코드 변경 후보·품목 변경), date_change(요청 배송일), mode_change(납품 모드), split(분할/합배송 후보)';


CREATE TABLE IF NOT EXISTS public.customer_managers (
  account_no TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  manager_email TEXT NOT NULL CHECK (manager_email ~* '^[^@[:space:]]+@[^@[:space:]]+$'),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS customer_managers_email_idx ON public.customer_managers (lower(manager_email));

COMMENT ON TABLE public.customer_managers IS '고객처(판매주문조회 계정 번호) → 영업관리팀 담당자. 담당자 메일 = 이 사이트 로그인 메일';


CREATE TABLE IF NOT EXISTS public.po_request_origins (
  code TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  department TEXT NOT NULL,
  company TEXT NOT NULL,
  display_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  -- 분류의 기능 부분 (예: '본사_생산' → '생산') — 생산부 필터·통계용
  function_group TEXT GENERATED ALWAYS AS (NULLIF(btrim(substring(category FROM '_([^_]+)$')), '')) STORED,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  UNIQUE (company, department)
);

COMMENT ON TABLE public.po_request_origins IS '변경 요청 출처 부서 (본사·국내법인) — 표시명·분류는 관리자 설정 ''요청 부서''에서 관리';
COMMENT ON COLUMN public.po_request_origins.category IS '분류 (회사구분_기능, 예: 본사_생산·국내법인_영업관리)';

CREATE TABLE IF NOT EXISTS public.po_change_reasons (
  stat_unit_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  note TEXT NOT NULL CHECK (btrim(note) <> ''),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('customer', 'department')),
  origin_code TEXT REFERENCES public.po_request_origins(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'request')),
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (origin_type = 'customer' OR origin_code IS NOT NULL)
);

COMMENT ON TABLE public.po_change_reasons IS '변경 1건(v_do_change_events.stat_unit_key)의 사유·메모·요청 출처 — set_change_reasons()로만 기록. 묶음이 반려되면 각 라인이 묶음 사유를 물려받음';
COMMENT ON COLUMN public.po_change_reasons.reason IS 'PO 변경 사유 (request_reason_settings.value)';
COMMENT ON COLUMN public.po_change_reasons.source IS 'manual(영업관리팀 입력) / request(요청서에서 가져옴 — 3단계)';

CREATE TABLE IF NOT EXISTS public.po_change_reason_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_unit_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL,
  origin_type TEXT NOT NULL,
  origin_code TEXT,
  source TEXT NOT NULL,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_change_reason_history_key_idx ON public.po_change_reason_history (stat_unit_key, created_at);

COMMENT ON TABLE public.po_change_reason_history IS '변경 사유 입력·수정 이력';
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


CREATE TABLE IF NOT EXISTS public.po_customer_accounts (
  customer_name TEXT PRIMARY KEY,
  account_no TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_customer_accounts IS '회원가입·요청서에서 고르는 고객처 계정 (고객처 이름 = 판매주문조회 고객처 이름 = 계정의 부서명) — 관리자 설정 ''고객처 계정''';


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


-- ---------------------------------------------------------------------
-- 2-2. 요청 ↔ DO 변경 연결 (3단계, 2026-10-22)
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
-- 3. 판매주문조회에서 누적하는 매핑 / 미출고 SO 라인
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_so_map (
  order_no TEXT PRIMARY KEY,
  account_no TEXT,
  customer_name TEXT,
  first_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  last_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  last_seen_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.customer_so_map IS '판매주문번호 → 고객처(계정 번호·이름), 판매주문조회 업로드로 누적';

CREATE TABLE IF NOT EXISTS public.item_category_map (
  item_no TEXT PRIMARY KEY,
  item_name TEXT,
  category_model TEXT,
  item_type TEXT,
  last_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_category_map IS '품목번호 → 카테고리 모델, 누적 저장 (없으면 미분류)';
COMMENT ON COLUMN public.item_category_map.item_type IS '판매주문조회 품목유형(ITEM/SERVICE)';

CREATE TABLE IF NOT EXISTS public.so_lines (
  order_no TEXT NOT NULL,
  line_no INT NOT NULL,
  item_no TEXT NOT NULL,
  item_name TEXT,
  ordered_qty INT NOT NULL DEFAULT 0,
  shipped_qty INT NOT NULL DEFAULT 0,
  remaining_qty INT NOT NULL DEFAULT 0,
  line_status TEXT,
  header_status TEXT,
  first_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  first_seen_date DATE,
  last_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_no, line_no, item_no)
);

CREATE INDEX IF NOT EXISTS so_lines_order_item_idx ON public.so_lines (order_no, item_no);

COMMENT ON TABLE public.so_lines IS '판매주문조회의 미출고(INVOICED 아님) SO 라인 최신 상태 — DO 재등록 대기·신규 라인 판정용';
COMMENT ON COLUMN public.so_lines.line_no IS '판매주문조회 라인번호(정수로 반올림되어 나옴 — DO와는 주문번호+품목번호로 연결)';
COMMENT ON COLUMN public.so_lines.ordered_qty IS '입고예정(주문 수량)';
COMMENT ON COLUMN public.so_lines.remaining_qty IS '잔여 배송';


CREATE TABLE IF NOT EXISTS public.po_via_customers (
  customer_name TEXT PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_via_customers IS '경유 고객처 — 판매주문 고객처만으로는 실제 도착지를 알 수 없어 표시명 뒤에 실제 고객처·국가를 붙이는 곳 (인바디헬스케어·코르트)';

CREATE TABLE IF NOT EXISTS public.po_country_names (
  country_code TEXT PRIMARY KEY,
  name_ko TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.po_country_names IS '판매주문조회 국가/지역 코드(ISO 3자리) → 한글 국가명';

CREATE TABLE IF NOT EXISTS public.po_destination_map (
  match_key TEXT PRIMARY KEY,
  target_customer TEXT,
  choice_candidates TEXT[],
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CHECK (target_customer IS NOT NULL OR COALESCE(array_length(choice_candidates, 1), 0) > 0)
);

COMMENT ON TABLE public.po_destination_map IS '경유 고객처 주문의 도착지 → 실제 고객처. match_key는 도착항 코드(예: O_LGB, 우선) 또는 국가 코드(예: JPN). target_customer가 없고 choice_candidates가 있으면 건별 선택';

CREATE TABLE IF NOT EXISTS public.po_order_destinations (
  order_no TEXT PRIMARY KEY,
  target_customer TEXT NOT NULL,
  set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  set_by_name TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.po_order_destinations IS '경유 고객처 주문의 실제 고객처를 건별로 고른 값 (PO 변경 화면, 영업관리팀) — 도착지 연결표보다 우선';

ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS dest_port TEXT;
ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS dest_country TEXT;
ALTER TABLE public.customer_so_map ADD COLUMN IF NOT EXISTS customer_name2 TEXT;
COMMENT ON COLUMN public.customer_so_map.dest_port IS '판매주문조회 도착항 (O_=Ocean, A_=Air, 빈칸이면 국내)';
COMMENT ON COLUMN public.customer_so_map.dest_country IS '판매주문조회 국가/지역 (ISO 3자리)';
COMMENT ON COLUMN public.customer_so_map.customer_name2 IS '판매주문조회 이름2 (경유 고객처는 "_대만(KOLY)"처럼 실제 고객처를 적기도 함)';


-- ---------------------------------------------------------------------
-- 4. DO 라인 현재 상태 (DO 파일 행 단위)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.do_lines (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT NOT NULL,
  line_no NUMERIC(12, 4) NOT NULL,
  do_no TEXT NOT NULL,
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_mode TEXT,
  header_status TEXT,
  line_status TEXT,
  ship_warehouse TEXT,
  receive_warehouse TEXT,
  ship_date DATE,
  receive_date DATE,
  requested_delivery_date DATE,
  item_no TEXT NOT NULL,
  item_name TEXT,
  ordered_qty INT NOT NULL DEFAULT 0,
  registered_qty INT NOT NULL DEFAULT 0,
  shipped_qty INT NOT NULL DEFAULT 0,
  sales_confirmed BOOLEAN,
  logistics_confirmed BOOLEAN,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  merged_row_count INT NOT NULL DEFAULT 1,
  first_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  changed_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  removed_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  closed_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_no, line_no, do_no)
);

CREATE INDEX IF NOT EXISTS do_lines_order_line_idx ON public.do_lines (order_no, line_no);
CREATE INDEX IF NOT EXISTS do_lines_open_idx ON public.do_lines (is_closed) WHERE removed_upload_id IS NULL;

COMMENT ON TABLE public.do_lines IS 'DO등록현황조회 행 단위 현재 상태 (주문번호+라인번호+배송오더번호, 중복 소수 라인은 수량 합산)';
COMMENT ON COLUMN public.do_lines.is_transfer IS '참조=이전(Transfer) (TRO)';
COMMENT ON COLUMN public.do_lines.ordered_qty IS '이전 수량(고객 발주 수량)';
COMMENT ON COLUMN public.do_lines.registered_qty IS '등록 수량(출하 시 바코드 스캔 수량)';
COMMENT ON COLUMN public.do_lines.changed_upload_id IS '값이 마지막으로 바뀐 업로드 (변화 없는 행은 다시 쓰지 않음)';
COMMENT ON COLUMN public.do_lines.removed_upload_id IS '파일에서 사라진 업로드 (NULL이면 최신 파일에 존재)';


-- ---------------------------------------------------------------------
-- 5. 판매주문 라인 확정 상태 (변경 판단 기준)
--    이벤트는 "직전 확정 상태 → 현재 상태"의 순변경으로 만든다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.do_order_lines (
  order_no TEXT NOT NULL,
  line_no NUMERIC(12, 4) NOT NULL,
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  item_no TEXT,
  item_name TEXT,
  confirmed_qty INT NOT NULL DEFAULT 0,
  confirmed_date_dist JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_mode_dist JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'closed', 'removed')),
  pending_since_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  pending_count INT NOT NULL DEFAULT 0,
  first_seen_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  first_seen_date DATE,
  changed_upload_id UUID REFERENCES public.po_source_uploads(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_no, line_no)
);

CREATE INDEX IF NOT EXISTS do_order_lines_pending_idx ON public.do_order_lines (status) WHERE status = 'pending';

COMMENT ON TABLE public.do_order_lines IS '판매주문 라인(주문번호+라인번호) 단위 확정 상태 — DO 합산 기준';
COMMENT ON COLUMN public.do_order_lines.confirmed_date_dist IS '요청받은 배송 일자별 수량 {"YYYY-MM-DD": 수량}';
COMMENT ON COLUMN public.do_order_lines.confirmed_mode_dist IS '납품 모드별 수량 {"Ocean": 수량}';
COMMENT ON COLUMN public.do_order_lines.status IS 'active(진행) / pending(DO 재등록 대기) / closed(종료) / removed(파일에서 사라짐)';
COMMENT ON COLUMN public.do_order_lines.pending_count IS '재등록 대기 시작 후 지난 업로드 수 — 5회(5영업일)가 되면 변경 확정';
COMMENT ON COLUMN public.do_order_lines.changed_upload_id IS '확정 상태·진행 상태가 마지막으로 바뀐 업로드';


-- ---------------------------------------------------------------------
-- 5-1. DO 업로드 임시 적재 (요청 크기 제한 때문에 나눠 보낸 행을 모았다가 반영 후 삭제)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_upload_chunks (
  upload_id UUID NOT NULL REFERENCES public.po_source_uploads(id) ON DELETE CASCADE,
  chunk_no INT NOT NULL,
  rows JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (upload_id, chunk_no)
);

COMMENT ON TABLE public.po_upload_chunks IS 'DO 행 임시 적재 — stage_po_upload_chunk()로 넣고 apply_do_snapshot()이 반영 후 삭제';


-- ---------------------------------------------------------------------
-- 6. 변경 이벤트 (누적, 수정하지 않음)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.do_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.po_source_uploads(id) ON DELETE CASCADE,
  detected_on DATE NOT NULL,
  order_no TEXT NOT NULL,
  line_no NUMERIC(12, 4) NOT NULL,
  do_no TEXT,
  item_no TEXT,
  item_name TEXT,
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'line_added', 'line_removed', 'qty_increased', 'qty_decreased', 'shipment_shortfall',
    'delivery_date_changed', 'delivery_mode_changed', 'item_changed'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('add', 'delete', 'date', 'mode', 'item')),
  qty INT NOT NULL CHECK (qty >= 0),
  qty_before INT,
  qty_after INT,
  date_before DATE,
  date_after DATE,
  mode_before TEXT,
  mode_after TEXT,
  item_before TEXT,
  item_after TEXT,
  detail JSONB,
  candidate_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS do_change_events_detected_on_idx ON public.do_change_events (detected_on);
CREATE INDEX IF NOT EXISTS do_change_events_order_idx ON public.do_change_events (order_no, line_no);
CREATE INDEX IF NOT EXISTS do_change_events_upload_idx ON public.do_change_events (upload_id);
CREATE INDEX IF NOT EXISTS do_change_events_group_idx ON public.do_change_events (candidate_group_id)
  WHERE candidate_group_id IS NOT NULL;

COMMENT ON TABLE public.do_change_events IS 'DO 비교로 감지한 PO 변경 이벤트';
COMMENT ON COLUMN public.do_change_events.qty IS '변경 대상 수량(항상 0 이상): 추가·삭제 수량, 배송일자·운송방법이 바뀐 수량, 품목코드 변경 수량';
COMMENT ON COLUMN public.do_change_events.direction IS 'add(추가) / delete(삭제) / date(배송일자) / mode(운송방법) / item(품목코드)';
COMMENT ON COLUMN public.do_change_events.candidate_group_id IS '분할/합배송 또는 품목코드 변경 후보 묶음 (do_change_groups)';


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
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS do_change_groups_upload_idx ON public.do_change_groups (upload_id);
CREATE INDEX IF NOT EXISTS do_change_groups_pending_idx ON public.do_change_groups (status) WHERE status = 'pending';

COMMENT ON TABLE public.do_change_groups IS '변경 이벤트 후보 묶음 — split(분할/합배송: 같은 날·같은 고객처·같은 품목 삭제+추가), item_change(품목코드 변경)';
COMMENT ON COLUMN public.do_change_groups.status IS 'pending(확인 전) / approved(승인) / rejected(반려: 각 이벤트를 개별 삭제·추가로 집계)';
COMMENT ON COLUMN public.do_change_groups.customer_unverified IS '한쪽 주문의 고객처를 판매주문조회에서 찾지 못해 품목·수량만으로 묶음';

ALTER TABLE public.do_change_groups ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
COMMENT ON COLUMN public.do_change_groups.reviewed_by_name IS '처리자 이름 (처리 시점 user_profiles.full_name — 다른 사용자 프로필은 RLS로 못 읽으므로 저장)';

CREATE TABLE IF NOT EXISTS public.do_change_group_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.do_change_groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewer_department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS do_change_group_reviews_group_idx ON public.do_change_group_reviews (group_id, created_at);

COMMENT ON TABLE public.do_change_group_reviews IS '후보 묶음 처리 이력 (승인·반려·되돌리기) — review_change_group()으로만 기록';

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


-- ---------------------------------------------------------------------
-- 7. 조회용 뷰: 고객처·구분(품목 예외 우선)·변경 유형·제외 여부를 조회 시점 설정으로 붙인다
--    (설정을 바꾸면 과거 이벤트에도 바로 반영)
-- ---------------------------------------------------------------------
-- 주문별 도착지·실제 고객처·표시명
-- 판단 순서: 건별 선택 → 이름2 메모가 후보 고객처와 맞음 → 도착지 연결표(도착항 우선, 국가) → 국가명 → 도착항 빈칸이면 국내
-- (도착 정보를 아직 받지 못한 주문은 고객처명 그대로)
CREATE OR REPLACE VIEW public.v_order_destinations
WITH (security_invoker = true)
AS
SELECT
  c.order_no,
  c.customer_name,
  c.dest_port,
  c.dest_country,
  COALESCE(cn.name_ko, c.dest_country) AS dest_country_name,
  (vc.customer_name IS NOT NULL) AS is_via_customer,
  rule.choice_candidates,
  od.target_customer AS chosen_customer,
  od.set_by_name AS chosen_by_name,
  od.set_at AS chosen_at,
  t.actual_customer,
  (vc.customer_name IS NOT NULL AND t.actual_customer IS NULL
    AND COALESCE(array_length(rule.choice_candidates, 1), 0) > 0 AND c.dest_port IS NOT NULL) AS needs_destination_choice,
  CASE
    WHEN vc.customer_name IS NULL THEN c.customer_name
    -- 도착 정보가 아직 안 들어온 주문(이 기능 이전 업로드, 이름2도 비어 있음)은 고객처명 그대로
    WHEN c.customer_name2 IS NULL AND c.dest_port IS NULL AND c.dest_country IS NULL THEN c.customer_name
    ELSE c.customer_name || '_' || COALESCE(
      t.actual_customer,
      CASE WHEN c.dest_port IS NULL THEN '국내' END,
      cn.name_ko,
      c.dest_country,
      '국내'
    )
  END AS display_customer_name
FROM public.customer_so_map c
LEFT JOIN public.po_via_customers vc ON vc.customer_name = c.customer_name
LEFT JOIN public.po_country_names cn ON cn.country_code = c.dest_country
LEFT JOIN public.po_order_destinations od ON od.order_no = c.order_no
LEFT JOIN LATERAL (
  SELECT m.target_customer, m.choice_candidates
  FROM public.po_destination_map m
  WHERE m.match_key IN (c.dest_port, c.dest_country)
  ORDER BY (m.match_key = c.dest_port) DESC
  LIMIT 1
) rule ON vc.customer_name IS NOT NULL AND c.dest_port IS NOT NULL
CROSS JOIN LATERAL (
  SELECT COALESCE(
    od.target_customer,
    -- 이름2 "고객처_대만(KOLY)" → 후보 중 이름이 그렇게 시작하는 고객처 (공백·대소문자·닫는 괄호 무시)
    (SELECT cand FROM unnest(COALESCE(rule.choice_candidates, ARRAY[]::TEXT[]) || ARRAY[rule.target_customer]) cand
      WHERE cand IS NOT NULL
        AND position('_' IN COALESCE(c.customer_name2, '')) > 0
        AND lower(replace(cand, ' ', '')) LIKE
            lower(replace(replace(split_part(c.customer_name2, '_', 2), ' ', ''), ')', '')) || '%'
        AND length(split_part(c.customer_name2, '_', 2)) >= 2
      LIMIT 1),
    rule.target_customer
  ) AS actual_customer
) t;

COMMENT ON VIEW public.v_order_destinations IS '주문별 도착항·국가·실제 고객처·표시명 (경유 고객처는 "고객처_실제 고객처/국가/국내")';


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


CREATE OR REPLACE VIEW public.v_customers_without_manager
WITH (security_invoker = true)
AS
SELECT
  c.account_no,
  MAX(c.customer_name) AS customer_name,
  COUNT(*)::INT AS order_count,
  MAX(c.last_seen_date) AS last_seen_date
FROM public.customer_so_map c
LEFT JOIN public.customer_managers m ON m.account_no = c.account_no
WHERE c.account_no IS NOT NULL AND m.account_no IS NULL
GROUP BY c.account_no;

COMMENT ON VIEW public.v_customers_without_manager IS '판매주문조회에 나왔지만 담당자가 지정되지 않은 고객처 (관리자 설정 > 고객처 담당자)';


-- ---------------------------------------------------------------------
-- 8. updated_at 트리거 (schema.sql의 update_updated_at_column 재사용)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_product_groups_updated_at ON public.product_groups;
CREATE TRIGGER update_product_groups_updated_at
  BEFORE UPDATE ON public.product_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_category_class_settings_updated_at ON public.category_class_settings;
CREATE TRIGGER update_category_class_settings_updated_at
  BEFORE UPDATE ON public.category_class_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_excluded_customers_updated_at ON public.excluded_customers;
CREATE TRIGGER update_excluded_customers_updated_at
  BEFORE UPDATE ON public.excluded_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_item_category_map_updated_at ON public.item_category_map;
CREATE TRIGGER update_item_category_map_updated_at
  BEFORE UPDATE ON public.item_category_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


DROP TRIGGER IF EXISTS update_po_customer_accounts_updated_at ON public.po_customer_accounts;
CREATE TRIGGER update_po_customer_accounts_updated_at
  BEFORE UPDATE ON public.po_customer_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_po_request_origins_updated_at ON public.po_request_origins;
CREATE TRIGGER update_po_request_origins_updated_at
  BEFORE UPDATE ON public.po_request_origins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_managers_updated_at ON public.customer_managers;
CREATE TRIGGER update_customer_managers_updated_at
  BEFORE UPDATE ON public.customer_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_item_class_overrides_updated_at ON public.item_class_overrides;
CREATE TRIGGER update_item_class_overrides_updated_at
  BEFORE UPDATE ON public.item_class_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_po_change_type_settings_updated_at ON public.po_change_type_settings;
CREATE TRIGGER update_po_change_type_settings_updated_at
  BEFORE UPDATE ON public.po_change_type_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_po_change_type_rules_updated_at ON public.po_change_type_rules;
CREATE TRIGGER update_po_change_type_rules_updated_at
  BEFORE UPDATE ON public.po_change_type_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------
-- 9. RLS
--    조회: 설정 테이블은 로그인 사용자 전체, 업로드·변경 데이터는 영업관리팀·관리자만
--          (나머지는 po_dashboard_changes / po_dashboard_requests로 조회 범위 안의 집계만)
--    설정 테이블 쓰기: 관리자·영업관리팀
--    업로드·라인·이벤트 쓰기: 아래 처리 함수(SECURITY DEFINER)로만
-- ---------------------------------------------------------------------
ALTER TABLE public.po_source_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_class_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excluded_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_so_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.so_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_change_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_change_group_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_class_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_request_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_view_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_via_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_country_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_destination_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_order_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_dismissal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_reason_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_type_override_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_match_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_change_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_change_link_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_change_exemption_history ENABLE ROW LEVEL SECURITY;
-- 임시 적재 테이블은 정책 없음: 처리 함수로만 접근
ALTER TABLE public.po_upload_chunks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  -- 설정 테이블: 로그인 사용자 전체 (요청서·회원가입·화면 표시용)
  FOREACH t IN ARRAY ARRAY[
    'product_groups', 'category_class_settings', 'excluded_customers', 'item_class_overrides', 'po_change_type_settings',
    'po_change_type_rules', 'po_request_origins', 'po_customer_accounts', 'po_via_customers', 'po_country_names',
    'po_destination_map', 'po_match_settings'
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
    'po_change_reason_history', 'customer_managers', 'po_view_grants', 'po_change_dismissals', 'po_change_dismissal_history',
    'po_order_destinations', 'po_change_type_overrides', 'po_change_type_override_history', 'request_change_links',
    'request_change_link_history', 'po_change_exemptions', 'po_change_exemption_history'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sales team can view %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Sales team can view %1$s" ON public.%1$I FOR SELECT USING (public.po_is_sales_team())',
      t
    );
  END LOOP;

  -- 관리자 설정 화면에서 직접 수정하는 테이블 (품목 카테고리는 미분류 품목 수동 지정용 수정만 허용)
  FOREACH t IN ARRAY ARRAY[
    'product_groups', 'category_class_settings', 'excluded_customers',
    'item_class_overrides', 'po_change_type_settings', 'po_change_type_rules', 'customer_managers',
    'po_request_origins', 'po_customer_accounts', 'po_view_grants', 'po_via_customers', 'po_country_names',
    'po_destination_map', 'po_match_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can delete %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admins can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_po_tracker_admin())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Admins can update %1$s" ON public.%1$I FOR UPDATE USING (public.is_po_tracker_admin())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Admins can delete %1$s" ON public.%1$I FOR DELETE USING (public.is_po_tracker_admin())',
      t
    );
  END LOOP;

  DROP POLICY IF EXISTS "Admins can update item_category_map" ON public.item_category_map;
  CREATE POLICY "Admins can update item_category_map" ON public.item_category_map
    FOR UPDATE USING (public.is_po_tracker_admin());
END $$;

-- 회원가입 화면(로그인 전)에서 부서·고객처 목록을 고를 수 있도록 사용 중인 항목만 공개
DROP POLICY IF EXISTS "Anyone can view active po_request_origins" ON public.po_request_origins;
CREATE POLICY "Anyone can view active po_request_origins" ON public.po_request_origins
  FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS "Anyone can view active po_customer_accounts" ON public.po_customer_accounts;
CREATE POLICY "Anyone can view active po_customer_accounts" ON public.po_customer_accounts
  FOR SELECT TO anon USING (is_active);


-- ---------------------------------------------------------------------
-- 10. Storage: 원본 파일 보관 (비공개 버킷)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-tracker-uploads', 'po-tracker-uploads', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "PO Tracker admins can upload source files" ON storage.objects;
DROP POLICY IF EXISTS "PO Tracker admins can read source files" ON storage.objects;

CREATE POLICY "PO Tracker admins can upload source files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'po-tracker-uploads' AND public.is_po_tracker_admin());

CREATE POLICY "PO Tracker admins can read source files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'po-tracker-uploads' AND public.is_po_tracker_admin());


-- ---------------------------------------------------------------------
-- 11. 처리 함수
-- ---------------------------------------------------------------------

/**
 * 업로드 기록 생성 — 같은 파일·이미 처리한 기준일 이전 파일은 거부하고 Storage 경로를 발급
 */
CREATE OR REPLACE FUNCTION public.start_po_upload(
  p_kind TEXT,
  p_snapshot_date DATE,
  p_file_name TEXT,
  p_file_hash TEXT
)
RETURNS public.po_source_uploads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest DATE;
  v_row public.po_source_uploads;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('do', 'sales_order') THEN
    RAISE EXCEPTION '알 수 없는 파일 종류입니다: %', p_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.po_source_uploads
    WHERE kind = p_kind AND file_hash = p_file_hash AND status = 'completed'
  ) THEN
    RAISE EXCEPTION '이미 처리된 파일입니다. (%)', p_file_name;
  END IF;

  SELECT MAX(snapshot_date) INTO v_latest
  FROM public.po_source_uploads
  WHERE kind = p_kind AND status = 'completed';

  IF v_latest IS NOT NULL AND p_snapshot_date <= v_latest THEN
    RAISE EXCEPTION '기준일 %은(는) 마지막으로 처리한 기준일 % 이후여야 합니다.', p_snapshot_date, v_latest;
  END IF;

  -- 중단된 이전 시도 정리
  UPDATE public.po_source_uploads
  SET status = 'failed', error_message = COALESCE(error_message, '새 업로드 시작으로 중단 처리됨')
  WHERE kind = p_kind AND status = 'processing';

  INSERT INTO public.po_source_uploads (kind, snapshot_date, file_name, file_hash, uploaded_by)
  VALUES (p_kind, p_snapshot_date, p_file_name, p_file_hash, auth.uid())
  RETURNING * INTO v_row;

  UPDATE public.po_source_uploads
  SET storage_path = format('%s/%s/%s.xlsx', p_kind, to_char(p_snapshot_date, 'YYYY-MM-DD'), v_row.id)
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

/**
 * 처리 실패 기록
 */
CREATE OR REPLACE FUNCTION public.fail_po_upload(p_upload_id UUID, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.po_source_uploads
  SET status = 'failed', error_message = p_message
  WHERE id = p_upload_id AND status = 'processing';

  DELETE FROM public.po_upload_chunks WHERE upload_id = p_upload_id;
END;
$$;

/**
 * DO 행 나눠 보내기 — 한 번에 약 3,000행씩 (같은 chunk_no를 다시 보내면 덮어씀)
 */
CREATE OR REPLACE FUNCTION public.stage_po_upload_chunk(p_upload_id UUID, p_chunk_no INT, p_rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.po_source_uploads
    WHERE id = p_upload_id AND kind = 'do' AND status = 'processing'
  ) THEN
    RAISE EXCEPTION '처리할 수 없는 업로드입니다. (DO 업로드가 아니거나 이미 처리됨)';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DO 행 형식이 올바르지 않습니다.';
  END IF;

  INSERT INTO public.po_upload_chunks (upload_id, chunk_no, rows)
  VALUES (p_upload_id, p_chunk_no, p_rows)
  ON CONFLICT (upload_id, chunk_no) DO UPDATE SET rows = EXCLUDED.rows, created_at = NOW();
END;
$$;

/**
 * 판매주문조회 반영
 *
 * p_orders: [{ord, acct, name, port, cty, name2}] (port=도착항, cty=국가/지역, name2=이름2)                              판매주문 → 고객처 (전체 주문)
 * p_items:  [{item, nm, cat, typ}]                           품목 → 카테고리 모델·품목유형 (전체 품목)
 * p_lines:  [{ord, ln, item, nm, q_ord, q_shp, q_rem, ls, hs}] 미출고 SO 라인 (상태_라인이 INVOICED가 아니거나 잔여 배송 > 0)
 */
CREATE OR REPLACE FUNCTION public.apply_so_snapshot(
  p_upload_id UUID,
  p_orders JSONB,
  p_items JSONB,
  p_lines JSONB,
  p_row_count INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_up public.po_source_uploads;
  v_summary JSONB;
BEGIN
  IF NOT public.is_po_tracker_admin() THEN
    RAISE EXCEPTION '업로드 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_up FROM public.po_source_uploads WHERE id = p_upload_id FOR UPDATE;
  IF v_up.id IS NULL OR v_up.kind <> 'sales_order' OR v_up.status <> 'processing' THEN
    RAISE EXCEPTION '처리할 수 없는 업로드입니다. (판매주문조회 업로드가 아니거나 이미 처리됨)';
  END IF;

  -- 판매주문 → 고객처
  INSERT INTO public.customer_so_map AS m
    (order_no, account_no, customer_name, dest_port, dest_country, customer_name2,
     first_seen_upload_id, last_seen_upload_id, last_seen_date)
  SELECT DISTINCT ON (o.ord) o.ord, o.acct, o.name, NULLIF(btrim(o.port), ''), NULLIF(btrim(o.cty), ''), NULLIF(btrim(o.name2), ''),
         p_upload_id, p_upload_id, v_up.snapshot_date
  FROM jsonb_to_recordset(p_orders) AS o(ord TEXT, acct TEXT, name TEXT, port TEXT, cty TEXT, name2 TEXT)
  WHERE o.ord IS NOT NULL
  ORDER BY o.ord
  ON CONFLICT (order_no) DO UPDATE SET
    account_no = EXCLUDED.account_no,
    customer_name = EXCLUDED.customer_name,
    dest_port = EXCLUDED.dest_port,
    dest_country = EXCLUDED.dest_country,
    customer_name2 = EXCLUDED.customer_name2,
    last_seen_upload_id = EXCLUDED.last_seen_upload_id,
    last_seen_date = EXCLUDED.last_seen_date,
    updated_at = NOW();

  -- 품목 → 카테고리 모델 (파일에 값이 없으면 기존 값 유지)
  INSERT INTO public.item_category_map AS m (item_no, item_name, category_model, item_type, last_seen_upload_id)
  SELECT DISTINCT ON (i.item) i.item, i.nm, NULLIF(i.cat, ''), i.typ, p_upload_id
  FROM jsonb_to_recordset(p_items) AS i(item TEXT, nm TEXT, cat TEXT, typ TEXT)
  WHERE i.item IS NOT NULL
  ORDER BY i.item, (i.cat IS NULL)
  ON CONFLICT (item_no) DO UPDATE SET
    item_name = EXCLUDED.item_name,
    category_model = COALESCE(EXCLUDED.category_model, m.category_model),
    item_type = COALESCE(EXCLUDED.item_type, m.item_type),
    last_seen_upload_id = EXCLUDED.last_seen_upload_id;

  -- 미출고 SO 라인 (같은 주문·라인·품목은 합산, 취소가 아닌 상태 우선)
  INSERT INTO public.so_lines AS s (
    order_no, line_no, item_no, item_name, ordered_qty, shipped_qty, remaining_qty,
    line_status, header_status, first_seen_upload_id, first_seen_date, last_seen_upload_id
  )
  SELECT
    l.ord, l.ln, l.item,
    (ARRAY_AGG(l.nm))[1],
    COALESCE(SUM(l.q_ord), 0)::INT,
    COALESCE(SUM(l.q_shp), 0)::INT,
    COALESCE(SUM(l.q_rem), 0)::INT,
    (ARRAY_AGG(l.ls ORDER BY (l.ls = 'CANCELED')))[1],
    (ARRAY_AGG(l.hs))[1],
    p_upload_id, v_up.snapshot_date, p_upload_id
  FROM jsonb_to_recordset(p_lines) AS l(
    ord TEXT, ln INT, item TEXT, nm TEXT, q_ord INT, q_shp INT, q_rem INT, ls TEXT, hs TEXT
  )
  WHERE l.ord IS NOT NULL AND l.item IS NOT NULL
  GROUP BY l.ord, l.ln, l.item
  ON CONFLICT (order_no, line_no, item_no) DO UPDATE SET
    item_name = EXCLUDED.item_name,
    ordered_qty = EXCLUDED.ordered_qty,
    shipped_qty = EXCLUDED.shipped_qty,
    remaining_qty = EXCLUDED.remaining_qty,
    line_status = EXCLUDED.line_status,
    header_status = EXCLUDED.header_status,
    last_seen_upload_id = EXCLUDED.last_seen_upload_id,
    updated_at = NOW();

  -- 이번 파일에 없는 라인은 출하 완료·삭제된 것으로 보고 제거
  DELETE FROM public.so_lines WHERE last_seen_upload_id IS DISTINCT FROM p_upload_id;

  v_summary := jsonb_build_object(
    'orders', (SELECT COUNT(*) FROM public.customer_so_map WHERE last_seen_upload_id = p_upload_id),
    'items', (SELECT COUNT(*) FROM public.item_category_map WHERE last_seen_upload_id = p_upload_id),
    'open_so_lines', (SELECT COUNT(*) FROM public.so_lines),
    'unclassified_items', (
      SELECT COUNT(*)
      FROM public.item_category_map i
      LEFT JOIN public.category_class_settings cs ON cs.category_model = i.category_model
      WHERE i.last_seen_upload_id = p_upload_id AND cs.category_model IS NULL
    )
  );

  UPDATE public.po_source_uploads
  SET status = 'completed', row_count = p_row_count, summary = v_summary, completed_at = NOW()
  WHERE id = p_upload_id;

  RETURN v_summary;
END;
$$;

/**
 * 변경 이벤트 1건 기록 (apply_do_snapshot 내부 전용)
 */
CREATE OR REPLACE FUNCTION public.po_insert_change_event(
  p_upload_id UUID,
  p_detected_on DATE,
  p_order_no TEXT,
  p_line_no NUMERIC,
  p_do_no TEXT,
  p_item_no TEXT,
  p_item_name TEXT,
  p_is_transfer BOOLEAN,
  p_change_type TEXT,
  p_qty INT,
  p_qty_before INT DEFAULT NULL,
  p_qty_after INT DEFAULT NULL,
  p_date_before DATE DEFAULT NULL,
  p_date_after DATE DEFAULT NULL,
  p_mode_before TEXT DEFAULT NULL,
  p_mode_after TEXT DEFAULT NULL,
  p_item_before TEXT DEFAULT NULL,
  p_item_after TEXT DEFAULT NULL,
  p_detail JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.do_change_events (
    upload_id, detected_on, order_no, line_no, do_no, item_no, item_name, is_transfer,
    change_type, direction, qty, qty_before, qty_after, date_before, date_after,
    mode_before, mode_after, item_before, item_after, detail
  ) VALUES (
    p_upload_id, p_detected_on, p_order_no, p_line_no, p_do_no, p_item_no, p_item_name, p_is_transfer,
    p_change_type,
    CASE p_change_type
      WHEN 'line_added' THEN 'add'
      WHEN 'qty_increased' THEN 'add'
      WHEN 'line_removed' THEN 'delete'
      WHEN 'qty_decreased' THEN 'delete'
      WHEN 'shipment_shortfall' THEN 'delete'
      WHEN 'delivery_date_changed' THEN 'date'
      WHEN 'delivery_mode_changed' THEN 'mode'
      WHEN 'item_changed' THEN 'item'
    END,
    p_qty, p_qty_before, p_qty_after, p_date_before, p_date_after,
    p_mode_before, p_mode_after, p_item_before, p_item_after, p_detail
  );
$$;

/**
 * 분포 비교 — 수량을 유지한 채 다른 값(배송일자·운송방법)으로 옮겨간 수량과 대표 전/후 값
 * 예: {"2026-10-15": 10} → {"2026-10-15": 6, "2026-10-08": 4} 이면 4개가 10-15 → 10-08
 */
CREATE OR REPLACE FUNCTION public.po_dist_shift(p_before JSONB, p_after JSONB)
RETURNS TABLE (moved INT, from_key TEXT, to_key TEXT)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH k AS (
    SELECT
      s.key,
      COALESCE((p_after ->> s.key)::INT, 0) - COALESCE((p_before ->> s.key)::INT, 0) AS diff
    FROM (
      SELECT jsonb_object_keys(p_before) AS key
      UNION
      SELECT jsonb_object_keys(p_after)
    ) s
  )
  SELECT
    LEAST(
      COALESCE(SUM(-diff) FILTER (WHERE diff < 0), 0),
      COALESCE(SUM(diff) FILTER (WHERE diff > 0), 0)
    )::INT,
    (SELECT key FROM k WHERE diff < 0 ORDER BY diff, key LIMIT 1),
    (SELECT key FROM k WHERE diff > 0 ORDER BY diff DESC, key LIMIT 1)
  FROM k;
$$;

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
 * PO를 통째로 나눈 분할은 한 묶음으로 (apply_do_snapshot 내부 전용, 분할 후보 묶은 뒤 실행)
 *
 * 같은 업로드의 확인 전 분할/합배송 묶음끼리 주문번호가 하나라도 겹치면 하나로 합친다.
 * (같은 주문을 공유하면 같은 고객처) 이미 승인·반려된 묶음은 건드리지 않는다. 반환값: 합쳐서 없앤 묶음 수
 */
CREATE OR REPLACE FUNCTION public.po_merge_split_groups(p_upload_id UUID)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_merged INT := 0;
  v_keep UUID;
  v_drop UUID;
BEGIN
  LOOP
    v_keep := NULL;
    v_drop := NULL;

    -- 주문번호를 공유하는 두 묶음 (먼저 만든 쪽으로 합침)
    SELECT g1.id, g2.id INTO v_keep, v_drop
    FROM public.do_change_groups g1
    JOIN public.do_change_groups g2
      ON g2.upload_id = g1.upload_id
     AND (g2.created_at, g2.id) > (g1.created_at, g1.id)
    WHERE g1.upload_id = p_upload_id
      AND g1.group_type = 'split' AND g2.group_type = 'split'
      AND g1.status = 'pending' AND g2.status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.do_change_events a
        JOIN public.do_change_events b ON b.order_no = a.order_no
        WHERE a.candidate_group_id = g1.id AND b.candidate_group_id = g2.id
      )
    ORDER BY g1.created_at, g1.id
    LIMIT 1;

    EXIT WHEN v_keep IS NULL;

    UPDATE public.do_change_events SET candidate_group_id = v_keep WHERE candidate_group_id = v_drop;
    UPDATE public.do_change_groups k
    SET customer_unverified = k.customer_unverified OR d.customer_unverified
    FROM public.do_change_groups d
    WHERE k.id = v_keep AND d.id = v_drop;
    UPDATE public.do_change_group_reviews SET group_id = v_keep WHERE group_id = v_drop;
    DELETE FROM public.do_change_groups WHERE id = v_drop;

    v_merged := v_merged + 1;
  END LOOP;

  RETURN v_merged;
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

/**
 * 경유 고객처 주문의 실제 고객처를 건별로 지정·해제 (영업관리팀)
 * @param p_order_no 판매주문 번호
 * @param p_target 실제 고객처 (NULL이면 지정 해제 → 연결표·국가 기준으로 돌아감)
 */
CREATE OR REPLACE FUNCTION public.set_order_destination(p_order_no TEXT, p_target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dest RECORD;
  v_name TEXT;
BEGIN
  IF NOT public.po_is_sales_team() THEN
    RAISE EXCEPTION '처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dest FROM public.v_order_destinations WHERE order_no = p_order_no;
  IF v_dest.order_no IS NULL OR NOT v_dest.is_via_customer THEN
    RAISE EXCEPTION '경유 고객처 주문이 아닙니다: %', p_order_no USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_target), '') IS NULL THEN
    DELETE FROM public.po_order_destinations WHERE order_no = p_order_no;
    RETURN;
  END IF;

  IF NOT (p_target = ANY (COALESCE(v_dest.choice_candidates, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '이 주문의 후보 고객처가 아닙니다: %', p_target USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_name FROM public.user_profiles WHERE id = auth.uid();
  INSERT INTO public.po_order_destinations (order_no, target_customer, set_by, set_by_name, set_at)
  VALUES (p_order_no, p_target, auth.uid(), v_name, NOW())
  ON CONFLICT (order_no) DO UPDATE SET
    target_customer = EXCLUDED.target_customer,
    set_by = EXCLUDED.set_by,
    set_by_name = EXCLUDED.set_by_name,
    set_at = EXCLUDED.set_at;
END;
$$;

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

-- ---------------------------------------------------------------------
-- 11-2. 요청 ↔ DO 변경 연결 (3단계)
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


-- ---------------------------------------------------------------------
-- 12. 함수 실행 권한
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.po_insert_change_event(
  UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, TEXT, INT, INT, INT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.po_net_same_item_changes(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_merge_split_groups(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_po_upload(TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_po_upload(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_so_snapshot(UUID, JSONB, JSONB, JSONB, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_po_upload_chunk(UUID, INT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_do_snapshot(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_group_split_candidates(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_po_upload(TEXT, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_po_upload(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_so_snapshot(UUID, JSONB, JSONB, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_po_upload_chunk(UUID, INT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_do_snapshot(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_change_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_change_reasons(TEXT[], TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.clear_change_reasons(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_change_reasons(TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_change_types(TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_change_types(TEXT[], TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.po_my_view_scope() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_dashboard_changes(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.po_dashboard_requests(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_my_view_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_dashboard_changes(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_dashboard_requests(DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.dismiss_changes(TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_changes(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_changes(TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_changes(TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_order_destination(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_destination(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.po_dashboard_changes(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_dashboard_changes(DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.po_unit_qty(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.po_tracking_start() FROM PUBLIC, anon, authenticated;
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
