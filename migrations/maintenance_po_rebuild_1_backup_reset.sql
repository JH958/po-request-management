-- =====================================================================
-- PO Tracker 재계산 1/2: 검토·사유 백업 후 업로드·변경 데이터 초기화 (2026-10-20)
--
-- 배경: 10/15 파일을 빠뜨린 채 10/16·10/19를 올려 10/15 변경이 10/16에 합쳐짐.
--       비교 기준(확정 상태)은 날짜별로 되돌릴 수 없으므로, 업로드·변경 데이터를 비우고
--       10/12부터 날짜 순서대로 다시 올려 처음부터 계산한다.
--
-- 순서
--   1) 이 파일 실행 — 후보 승인·반려와 변경 사유를 po_rebuild_bak_* 테이블에 백업하고 업로드·변경 데이터 삭제
--   2) 데이터 업로드 화면에서 날짜 순서대로 다시 업로드 (날짜마다 판매주문조회 → DO등록현황조회)
--        10/12 → 10/13 → 10/14 → 10/15 → 10/16 → 10/19   (10/12는 기준선으로 저장됨)
--   3) migrations/maintenance_po_rebuild_2_restore.sql 실행 — 같은 변경을 찾아 승인·반려·사유를 다시 적용
--
-- 지우는 것: 업로드 기록, 판매주문 미출고 라인, DO 라인·확정 상태, 변경 이벤트, 후보 묶음·처리 이력, 변경 사유
-- 지우지 않는 것: 관리자 설정 전체(변경 유형·사유 목록·품목 구분·예외·고객처 담당자·요청 부서·추적 제외),
--                 고객처·품목 매핑(customer_so_map, item_category_map — 다시 올리면 갱신됨),
--                 변경 사유 이력(po_change_reason_history — 감사용으로 남김), Storage의 원본 파일
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 백업 (같은 이름의 백업이 이미 있으면 실행을 멈춤 — 두 번 실행해서 백업을 덮어쓰지 않도록)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.po_rebuild_bak_groups') IS NOT NULL THEN
    RAISE EXCEPTION '이미 백업이 있습니다(po_rebuild_bak_*). 재계산을 마쳤다면 2번 파일 끝의 DROP 문으로 백업을 지운 뒤 다시 실행하세요.';
  END IF;
END $$;

-- 이벤트 서명: 기준일/주문/라인/세부 유형/수량/품목 — 다시 계산해도 같은 변경이면 같은 값
CREATE TABLE public.po_rebuild_bak_events AS
SELECT
  e.*,
  e.detected_on::TEXT || '/' || e.order_no || '/' || e.line_no::TEXT || '/' || e.change_type || '/' || e.qty::TEXT
    || '/' || COALESCE(e.item_no, '') AS ev_sig
FROM public.do_change_events e;

-- 후보 묶음 + 서명 (묶음 유형 + 묶인 이벤트 서명)
CREATE TABLE public.po_rebuild_bak_groups AS
SELECT
  g.*,
  g.group_type || '|' || (
    SELECT string_agg(b.ev_sig, ';' ORDER BY b.ev_sig)
    FROM public.po_rebuild_bak_events b
    WHERE b.candidate_group_id = g.id
  ) AS group_sig
FROM public.do_change_groups g;

CREATE TABLE public.po_rebuild_bak_group_reviews AS
SELECT r.* FROM public.do_change_group_reviews r;

-- 변경 사유 + 단위 서명 (묶음 키는 묶음 서명, 나머지는 같은 통계 단위에 속한 이벤트 서명)
CREATE TABLE public.po_rebuild_bak_reasons AS
SELECT
  r.*,
  CASE
    WHEN r.stat_unit_key LIKE 'group:%' THEN
      'G|' || (SELECT g.group_sig FROM public.po_rebuild_bak_groups g WHERE g.id = substring(r.stat_unit_key FROM 7)::UUID)
    ELSE
      'U|' || (
        SELECT string_agg(sig, ';' ORDER BY sig)
        FROM (
          SELECT DISTINCT b.ev_sig AS sig
          FROM public.v_do_change_events v
          JOIN public.po_rebuild_bak_events b ON b.id = v.id
          WHERE v.stat_unit_key = r.stat_unit_key
        ) s
      )
  END AS unit_sig
FROM public.po_change_reasons r;

CREATE TABLE public.po_rebuild_bak_uploads AS
SELECT * FROM public.po_source_uploads;

-- 백업 테이블은 화면에서 보이지 않게 (RLS 켜고 정책 없음 — SQL Editor에서만 조회)
ALTER TABLE public.po_rebuild_bak_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_group_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_uploads ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 2. 업로드·변경 데이터 삭제 (참조 순서대로)
-- ---------------------------------------------------------------------
DELETE FROM public.po_change_reasons;
DELETE FROM public.do_change_group_reviews;
DELETE FROM public.do_change_events;
DELETE FROM public.do_change_groups;
DELETE FROM public.po_upload_chunks;
DELETE FROM public.do_order_lines;
DELETE FROM public.do_lines;
DELETE FROM public.so_lines;
DELETE FROM public.po_source_uploads;


-- ---------------------------------------------------------------------
-- 3. 결과 확인 (백업 건수)
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.po_rebuild_bak_uploads) AS "백업한 업로드",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_events) AS "백업한 변경 이벤트",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_groups WHERE status <> 'pending') AS "백업한 승인·반려 묶음",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons) AS "백업한 변경 사유",
  (SELECT COUNT(*) FROM public.po_source_uploads) AS "남은 업로드 (0이어야 함)";

COMMIT;
