/**
 * PO 변경 사유(요청사유) 설정 타입 — 요청구분은 PO 변경 유형(types/po-changes.ts)으로 통합
 */

export interface RequestReasonSetting {
  id: string;
  value: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}
