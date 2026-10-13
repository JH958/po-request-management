/**
 * Product Tour 스텝 설정 (페이지별 중앙 관리, 한국어·영어)
 */
import type { Translate } from '@/lib/i18n';

export interface TourStepConfig {
  target: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
}

export const poStatusTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="po-status-header"]',
    title: 'PO 현황 요약',
    titleEn: 'PO status summary',
    description:
      '소속하신 고객처 또는 부서의 요청 현황을 한눈에 확인할 수 있습니다. 전체 요청, 검토 대기, 승인, 반려 건수가 표시됩니다.',
    descriptionEn:
      'See the requests from your customer account or department at a glance: total, pending, approved and rejected.',
  },
  {
    target: '[data-tour="po-status-period-filter"]',
    title: '기간 필터',
    titleEn: 'Period filter',
    description: '전체/일별/주별/월별 중 선택하여 원하는 기간의 데이터만 조회할 수 있습니다.',
    descriptionEn: 'Choose All, Daily, Weekly or Monthly to see data for that period only.',
  },
  {
    target: '[data-tour="po-status-approval-chart"]',
    title: '승인/반려 비율',
    titleEn: 'Approval / rejection ratio',
    description:
      '전체 요청 중 승인, 반려, 대기 중인 건의 비율을 도넛 차트로 확인할 수 있습니다.',
    descriptionEn: 'A donut chart of approved, rejected and pending requests.',
  },
  {
    target: '[data-tour="po-status-monthly-trend-chart"]',
    title: '월별 추이',
    titleEn: 'Monthly trend',
    description: '최근 몇 달간 요청 건수가 어떻게 변화했는지 확인할 수 있습니다.',
    descriptionEn: 'How the number of requests has changed over recent months.',
  },
  {
    target: '[data-tour="po-status-request-type-chart"]',
    title: '요청 구분별 분석',
    titleEn: 'By request type',
    description: '품목 추가, 출하일정 변경 등 어떤 유형의 요청이 많은지 확인할 수 있습니다.',
    descriptionEn: 'Which request types (item additions, ship date changes, etc.) are most common.',
  },
  {
    target: '[data-tour="po-status-item-category-trend-chart"]',
    title: '품목구분별 추이',
    titleEn: 'By product category',
    description:
      'InBody, BSM 등 품목 구분별로 요청이 어떻게 분포되어 있는지 확인할 수 있습니다.',
    descriptionEn: 'How requests are distributed across product categories such as InBody and BSM.',
  },
  {
    target: '[data-tour="po-status-frozen-chart"]',
    title: '프로즌 여부 분석',
    titleEn: 'Before / after frozen date',
    description:
      '프로즌 이전/이후/미설정 건의 비율을 확인할 수 있습니다. 프로즌 이후 건은 원칙적으로 변경이 어려우니 참고해주세요.',
    descriptionEn:
      'The share of requests made before or after the frozen date, or with no rule. Orders past the frozen date are generally hard to change.',
  },
];

