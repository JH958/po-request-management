/**
 * PO Tracker 변경 유형·업로드 상태 표시명
 */
import type { DoChangeType, PoUploadStatus } from '@/types/po-upload';

/** DO 변경 이벤트 유형 표시명 (표시 순서 = 객체 순서) */
export const DO_CHANGE_TYPE_LABELS: Record<DoChangeType, string> = {
  line_added: '라인 추가',
  qty_increased: '수량 증가',
  line_removed: '라인 삭제',
  qty_decreased: '수량 감소',
  shipment_shortfall: '출하 부족',
  delivery_date_changed: '배송일자 변경',
  delivery_mode_changed: '운송방법 변경',
  item_changed: '품목코드 변경',
};

/** 업로드 상태 표시명 */
export const UPLOAD_STATUS_LABELS: Record<PoUploadStatus, string> = {
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
};
