-- =====================================================================
-- PO Tracker 재계산 2/2: 다시 업로드한 결과에 승인·반려와 변경 사유 복원 (2026-10-20)
--
-- 선행: maintenance_po_rebuild_1_backup_reset.sql 실행 → 10/12~10/19 날짜 순서대로 다시 업로드
--
-- 같은 변경(기준일·주문·라인·세부 유형·수량·품목이 같은 이벤트 묶음)을 찾아 백업한 처리 결과를 다시 적용한다.
-- 10/15를 끼워 넣으면서 10/16의 일부 변경은 날짜가 10/15로 바뀌므로, 그런 건은 찾지 못하고
-- 마지막 결과 표에 "복원 못 함"으로 나온다 — 화면에서 다시 처리하면 된다.
-- 여러 번 실행해도 안전합니다 (이미 복원한 건은 건너뜀).
--
-- 작업용 목록은 SQL Editor가 문장마다 트랜잭션을 나눠도 사라지지 않도록 일반 테이블
-- (po_rebuild_work_*)에 만들고, 백업 테이블과 함께 맨 아래 DROP 문으로 지운다.
-- =====================================================================

-- 실행 순서 확인: 1번 파일(백업)을 먼저 실행하고, 다시 업로드까지 마친 뒤 실행해야 함
DO $$
BEGIN
  IF to_regclass('public.po_rebuild_bak_groups') IS NULL THEN
    RAISE EXCEPTION '백업이 없습니다. maintenance_po_rebuild_1_backup_reset.sql을 먼저 실행하고, 10/12~10/19를 다시 업로드한 뒤 이 파일을 실행하세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.po_source_uploads WHERE kind = 'do' AND status = 'completed' AND NOT is_baseline) THEN
    RAISE EXCEPTION '다시 올린 DO 업로드가 없습니다. 10/12~10/19를 날짜 순서대로 다시 업로드한 뒤 이 파일을 실행하세요.';
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
-- 2. 변경 사유 복원 (묶음 상태를 먼저 복원해야 통계 단위가 같아짐)
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

INSERT INTO public.po_change_reasons (stat_unit_key, reason, note, origin_type, origin_code, source, set_by, set_by_name, set_at)
SELECT u.stat_unit_key, b.reason, b.note, b.origin_type, b.origin_code, b.source, b.set_by, b.set_by_name, b.set_at
FROM public.po_rebuild_bak_reasons b
JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig
ON CONFLICT (stat_unit_key) DO NOTHING;

-- 작업용 테이블도 화면에서 보이지 않게
ALTER TABLE public.po_rebuild_work_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_group_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rebuild_work_units ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. 결과 (요약 + 복원하지 못한 항목을 한 표로)
-- ---------------------------------------------------------------------
SELECT '요약' AS "구분",
       format('완료된 업로드 %s건 / 승인·반려 묶음 %s건 중 %s건 복원 / 변경 사유 %s건 중 %s건 복원',
         (SELECT COUNT(*) FROM public.po_source_uploads WHERE status = 'completed'),
         (SELECT COUNT(*) FROM public.po_rebuild_bak_groups WHERE status <> 'pending'),
         (SELECT COUNT(*) FROM public.po_rebuild_work_group_map m
            JOIN public.po_rebuild_bak_groups b ON b.id = m.old_id WHERE b.status <> 'pending'),
         (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons),
         (SELECT COUNT(*) FROM public.po_rebuild_bak_reasons b JOIN public.po_rebuild_work_units u ON u.unit_sig = b.unit_sig)
       ) AS "내용",
       NULL::TEXT AS "메모",
       NULL::TEXT AS "처리자"
UNION ALL
SELECT '복원 못 함: 후보 묶음 (' || b.status || ')', b.group_sig, b.review_note, b.reviewed_by_name
FROM public.po_rebuild_bak_groups b
WHERE b.status <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_groups n WHERE n.group_sig = b.group_sig)
UNION ALL
SELECT '복원 못 함: 변경 사유 (' || b.reason || ')', b.unit_sig, b.note, b.set_by_name
FROM public.po_rebuild_bak_reasons b
WHERE NOT EXISTS (SELECT 1 FROM public.po_rebuild_work_units u WHERE u.unit_sig = b.unit_sig);

-- 화면에서 결과를 확인한 뒤 백업·작업용 테이블을 지우려면 아래 주석을 풀고 실행하세요.
-- DROP TABLE public.po_rebuild_bak_events, public.po_rebuild_bak_groups, public.po_rebuild_bak_group_reviews,
--   public.po_rebuild_bak_reasons, public.po_rebuild_bak_uploads,
--   public.po_rebuild_work_events, public.po_rebuild_work_groups, public.po_rebuild_work_group_map,
--   public.po_rebuild_work_units;
