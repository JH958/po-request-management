-- =====================================================================
-- PO Tracker: 이전(Transfer) 변경을 추적 제외로 (2026-10-26)
--
-- 이전(TRO, 창고 간 이동)은 고객 발주가 아니고 고객처 담당자도 없어 사유를 입력할 사람이 없음
-- → v_do_change_events.is_excluded에 포함. PO 변경 화면에서는 '추적 제외·이전 포함'을 켤 때만 보이고,
--   변경 건수·사유 미입력·PO 현황 대시보드·요청 연결 후보에서 빠짐 (기존 사유·처리 기록은 그대로 남음)
--
-- 선행: update_request_original_date_revert.sql
-- 여러 번 실행해도 안전합니다.
-- =====================================================================

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
  -- 추적 제외: 제외 고객처 · '제외' 품목 · 이전(Transfer, 창고 간 이동 — 고객 발주가 아님, 2026-10-26)
  (ex.is_excluded_customer OR COALESCE(cls.product_class = '제외', FALSE) OR e.is_transfer) AS is_excluded,
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

-- 결과 확인: 이전 변경 건수(이제 추적 제외)
SELECT COUNT(DISTINCT stat_unit_key) AS "추적 제외된 이전 변경" FROM public.v_do_change_events WHERE is_transfer;
