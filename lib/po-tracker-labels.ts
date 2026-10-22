/**
 * PO Tracker 변경 유형·업로드 종류·업로드 상태 표시명 (언어는 호출하는 쪽의 t로 결정)
 */
import type { Language, Translate } from '@/lib/i18n';
import type { DoChangeType, PoUploadKind, PoUploadStatus } from '@/types/po-upload';
import type {
  ChangeGroupStatus,
  ChangeGroupType,
  ChangeRuleKey,
  PoChangeEvent,
  PoChangeTypeSetting,
  ProductClass,
  RegistrationStatus,
} from '@/types/po-changes';

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

/** 품목 구분 표시명 */
export const getProductClassLabels = (t: Translate): Record<ProductClass, string> => ({
  제품: t('제품', 'Product'),
  상품: t('상품', 'Merchandise'),
  자재: t('자재', 'Material'),
  제외: t('제외', 'Excluded'),
  미분류: t('미분류', 'Unclassified'),
});

/** 후보 묶음 유형 표시명 */
export const getChangeGroupTypeLabels = (t: Translate): Record<ChangeGroupType, string> => ({
  split: t('분할/합배송', 'Split shipment'),
  item_change: t('품목코드 변경', 'Item code change'),
});

/** 후보 묶음 확인 상태 표시명 */
export const getChangeGroupStatusLabels = (t: Translate): Record<ChangeGroupStatus, string> => ({
  pending: t('확인 전', 'To review'),
  approved: t('승인', 'Approved'),
  rejected: t('반려', 'Rejected'),
});

/** 판정 기준 표시 순서 (관리자 설정 화면) */
export const CHANGE_RULE_KEYS: ChangeRuleKey[] = [
  'add_product',
  'add_material',
  'add_other',
  'delete_product',
  'delete_material',
  'delete_other',
  'item_change',
  'date_change',
  'mode_change',
  'split',
];

/**
 * 판정 기준 이름·설명 — 시스템이 DO 비교로 정하는 값이라 관리자가 바꿀 수 없고, 어느 변경 유형으로 셀지만 고른다
 */
export const getChangeRuleLabels = (t: Translate): Record<ChangeRuleKey, { name: string; description: string }> => ({
  add_product: {
    name: t('제품·상품 추가', 'Product/merchandise added'),
    description: t('라인 추가·수량 증가 중 구분이 제품 또는 상품', 'Line added or qty increased for a product or merchandise item'),
  },
  add_material: {
    name: t('자재 추가', 'Material added'),
    description: t('라인 추가·수량 증가 중 구분이 자재', 'Line added or qty increased for a material item'),
  },
  add_other: {
    name: t('미분류·제외 품목 추가', 'Unclassified/excluded item added'),
    description: t('구분이 정해지지 않았거나 제외인 품목의 추가', 'Additions of items with no category or an excluded category'),
  },
  delete_product: {
    name: t('제품·상품 삭제', 'Product/merchandise removed'),
    description: t('라인 삭제·수량 감소·출하 부족 중 구분이 제품 또는 상품', 'Line removed, qty decreased or short shipment for a product or merchandise item'),
  },
  delete_material: {
    name: t('자재 삭제', 'Material removed'),
    description: t('라인 삭제·수량 감소·출하 부족 중 구분이 자재', 'Line removed, qty decreased or short shipment for a material item'),
  },
  delete_other: {
    name: t('미분류·제외 품목 삭제', 'Unclassified/excluded item removed'),
    description: t('구분이 정해지지 않았거나 제외인 품목의 삭제', 'Removals of items with no category or an excluded category'),
  },
  item_change: {
    name: t('품목코드 변경', 'Item code change'),
    description: t('품목코드 변경 후보(반려 전) — 묶음 1건으로 셈', 'Item code change candidates (not rejected), counted as one per group'),
  },
  date_change: {
    name: t('요청 배송일 변경', 'Requested date change'),
    description: t('DO의 요청받은 배송 일자가 바뀐 수량', 'Quantity whose requested delivery date changed on the DO'),
  },
  mode_change: {
    name: t('납품 모드 변경', 'Delivery mode change'),
    description: t('DO의 납품 모드(운송방법)가 바뀐 수량', 'Quantity whose delivery mode changed on the DO'),
  },
  split: {
    name: t('분할/합배송 후보', 'Split shipment candidate'),
    description: t('같은 날·같은 고객처·같은 품목의 삭제+추가(반려 전) — 묶음 1건으로 셈', 'Same-day removal + addition for the same customer and item (not rejected), counted as one per group'),
  },
});

/**
 * 변경 유형 표시명 — 영어 화면이면 영문명(없으면 한국어 이름)
 */
export const getChangeTypeName = (setting: Pick<PoChangeTypeSetting, 'label' | 'label_en'>, lang: Language): string =>
  lang === 'en' && setting.label_en ? setting.label_en : setting.label;

/**
 * 변경 이벤트의 변경 유형 표시명 — 설정 목록에서 찾고, 없으면 뷰가 붙인 이름
 */
export const getEventTypeName = (
  event: Pick<PoChangeEvent, 'change_type_code' | 'change_type_label'>,
  types: PoChangeTypeSetting[],
  lang: Language
): string => {
  const setting = types.find((type) => type.code === event.change_type_code);
  return setting ? getChangeTypeName(setting, lang) : event.change_type_label;
};

/** 등록 상태 표시 순서 */
export const REGISTRATION_STATUSES: RegistrationStatus[] = ['pre', 'post', 'exempt', 'waiting', 'unregistered'];

/** 등록 상태 표시명 */
export const getRegistrationLabels = (t: Translate): Record<RegistrationStatus, string> => ({
  pre: t('사전 등록', 'Registered before'),
  post: t('사후 등록', 'Registered after'),
  exempt: t('예외 처리', 'Exempt'),
  waiting: t('확인 대기', 'Waiting'),
  unregistered: t('미등록', 'Unregistered'),
});

/** 등록 상태 배지 색 (Tailwind 클래스) */
export const REGISTRATION_BADGE_CLASSES: Record<RegistrationStatus, string> = {
  pre: 'border-green-200 bg-green-50 text-green-700',
  post: 'border-sky-200 bg-sky-50 text-sky-700',
  exempt: 'border-slate-300 bg-slate-100 text-slate-600',
  waiting: 'border-amber-200 bg-amber-50 text-amber-700',
  unregistered: 'border-red-200 bg-red-50 text-red-700',
};
