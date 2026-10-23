-- =====================================================================
-- PO Tracker 재계산 2/2: 다시 업로드한 결과에 처리 결과 복원 (2026-10-20, 2026-10-23 보완)
--
-- 선행: maintenance_po_rebuild_1_backup_reset.sql 실행 → 기준선부터 날짜 순서대로 다시 업로드
--
-- 같은 변경(기준일·주문·라인·세부 유형·수량·품목이 같은 이벤트 묶음)을 찾아 백업한 처리 결과를 다시 적용한다.
--   후보 묶음 승인·반려(처리 이력 포함) → 변경 사유 → 변경 유형 고치기 → "변경 아님" → 예외 처리 → 요청 연결
-- 백업 값이 우선 (다시 계산 중 생긴 값이 있으면 덮어씀). 마지막에 자동 연결을 다시 켜고 한 번 돌림.
-- 빠졌던 날짜를 끼워 넣으면 일부 변경은 기준일이 바뀌어 찾지 못하고, 마지막 결과 표에 "복원 못 함"으로 나온다
-- — 화면에서 다시 처리하면 된다.
-- 여러 번 실행해도 안전합니다.
--
-- 작업용 목록은 SQL Editor가 문장마다 트랜잭션을 나눠도 사라지지 않도록 일반 테이블(po_rebuild_work_*)에 만들고,
-- 결과를 확인한 뒤 maintenance_po_rebuild_cleanup.sql로 백업 테이블과 함께 지운다.
-- =====================================================================

-- 실행 순서 확인: 1번 파일(백업)을 먼저 실행하고, 다시 업로드까지 마친 뒤 실행해야 함
DO $$
BEGIN
  IF to_regclass('public.po_rebuild_bak_unit_sigs') IS NULL THEN
    RAISE EXCEPTION '백업이 없습니다. maintenance_po_rebuild_1_backup_reset.sql을 먼저 실행하고, 기준선부터 다시 업로드한 뒤 이 파일을 실행하세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.po_source_uploads WHERE kind = 'do' AND status = 'completed' AND NOT is_baseline) THEN
    RAISE EXCEPTION '다시 올린 DO 업로드가 없습니다. 기준선부터 날짜 순서대로 다시 업로드한 뒤 이 파일을 실행하세요.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 0. 작업용 목록: 현재(다시 계산한) 이벤트·묶음 서명
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.po_rebuild_work_units;
DROP TABLE IF EXISTS public.po_rebuild_work_group_map;
DROP TABLE IF EXISTS public.po_rebuild_work_groups;
DROP TABLE IF EXISTS public.po_rebuild_work_events;

CREATE TABLE public.po_rebuild_work_events AS
SELECT
  e.id,
  e.candidate_group_id,
  e.detected_on::TEXT || '/' || e.order_no || '/' || e.line_no::TEXT || '/' || e.change_type || '/' || e.qty::TEXT
    || '/' || COALESCE(e.item_no, '') AS ev_sig
FROM public.do_change_events e;

CREATE TABLE public.po_rebuild_work_groups AS
SELECT
  g.id,
  g.group_type || '|' || (
    SELECT string_agg(n.ev_sig, ';' ORDER BY n.ev_sig)
    FROM public.po_rebuild_work_events n
    WHERE n.candidate_group_id = g.id
  ) AS group_sig
FROM public.do_change_groups g;

-- ---------------------------------------------------------------------
-- 1. 후보 묶음 승인·반려 복원 (처리 이력 포함)
-- ---------------------------------------------------------------------
CREATE TABLE public.po_rebuild_work_group_map AS
SELECT b.id AS old_id, n.id AS new_id
FROM public.po_rebuild_bak_groups b
JOIN public.po_rebuild_work_groups n ON n.group_sig = b.group_sig
WHERE b.status <> 'pending'
   OR EXISTS (SELECT 1 FROM public.po_rebuild_bak_group_reviews r WHERE r.group_id = b.id);

UPDATE public.do_change_groups g
SET
  status = b.status,
  review_note = b.review_note,
  reviewed_by = b.reviewed_by,
  reviewed_by_name = b.reviewed_by_name,
  reviewed_at = b.reviewed_at
FROM public.po_rebuild_work_group_map m
JOIN public.po_rebuild_bak_groups b ON b.id = m.old_id
WHERE g.id = m.new_id AND g.status = 'pending' AND g.reviewed_at IS NULL;

