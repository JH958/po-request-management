-- =====================================================================
-- PO Tracker 재계산 1/2: 처리 결과 백업 후 업로드·변경 데이터 초기화 (2026-10-20, 2026-10-23 보완)
--
-- 언제: 업로드 날짜를 빠뜨렸거나 순서가 꼬여 변경이 잘못 계산됐을 때.
--       비교 기준(확정 상태)은 날짜별로 되돌릴 수 없으므로, 업로드·변경 데이터를 비우고
--       기준선(첫 업로드일)부터 날짜 순서대로 다시 올려 처음부터 계산한다.
--
-- 순서
--   0) 이전 재계산의 백업이 남아 있으면 maintenance_po_rebuild_cleanup.sql로 먼저 지움
--   1) 이 파일 실행 — 처리 결과를 po_rebuild_bak_* 테이블에 백업하고 업로드·변경 데이터 삭제,
--      다시 업로드하는 동안 자동 연결을 멈춤 (요청서 사유가 복원할 사유보다 먼저 채워지지 않도록)
--   2) 데이터 업로드 화면에서 기준선부터 날짜 순서대로 다시 업로드 (날짜마다 판매주문조회 → DO등록현황조회,
--      첫 날짜는 기준선으로 저장됨)
--   3) maintenance_po_rebuild_2_restore.sql 실행 — 같은 변경을 찾아 처리 결과를 다시 적용하고 자동 연결을 다시 켬
--      (2번을 실행하지 않으면 자동 연결이 꺼진 채로 남음)
--
-- 백업하는 처리 결과: 후보 묶음 승인·반려(처리 이력 포함), 변경 사유, 변경 유형 고치기, "변경 아님(정정)",
--                    요청 연결(해제한 짝 포함), 예외 처리
-- 지우는 것: 업로드 기록, 판매주문 미출고 라인, DO 라인·확정 상태, 변경 이벤트, 후보 묶음·처리 이력, 위 처리 결과
-- 지우지 않는 것: 관리자 설정 전체, 요청(requests), 고객처·품목 매핑(customer_so_map, item_category_map),
--                 경유 고객처 건별 지정(po_order_destinations — 주문번호 기준이라 그대로 맞음),
--                 처리 이력 테이블(사유·유형·변경 아님·연결·예외 처리 이력 — 감사용으로 남김), Storage의 원본 파일
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 백업 (같은 이름의 백업이 이미 있으면 실행을 멈춤 — 두 번 실행해서 백업을 덮어쓰지 않도록)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.po_rebuild_bak_groups') IS NOT NULL THEN
    RAISE EXCEPTION '이미 백업이 있습니다(po_rebuild_bak_*). 지난 재계산을 마쳤다면 maintenance_po_rebuild_cleanup.sql로 백업을 지운 뒤 다시 실행하세요.';
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

-- 변경 1건 키 → 단위 서명 (묶음 키는 묶음 서명, 나머지는 같은 통계 단위에 속한 이벤트 서명)
-- 처리 결과(사유·유형·변경 아님·연결·예외 처리)는 모두 이 서명으로 다시 찾는다
CREATE TABLE public.po_rebuild_bak_unit_sigs AS
SELECT 'group:' || g.id::TEXT AS stat_unit_key, 'G|' || g.group_sig AS unit_sig
FROM public.po_rebuild_bak_groups g
UNION ALL
SELECT v.stat_unit_key, 'U|' || string_agg(DISTINCT b.ev_sig, ';' ORDER BY b.ev_sig)
FROM public.v_do_change_events v
JOIN public.po_rebuild_bak_events b ON b.id = v.id
WHERE v.stat_unit_key NOT LIKE 'group:%'
GROUP BY v.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_reasons AS
SELECT r.*, s.unit_sig FROM public.po_change_reasons r
LEFT JOIN public.po_rebuild_bak_unit_sigs s ON s.stat_unit_key = r.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_type_overrides AS
SELECT o.*, s.unit_sig FROM public.po_change_type_overrides o
LEFT JOIN public.po_rebuild_bak_unit_sigs s ON s.stat_unit_key = o.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_dismissals AS
SELECT d.*, s.unit_sig FROM public.po_change_dismissals d
LEFT JOIN public.po_rebuild_bak_unit_sigs s ON s.stat_unit_key = d.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_exemptions AS
SELECT x.*, s.unit_sig FROM public.po_change_exemptions x
LEFT JOIN public.po_rebuild_bak_unit_sigs s ON s.stat_unit_key = x.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_links AS
SELECT l.*, s.unit_sig FROM public.request_change_links l
LEFT JOIN public.po_rebuild_bak_unit_sigs s ON s.stat_unit_key = l.stat_unit_key;

CREATE TABLE public.po_rebuild_bak_uploads AS
SELECT * FROM public.po_source_uploads;

-- 백업 테이블은 화면에서 보이지 않게 (RLS 켜고 정책 없음 — SQL Editor에서만 조회)
ALTER TABLE public.po_rebuild_bak_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_group_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_unit_sigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_type_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_bak_uploads ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 2. 다시 업로드하는 동안 자동 연결 멈춤 (2번 파일이 다시 켬)
-- ---------------------------------------------------------------------
ALTER TABLE public.po_source_uploads DISABLE TRIGGER po_uploads_auto_link;


-- ---------------------------------------------------------------------
-- 3. 업로드·변경 데이터와 처리 결과 삭제 (참조 순서대로)
-- ---------------------------------------------------------------------
DELETE FROM public.request_change_links;
DELETE FROM public.po_change_exemptions;
DELETE FROM public.po_change_dismissals;
DELETE FROM public.po_change_type_overrides;
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
-- 4. 결과 확인 (백업 건수)
-- ---------------------------------------------------------------------
SELECT
  (SELECT string_agg(snapshot_date::TEXT, ', ' ORDER BY snapshot_date) FROM public.po_rebuild_bak_uploads
     WHERE kind = 'do' AND status = 'completed') AS "다시 올릴 날짜 (DO 기준)",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_events) AS "변경 이벤트",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_groups WHERE status <> 'pending') AS "승인·반려 묶음",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons) AS "변경 사유",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_type_overrides) AS "고친 변경 유형",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_dismissals) AS "변경 아님",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_exemptions) AS "예외 처리",
  (SELECT COUNT(*) FROM public.po_rebuild_bak_links) AS "요청 연결",
  (SELECT COUNT(*) FROM public.po_source_uploads) AS "남은 업로드 (0이어야 함)";

COMMIT;
