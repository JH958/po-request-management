/**
 * 요청구분·요청사유 설정 타입
 */

export interface RequestTypeSetting {
  id: string;
  value: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

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
