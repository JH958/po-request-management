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
  /** 요청접수 카드 툴팁 설명 */
  description: string | null;
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
  /** 고객처 담당자 (관리자 설정 > 고객처 담당자) */
  manager_name: string | null;
  manager_email: string | null;
  /** 변경 사유 (PO 변경 사유 목록 값) — 묶음이 반려되면 묶음 사유를 물려받음 */
  reason: string | null;
  reason_note: string | null;
  reason_origin_type: ReasonOriginType | null;
  reason_origin_code: string | null;
  /** 출처 표시명 (고객처 요청이면 고객처 이름, 부서 요청이면 부서 표시명) */
  reason_origin_name: string | null;
  reason_origin_category: string | null;
  reason_origin_function: string | null;
  reason_set_by_name: string | null;
  reason_set_at: string | null;
  /** "변경 아님(정정)" 처리됨 — 변경 건수·통계·사유 입력 대상에서 빠짐 */
  is_dismissed: boolean;
  dismiss_note: string | null;
  dismissed_by_name: string | null;
  dismissed_at: string | null;
  /** 표시용 고객처명 — 경유 고객처는 "주식회사 인바디헬스케어_미국(미국법인)"처럼 실제 도착지를 붙임 */
  display_customer_name: string | null;
  dest_port: string | null;
  dest_country: string | null;
  dest_country_name: string | null;
  /** 경유 고객처 주문의 실제 고객처 (모르면 null) */
  actual_customer: string | null;
  /** 실제 고객처를 건별로 골라야 함 (대만·이스라엘 등 후보가 여럿인 국가) */
  needs_destination_choice: boolean;
  destination_candidates: string[] | null;
  destination_chosen_by_name: string | null;
  /** 영업관리팀이 변경 유형을 고침 (change_type_code·label은 고친 유형) */
  is_type_overridden: boolean;
  /** 자동 판정 유형 코드 */
  rule_type_code: string;
  type_set_by_name: string | null;
  type_set_at: string | null;
  /** 사유를 어디서 넣었는지 — manual(영업관리팀 입력) / request(연결된 요청서에서 가져옴) */
  reason_source: 'manual' | 'request' | null;
  /** 연결된 요청 수 (묶음이 반려되면 묶음 연결을 물려받음) */
  linked_request_count: number;
  /** 연결된 요청 중 가장 이른 요청일 */
  linked_request_date: string | null;
  /** 예외 처리 (요청서가 필요 없었던 변경) */
  is_exempt: boolean;
  exempt_note: string | null;
  exempted_by_name: string | null;
  exempted_at: string | null;
  /** 등록 상태 — 연결 여부·예외 처리·감지 후 지난 영업일로 판정 */
  registration_status: RegistrationStatus;
}

/** 등록 상태: 사전 등록 / 사후 등록 / 예외 처리 / 확인 대기(유예 영업일 안) / 미등록 */
export type RegistrationStatus = 'pre' | 'post' | 'exempt' | 'waiting' | 'unregistered';

/** 요청 요약 (영업관리팀은 요청 원본을 못 읽을 수 있어 DB 함수가 함께 돌려줌) */
export interface LinkedRequestSummary {
  request_id: string;
  item_key: string;
  item_name: string | null;
  unit_qty: number | null;
  request_qty: number | null;
  request_date: string;
  requester_name: string;
  requesting_dept: string;
  customer: string;
  so_number: string | null;
  category_of_request: string;
  reason_for_request: string;
  request_status: string;
}

/** 변경에 연결된 요청 (po_change_links) */
export interface ChangeRequestLink extends LinkedRequestSummary {
  /** 화면의 변경 1건 키 */
  unit_key: string;
  link_id: string;
  /** 연결이 저장된 키 (묶음이 반려되면 묶음 키) */
  link_key: string;
  link_type: 'auto' | 'manual';
  note: string | null;
  linked_by_name: string | null;
  linked_at: string;
}

/** 연결 후보 (po_match_candidates) */
export interface MatchCandidate extends LinkedRequestSummary {
  stat_unit_key: string;
  /** 요청구분 = 변경 유형 */
  type_match: boolean;
  /** 요청 수량 = 변경 수량 (일정·운송방법은 null) */
  qty_match: boolean | null;
  /** 유형·수량까지 모두 맞음 */
  is_full: boolean;
  score: number;
  /** 한 번 연결했다가 해제한 짝 */
  was_unlinked: boolean;
}

/** 미반영 요청 (po_unreflected_requests) — 승인됐는데 출하일이 지나도록 연결된 변경이 없음 */
export interface UnreflectedRequest {
  id: string;
  request_date: string;
  requester_name: string;
  requesting_dept: string;
  customer: string;
  so_number: string;
  category_of_request: string;
  reason_for_request: string;
  status: string;
  due_date: string;
  items: string | null;
}

/** 요청 연결 기준 (po_match_settings) */
export interface MatchSettings {
  days_before: number;
  days_after: number;
  grace_business_days: number;
}

/** 요청 출처 종류 */
export type ReasonOriginType = 'customer' | 'department';

/** 요청 부서 (po_request_origins) */
export interface PoRequestOrigin {
  code: string;
  department: string;
  company: string;
  display_name: string;
  /** 분류 (회사구분_기능, 예: 본사_생산) */
  category: string;
  /** 분류의 기능 부분 (예: 생산) */
  function_group: string | null;
  sort_order: number;
  is_active: boolean;
}

/** 사유 입력 값 */
export interface ChangeReasonInput {
  reason: string;
  note: string;
  originType: ReasonOriginType;
  originCode: string | null;
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
  /** 값이 있으면 이 메일이 담당하는 고객처만 */
  myEmail: string | null;
  /** 사유: 전체 / 미입력 / 입력됨 / 사유 값 */
  reasonFilter: string;
  /** 요청 출처: 전체 / 고객처 / 부서 / 생산부 / 부서 코드 */
  originFilter: string;
  /** "변경 아님" 처리한 건도 표에 보이기 */
  includeDismissed: boolean;
  /** 등록 상태: 전체 / 등록됨(사전+사후) / 상태 값 */
  registrationFilter: string;
}

/** 고객처 담당자 (customer_managers) */
export interface CustomerManager {
  account_no: string;
  customer_name: string;
  manager_name: string;
  manager_email: string;
  note: string | null;
  updated_at: string;
}

/** 고객처 계정 (po_customer_accounts) — 회원가입·요청서에서 고르는 고객처 */
export interface CustomerAccount {
  customer_name: string;
  account_no: string | null;
  sort_order: number;
  is_active: boolean;
}

/** 추가 조회 권한 (po_view_grants) — 부서에 특정 고객처의 PO 현황을 열어 줌 */
export interface ViewGrant {
  id: string;
  origin_code: string;
  customer_name: string;
  note: string | null;
  granted_by_name: string | null;
  created_at: string;
}

/** 경유 고객처 (po_via_customers) */
export interface ViaCustomer {
  customer_name: string;
  note: string | null;
}

/** 도착지 → 실제 고객처 (po_destination_map) — match_key는 도착항(예: O_LGB) 또는 국가 코드(예: JPN) */
export interface DestinationRule {
  match_key: string;
  target_customer: string | null;
  choice_candidates: string[] | null;
  note: string | null;
}

/** 국가 코드 → 한글명 (po_country_names) */
export interface CountryName {
  country_code: string;
  name_ko: string;
}
