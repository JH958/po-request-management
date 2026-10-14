/**
 * PO 변경 페이지(변경 이벤트·후보 묶음·재등록 대기) 타입 정의
 */
import type { DoChangeType } from '@/types/po-upload';

/** 품목 구분 (세부분류 매핑 결과, 매핑 없으면 미분류) */
export type ProductClass = '제품' | '상품' | '자재' | '제외' | '미분류';

/** 시스템 판정 기준 (po_change_type_rules.rule_key) — 관리자가 변경 유형에 연결 */
export type ChangeRuleKey =
  | 'add_product'
  | 'add_material'
  | 'add_other'
  | 'delete_product'
  | 'delete_material'
  | 'delete_other'
  | 'item_change'
  | 'date_change'
  | 'mode_change'
  | 'split';

/** 변경 유형 설정 (po_change_type_settings) */
export interface PoChangeTypeSetting {
  code: string;
  label: string;
  label_en: string | null;
  sort_order: number;
  is_active: boolean;
}

/** 판정 기준 → 변경 유형 연결 (po_change_type_rules) */
export interface PoChangeTypeRule {
  rule_key: ChangeRuleKey;
  type_code: string | null;
}

/** 품목 구분 예외 (item_class_overrides) + 품목명·카테고리 구분 */
export interface ItemClassOverride {
  item_no: string;
  product_class: Exclude<ProductClass, '미분류'>;
  note: string | null;
  updated_at: string;
  item_name: string | null;
  category_model: string | null;
  category_class: ProductClass;
}

/** 후보 묶음 유형 */
export type ChangeGroupType = 'split' | 'item_change';

/** 후보 묶음 확인 상태 */
export type ChangeGroupStatus = 'pending' | 'approved' | 'rejected';

/** 변경 이벤트 (v_do_change_events) */
export interface PoChangeEvent {
  id: string;
  upload_id: string;
  detected_on: string;
  order_no: string;
  line_no: number;
  do_no: string | null;
  item_no: string | null;
  item_name: string | null;
  is_transfer: boolean;
  change_type: DoChangeType;
  direction: 'add' | 'delete' | 'date' | 'mode' | 'item';
  qty: number;
  qty_before: number | null;
  qty_after: number | null;
  date_before: string | null;
  date_after: string | null;
  mode_before: string | null;
  mode_after: string | null;
  item_before: string | null;
  item_after: string | null;
  candidate_group_id: string | null;
  account_no: string | null;
  customer_name: string | null;
  category_model: string | null;
  group_name: string | null;
  product_class: ProductClass;
  is_excluded: boolean;
  group_type: ChangeGroupType | null;
  group_status: ChangeGroupStatus | null;
  customer_unverified: boolean | null;
  stat_unit_key: string;
  is_class_overridden: boolean;
  change_rule: ChangeRuleKey;
  change_type_code: string;
  change_type_label: string;
}

/** 후보 묶음 (do_change_groups) + 묶인 이벤트 */
export interface PoChangeGroup {
  id: string;
  upload_id: string;
  group_type: ChangeGroupType;
  status: ChangeGroupStatus;
  customer_unverified: boolean;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  reviews: ChangeGroupReview[];
  events: PoChangeEvent[];
}

/** 후보 묶음 처리 이력 (do_change_group_reviews) */
export interface ChangeGroupReview {
  id: string;
  status: ChangeGroupStatus;
  note: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewer_department: string | null;
  created_at: string;
}

/** 재등록 대기 라인 (DO에서 사라졌지만 판매주문에는 미출고) */
export interface PendingReRegistrationLine {
  order_no: string;
  line_no: number;
  item_no: string | null;
  item_name: string | null;
  confirmed_qty: number;
  pending_count: number;
  pending_since_date: string | null;
  customer_name: string | null;
  requested_dates: string[];
}

/** DO 업로드 하루치 요약 (기간 선택·신규 주문 합계용) */
export interface DoUploadDay {
  snapshot_date: string;
  new_orders: number;
  is_baseline: boolean;
}

/** 화면 필터 */
export interface PoChangeFilters {
  from: string;
  to: string;
  /** 변경 유형 코드 (po_change_type_settings.code) 또는 전체 */
  changeType: string;
  productClass: ProductClass | 'all';
  search: string;
  includeExcluded: boolean;
}
