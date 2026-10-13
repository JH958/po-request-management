/**
 * PO Tracker 변경 유형·업로드 종류·업로드 상태 표시명 (언어는 호출하는 쪽의 t로 결정)
 */
import type { Translate } from '@/lib/i18n';
import type { DoChangeType, PoUploadKind, PoUploadStatus } from '@/types/po-upload';

/** DO 변경 이벤트 유형 표시 순서 */
export const DO_CHANGE_TYPES: DoChangeType[] = [
  'line_added',
  'qty_increased',
  'line_removed',
  'qty_decreased',
  'shipment_shortfall',
  'delivery_date_changed',
  'delivery_mode_changed',
  'item_changed',
];

/** DO 변경 이벤트 유형 표시명 */
export const getDoChangeTypeLabels = (t: Translate): Record<DoChangeType, string> => ({
  line_added: t('라인 추가', 'Line added'),
  qty_increased: t('수량 증가', 'Qty increased'),
  line_removed: t('라인 삭제', 'Line removed'),
  qty_decreased: t('수량 감소', 'Qty decreased'),
  shipment_shortfall: t('출하 부족', 'Short shipment'),
  delivery_date_changed: t('배송일자 변경', 'Delivery date changed'),
  delivery_mode_changed: t('운송방법 변경', 'Delivery mode changed'),
  item_changed: t('품목코드 변경', 'Item code changed'),
});

/** 업로드 파일 종류 표시명 (ERP 화면 이름) */
export const getUploadKindLabels = (t: Translate): Record<PoUploadKind, string> => ({
  sales_order: t('판매주문조회', 'Sales Order List'),
  do: t('DO등록현황조회', 'DO Registration Status'),
});

/** 업로드 상태 표시명 */
export const getUploadStatusLabels = (t: Translate): Record<PoUploadStatus, string> => ({
  processing: t('처리 중', 'Processing'),
  completed: t('완료', 'Completed'),
  failed: t('실패', 'Failed'),
});
