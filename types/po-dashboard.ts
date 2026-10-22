/**
 * PO 현황 대시보드 타입 정의 (po_dashboard_changes / po_dashboard_requests 결과와 화면 집계)
 */
import type { ProductClass, ReasonOriginType } from '@/types/po-changes';

/** 변경 1건(통계 단위) — po_dashboard_changes() 행 */
export interface DashboardChangeRow {
  stat_unit_key: string;
  detected_on: string;
  change_type_code: string;
  change_type_label: string;
  customer_name: string | null;
  /** 경유 고객처는 "주식회사 인바디헬스케어_미국(미국법인)"처럼 실제 도착지가 붙음 */
  display_customer_name: string | null;
  dest_country_name: string | null;
  product_class: ProductClass | null;
  reason: string | null;
  reason_origin_type: ReasonOriginType | null;
  reason_origin_code: string | null;
  reason_origin_name: string | null;
  reason_origin_function: string | null;
  group_type: string | null;
  group_status: string | null;
  line_count: number;
}

/** 요청 1건 — po_dashboard_requests() 행 */
export interface DashboardRequestRow {
  id: string;
  request_date: string;
  customer: string | null;
  requesting_dept: string | null;
  category_of_request: string | null;
  reason_for_request: string | null;
  priority: string | null;
  status: string | null;
  frozen_status: string | null;
}

/** 기간 빠른 선택 */
export type PeriodPreset = 'week' | '4weeks' | 'month' | 'quarter' | 'custom';

/** 추이 단위 */
export type TrendUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** 요청 출처 묶음 — 고객처 / 생산부 / 그 밖의 본사·국내법인 부서 / 사유 미입력 */
export type OriginBucket = 'customer' | 'production' | 'department' | 'missing';

/** 추이 막대의 변경 유형 묶음 */
export type TypeGroup = 'add' | 'delete' | 'shift' | 'group' | 'other';

/** 대시보드 필터 */
export interface DashboardFilters {
  preset: PeriodPreset;
  from: string;
  to: string;
  /** 고객처 묶음 이름 (경유 고객처는 꼬리표 없이) 또는 all */
  customer: string;
  productClass: 'all' | ProductClass;
  origin: 'all' | OriginBucket;
}

/** 가로 막대 한 줄 — 마우스를 올리면 나눠 보기(breakdown) */
export interface RankedItem {
  key: string;
  label: string;
  value: number;
  color: string;
  /** 마우스를 올렸을 때 보이는 나눠 보기 (이름, 건수, 색) */
  breakdown: { label: string; value: number; color: string }[];
}

/** 추이 막대 한 칸 */
export interface TrendBucket {
  key: string;
  label: string;
  values: Record<string, number>;
  total: number;
}