export const requestTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="request-card-product-add"]',
    title: '제품/상품 추가',
    titleEn: 'Add product',
    description:
      'InBody, BSM, BPBIO, Wellness 제품군을 신규로 추가 요청할 때 사용합니다. 품목 구분을 선택하고 품목코드/수량을 입력해 접수합니다. SO 번호는 선택 입력입니다.',
    descriptionEn:
      'Request new InBody, BSM, BPBIO or Wellness products. Choose a product category and enter item codes and quantities. The SO number is optional.',
  },
  {
    target: '[data-tour="request-card-material-add"]',
    title: '자재 추가',
    titleEn: 'Add material',
    description:
      '자재를 신규로 추가 요청할 때 사용합니다. 품목 구분 선택 없이 바로 품목코드/수량을 입력합니다. SO 번호는 선택 입력입니다.',
    descriptionEn:
      'Request new materials. Enter item codes and quantities directly, without a product category. The SO number is optional.',
  },
  {
    target: '[data-tour="request-card-product-delete"]',
    title: '제품/상품 삭제',
    titleEn: 'Remove product',
    description:
      '기존 제품/상품 수량을 줄이거나 삭제할 때 사용합니다. 품목 구분을 선택해야 하며, SO 번호는 필수 입력입니다.',
    descriptionEn:
      'Reduce or remove existing product quantities. A product category and the SO number are required.',
  },
  {
    target: '[data-tour="request-card-material-delete"]',
    title: '자재 삭제',
    titleEn: 'Remove material',
    description: '기존 자재 수량을 줄이거나 삭제할 때 사용합니다. SO 번호는 필수 입력입니다.',
    descriptionEn: 'Reduce or remove existing material quantities. The SO number is required.',
  },
  {
    target: '[data-tour="request-card-code-change"]',
    title: '품목코드 변경',
    titleEn: 'Change item code',
    description:
      '품목코드가 변경되어야 하는 경우 사용합니다. 품목 목록에 변경할 코드/품목명/수량을 입력해 접수합니다.',
    descriptionEn: 'Use when an item code must change. Enter the new code, item name and quantity in the item list.',
  },
  {
    target: '[data-tour="request-card-schedule-change"]',
    title: '출하일정 변경',
    titleEn: 'Change ship date',
    description:
      '출하일을 변경하고 싶을 때 사용합니다. 다른 요청구분과 달리 품목 목록 입력 없이, 현재 출하일과 희망 출하일, 요청사유만 입력하면 되는 간단한 폼입니다.',
    descriptionEn:
      'Change the ship date. Unlike other types, no item list is needed — just the current ship date, desired ship date and reason.',
  },
  {
    target: '[data-tour="request-card-shipping-change"]',
    title: '운송방법 변경',
    titleEn: 'Change shipping method',
    description:
      '운송방법을 변경하고 싶을 때 사용합니다. 품목 목록 입력 없이, 변경하고자 하는 운송방법을 선택하고 요청사유를 입력하면 됩니다.',
    descriptionEn: 'Change the shipping method. No item list is needed — choose the new method and enter a reason.',
  },
  {
    target: '[data-tour="request-card-split-merge"]',
    title: '분할/합배송',
    titleEn: 'Split / combine shipment',
    description:
      '기 발주 건 중 일부 물량을 앞당겨 배송하거나, 다른 배송과 혼적하고 싶을 때 사용합니다.',
    descriptionEn: 'Ship part of an existing order earlier, or combine it with another shipment.',
  },
  {
    target: '[data-tour="request-card-etc"]',
    title: '기타',
    titleEn: 'Other',
    description: '위 8가지 항목에 해당하지 않는 요청을 접수할 때 사용합니다.',
    descriptionEn: 'For requests that do not fit the eight types above.',
  },
  {
    target: '[data-tour="request-history-table-header"]',
    title: '요청 접수 내역',
    titleEn: 'Submitted requests',
    description:
      '지금까지 접수한 요청 내역이 표시됩니다. 요청일, SO번호, 고객, 요청부서, 요청자, 출하일, 요청구분, 품목구분, 품목코드, 품목명, 수량, 확정수량, 요청사유, 검토상세, 프로즌여부, 상태까지 한 번에 확인할 수 있습니다.',
    descriptionEn:
      'All requests you have submitted, with request date, SO number, customer, department, requester, ship date, type, product category, item, quantity, confirmed quantity, reason, review details, frozen status and status.',
  },
  {
    target: '[data-tour="request-history-search"]',
    title: '검색',
    titleEn: 'Search',
    description: 'SO 번호, 고객명, 품목명으로 원하는 요청 건을 검색할 수 있습니다.',
    descriptionEn: 'Search requests by SO number, customer or item name.',
  },
  {
    target: '[data-tour="request-history-filters"]',
    title: '필터',
    titleEn: 'Filters',
    description:
      '상태별, 요청구분별, 고객별, 날짜 범위로 필터링하여 원하는 조건의 요청만 조회할 수 있습니다.',
    descriptionEn: 'Filter by status, request type, customer or date range.',
  },
  {
    target: '[data-tour="request-history-sort"]',
    title: '정렬',
    titleEn: 'Sort',
    description: '요청일 최신순 등 원하는 기준으로 정렬할 수 있습니다.',
    descriptionEn: 'Sort by request date and other criteria.',
  },
];

export const reviewTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="review-grid"]',
    title: '검토 대기 목록',
    titleEn: 'Awaiting review',
    description:
      '검토가 필요한 요청 건들이 카드 형태로 표시됩니다. 각 카드에는 SO번호, 고객, 요청구분, 출하일과 함께 D-day(출하일까지 남은 일수)가 표시되며, 카드를 클릭하면 상세 내용을 확인하고 승인/반려를 처리할 수 있습니다.',
    descriptionEn:
      'Requests that need review are shown as cards with the SO number, customer, type, ship date and days left until shipment. Click a card to see details and approve or reject.',
  },
  {
    target: '[data-tour="review-history-table-header"]',
    title: '전체 검토 이력',
    titleEn: 'Review history',
    description:
      '검토 대기 중인 건은 물론, 이미 승인/반려 처리된 건까지 모두 확인할 수 있으며, 요청 접수 내역과 동일한 항목으로 구성되어 있습니다.',
    descriptionEn:
      'All requests — pending, approved and rejected — with the same columns as the submitted requests list.',
  },
  {
    target: '[data-tour="review-history-search"]',
    title: '검색',
    titleEn: 'Search',
    description: 'SO 번호, 고객명, 품목명으로 검토 이력을 검색할 수 있습니다.',
    descriptionEn: 'Search the review history by SO number, customer or item name.',
  },
  {
    target: '[data-tour="review-history-filters"]',
    title: '필터',
    titleEn: 'Filters',
    description: '상태별, 요청구분별, 고객별, 날짜 범위로 필터링할 수 있습니다.',
    descriptionEn: 'Filter by status, request type, customer or date range.',
  },
  {
    target: '[data-tour="review-history-sort"]',
    title: '정렬',
    titleEn: 'Sort',
    description: '요청일 최신순 등 원하는 기준으로 정렬할 수 있습니다.',
    descriptionEn: 'Sort by request date and other criteria.',
  },
];

export type TourKey = 'po-status' | 'request' | 'review';

export const tourStepsMap: Record<TourKey, TourStepConfig[]> = {
  'po-status': poStatusTourSteps,
  request: requestTourSteps,
  review: reviewTourSteps,
};

export const tourRouteMap: Record<TourKey, string> = {
  'po-status': '/',
  request: '/request',
  review: '/review',
};

export const TOUR_KEYS: TourKey[] = ['po-status', 'request', 'review'];

/** 가이드 선택 버튼 표시명 */
export const getTourLabels = (t: Translate): Record<TourKey, string> => ({
  'po-status': t('📊 PO 현황 가이드', '📊 PO Status guide'),
  request: t('📝 요청접수 가이드', '📝 Submit Request guide'),
  review: t('✅ 검토대기 가이드', '✅ Pending Review guide'),
});