INSERT INTO public.do_change_group_reviews (group_id, status, note, reviewer_id, reviewer_name, reviewer_department, created_at)
SELECT m.new_id, r.status, r.note, r.reviewer_id, r.reviewer_name, r.reviewer_department, r.created_at
FROM public.po_rebuild_bak_group_reviews r
JOIN public.po_rebuild_work_group_map m ON m.old_id = r.group_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.do_change_group_reviews x
  WHERE x.group_id = m.new_id AND x.created_at = r.created_at AND x.status = r.status
);

-- ---------------------------------------------------------------------
-- 2. 현재 변경 1건 키 ↔ 단위 서명 (묶음 상태를 먼저 복원해야 통계 단위가 같아짐)
-- ---------------------------------------------------------------------
CREATE TABLE public.po_rebuild_work_units AS
SELECT 'G|' || n.group_sig AS unit_sig, 'group:' || n.id::TEXT AS stat_unit_key
FROM public.po_rebuild_work_groups n
UNION ALL
SELECT 'U|' || string_agg(DISTINCT t.ev_sig, ';' ORDER BY t.ev_sig), v.stat_unit_key
FROM public.v_do_change_events v
JOIN public.po_rebuild_work_events t ON t.id = v.id
WHERE v.stat_unit_key NOT LIKE 'group:%'
GROUP BY v.stat_unit_key;

-- ---------------------------------------------------------------------
-- 3. 처리 결과 복원 (백업 값 우선)
-- ---------------------------------------------------------------------
INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
SELECT u.stat_unit_key, b.reason, b.note, b.origin_type, b.origin_code, b.source, b.set_by, b.set_by_name, b.set_at
FROM public.po_rebuild_bak_reasons b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
ON CONFLICT (stat_unit_key) DO UPDATE SET
  reason = EXCLUDED.reason, note = EXCLUDED.note, origin_type = EXCLUDED.origin_type, origin_code = EXCLUDED.origin_code,
  source = EXCLUDED.source, set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name, set_at = EXCLUDED.set_at;

INSERT INTO public.po_change_type_overrides (stat_unit_key, type_code, set_by, set_by_name, set_at)
SELECT u.stat_unit_key, b.type_code, b.set_by, b.set_by_name, b.set_at
FROM public.po_rebuild_bak_type_overrides b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
WHERE EXISTS (SELECT 1 FROM public.po_change_type_settings s WHERE s.code = b.type_code)
ON CONFLICT (stat_unit_key) DO UPDATE SET
  type_code = EXCLUDED.type_code, set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name, set_at = EXCLUDED.set_at;

INSERT INTO public.po_change_dismissals (stat_unit_key, note, dismissed_by, dismissed_by_name, dismissed_at)
SELECT u.stat_unit_key, b.note, b.dismissed_by, b.dismissed_by_name, b.dismissed_at
FROM public.po_rebuild_bak_dismissals b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
ON CONFLICT (stat_unit_key) DO UPDATE SET
  note = EXCLUDED.note, dismissed_by = EXCLUDED.dismissed_by, dismissed_by_name = EXCLUDED.dismissed_by_name,
  dismissed_at = EXCLUDED.dismissed_at;

INSERT INTO public.po_change_exemptions (stat_unit_key, note, exempted_by, exempted_by_name, exempted_at)
SELECT u.stat_unit_key, b.note, b.exempted_by, b.exempted_by_name, b.exempted_at
FROM public.po_rebuild_bak_exemptions b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
ON CONFLICT (stat_unit_key) DO UPDATE SET
  note = EXCLUDED.note, exempted_by = EXCLUDED.exempted_by, exempted_by_name = EXCLUDED.exempted_by_name,
  exempted_at = EXCLUDED.exempted_at;

-- 요청 연결 (해제한 짝 포함 — 해제한 짝은 자동으로 다시 연결하지 않기 위해 필요). 지워진 요청은 건너뜀
INSERT INTO public.request_change_links (
  request_id, item_key, stat_unit_key, request_date, link_type, status, note,
  linked_by, linked_by_name, linked_at, unlinked_by, unlinked_by_name, unlinked_at
)
SELECT b.request_id, b.item_key, u.stat_unit_key, b.request_date, b.link_type, b.status, b.note,
       b.linked_by, b.linked_by_name, b.linked_at, b.unlinked_by, b.unlinked_by_name, b.unlinked_at
