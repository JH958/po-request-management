/**
 * PO 변경 요청 관련 TypeScript 타입 정의
 */

/**
 * 요청 상태 타입
 */
export type RequestStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'completed';

/**
 * 긴급도 레벨 타입
 */
export type UrgencyLevel = 'urgent' | 'normal' | 'low';

/**
 * 가능 여부 타입
 */
export type FeasibilityStatus = 'approved' | 'rejected' | 'pending' | null;

/**
 * 우선순위 타입
 */
export type PriorityLevel = '긴급' | '일반' | '보통';

/**
 * PO 변경 요청 인터페이스
 */
export interface PORequest {
  id: string;
  request_date: string;
  so_number: string;
  customer: string;
  requesting_dept: string;
  requester_id?: string;
  requester_name: string;
  request_type?: 'existing' | 'new'; // 구분: 기존/신규
  factory_shipment_date: string; // 현재 출하일
  desired_shipment_date?: string; // 희망 출하일
  confirmed_shipment_date?: string; // 확정 출하일 (검토자/관리자만 수정 가능)
  leadtime?: number;
  category_of_request: string;
  priority: PriorityLevel;
  shipping_method?: string; // 운송방법 (Ocean, Air, UPS, DHL)
  erp_code: string;
  item_name: string;
  quantity: number;
  reason_for_request: string;
  request_details?: string;
  items?: RequestItem[]; // 품목 목록 (여러 품목 지원)
  feasibility?: FeasibilityStatus;
  review_details?: string;
  reviewing_dept?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  status: RequestStatus;
  completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/**
 * 요청 품목 아이템 인터페이스
 */
export interface RequestItem {
  erp_code: string;
  item_name: string;
  quantity: number;
}

/**
 * 대시보드 통계 인터페이스
 */
export interface DashboardStats {
  total: number;
  pending: number;
  approved: number;
  completed: number;
}

/**
 * 통계 카드 데이터 인터페이스
 */
export interface StatCardData {
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  color: string;
  bgColor: string;
}

/**
 * 우선순위 요청 인터페이스
 */
export interface PriorityRequest {
  id: string;
  urgency: UrgencyLevel;
  so_number: string;
  customer: string;
  category: string;
  shipmentDate: string;
  daysLeft: number;
  status: RequestStatus;
}
