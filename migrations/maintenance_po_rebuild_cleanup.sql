-- =====================================================================
-- PO Tracker 재계산 정리: 백업·작업용 테이블 삭제 (2026-10-23)
--
-- maintenance_po_rebuild_2_restore.sql 결과를 확인한 뒤 실행. 다음 재계산(1번 파일)을 하려면 먼저 이 파일로 지워야 함.
-- 운영 데이터(업로드·변경·처리 결과)는 건드리지 않습니다. 여러 번 실행해도 안전합니다.
-- (2026-10-20 재계산 때 만든 테이블도 이름이 같아 함께 지워짐)
-- =====================================================================

-- 자동 연결이 꺼진 채 남아 있으면 다시 켬 (1번만 실행하고 2번을 실행하지 않은 경우 대비)
ALTER TABLE public.po_source_uploads ENABLE TRIGGER po_uploads_auto_link;

DROP TABLE IF EXISTS
  public.po_rebuild_bak_events,
  public.po_rebuild_bak_groups,
  public.po_rebuild_bak_group_reviews,
  public.po_rebuild_bak_unit_sigs,
  public.po_rebuild_bak_reasons,
  public.po_rebuild_bak_type_overrides,
  public.po_rebuild_bak_dismissals,
  public.po_rebuild_bak_exemptions,
  public.po_rebuild_bak_links,
  public.po_rebuild_bak_uploads,
  public.po_rebuild_work_events,
  public.po_rebuild_work_groups,
  public.po_rebuild_work_group_map,
  public.po_rebuild_work_units;

-- 남은 재계산 테이블 (비어 있어야 함)
SELECT string_agg(tablename, ', ') AS "남은 po_rebuild_* 테이블"
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'po_rebuild_%';