FROM public.po_rebuild_bak_links b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
JOIN public.requests r ON r.id = b.request_id
ON CONFLICT (request_id, item_key, stat_unit_key) DO UPDATE SET
  request_date = EXCLUDED.request_date, link_type = EXCLUDED.link_type, status = EXCLUDED.status, note = EXCLUDED.note,
  linked_by = EXCLUDED.linked_by, linked_by_name = EXCLUDED.linked_by_name, linked_at = EXCLUDED.linked_at,
  unlinked_by = EXCLUDED.unlinked_by, unlinked_by_name = EXCLUDED.unlinked_by_name, unlinked_at = EXCLUDED.unlinked_at;

-- 작업용 테이블도 화면에서 보이지 않게
ALTER TABLE public.po_rebuild_work_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_group_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_units ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. 자동 연결 다시 켜고 한 번 돌림 (복원 뒤라 해제한 짝·이미 있는 사유는 그대로)
-- ---------------------------------------------------------------------
ALTER TABLE public.po_source_uploads ENABLE TRIGGER po_uploads_auto_link;
SELECT public.po_run_auto_link(NULL, '자동 연결') AS "새로 자동 연결한 건수";

-- ---------------------------------------------------------------------
-- 5. 결과 (요약 + 복원하지 못한 항목을 한 표로)
-- ---------------------------------------------------------------------
WITH s AS (
  SELECT
    (SELECT COUNT(*) FROM public.po_source_uploads WHERE status = 'completed') AS uploads,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_groups WHERE status <> 'pending') AS g_all,
    (SELECT COUNT(*) FROM public.po_rebuild_work_group_map m
       JOIN public.po_rebuild_bak_groups b ON b.id = m.old_id WHERE b.status <> 'pending') AS g_ok,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons) AS r_all,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig) AS r_ok,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_type_overrides) AS t_all,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_type_overrides b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig) AS t_ok,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_dismissals) AS d_all,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_dismissals b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig) AS d_ok,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_exemptions) AS x_all,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_exemptions b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig) AS x_ok,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_links) AS l_all,
    (SELECT COUNT(*) FROM public.po_rebuild_bak_links b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
       JOIN public.requests r ON r.id = b.request_id) AS l_ok
)
SELECT '요약' AS "구분",
       format('완료된 업로드 %s건 / 승인·반려 묶음 %s/%s / 변경 사유 %s/%s / 고친 유형 %s/%s / 변경 아님 %s/%s / 예외 처리 %s/%s / 요청 연결 %s/%s (복원/백업)',
         uploads, g_ok, g_all, r_ok, r_all, t_ok, t_all, d_ok, d_all, x_ok, x_all, l_ok, l_all) AS "내용",
       NULL::TEXT AS "메모",
       NULL::TEXT AS "처리자"
FROM s
UNION ALL
SELECT '복원 못 함: 후보 묶음 (' || b.status || ')', b.group_sig, b.review_note, b.reviewed_by_name
FROM public.po_rebuild_bak_groups b
WHERE b.status <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_groups n WHERE n.group_sig = b.group_sig)
UNION ALL
SELECT '복원 못 함: 변경 사유 (' || b.reason || ')', COALESCE(b.unit_sig, b.stat_unit_key), b.note, b.set_by_name
FROM public.po_rebuild_bak_reasons b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig)
UNION ALL
SELECT '복원 못 함: 고친 유형 (' || b.type_code || ')', COALESCE(b.unit_sig, b.stat_unit_key), NULL, b.set_by_name
FROM public.po_rebuild_bak_type_overrides b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig)
UNION ALL
SELECT '복원 못 함: 변경 아님', COALESCE(b.unit_sig, b.stat_unit_key), b.note, b.dismissed_by_name
FROM public.po_rebuild_bak_dismissals b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig)
UNION ALL
SELECT '복원 못 함: 예외 처리', COALESCE(b.unit_sig, b.stat_unit_key), b.note, b.exempted_by_name
FROM public.po_rebuild_bak_exemptions b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig)
UNION ALL
SELECT '복원 못 함: 요청 연결 (' || b.status || ')', COALESCE(b.unit_sig, b.stat_unit_key), b.note, b.linked_by_name
FROM public.po_rebuild_bak_links b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig)
   OR NOT EXISTS (SELECT 1 FROM public.requests r WHERE r.id = b.request_id);

-- 결과를 확인한 뒤 maintenance_po_rebuild_cleanup.sql로 백업·작업용 테이블을 지우세요.
