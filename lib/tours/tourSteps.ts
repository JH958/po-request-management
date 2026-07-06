/**
 * Product Tour 스텝 설정 (페이지별 중앙 관리)
 */

export interface TourStepConfig {
  target: string;
  title: string;
  description: string;
}

export const poStatusTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="po-status-header"]',
    title: 'PO 현황 요약',
    description:
      '소속하신 고객처 또는 부서의 요청 현황을 한눈에 확인할 수 있습니다. 전체 요청, 검토 대기, 승인, 반려 건수가 표시됩니다.',
  },
  {
    target: '[data-tour="po-status-period-filter"]',
    title: '기간 필터',
    description: '전체/일별/주별/월별 중 선택하여 원하는 기간의 데이터만 조회할 수 있습니다.',
  },
  {
    target: '[data-tour="po-status-approval-chart"]',
    title: '승인/반려 비율',
    description:
      '전체 요청 중 승인, 반려, 대기 중인 건의 비율을 도넛 차트로 확인할 수 있습니다.',
  },
  {
    target: '[data-tour="po-status-monthly-trend-chart"]',
    title: '월별 추이',
    description: '최근 몇 달간 요청 건수가 어떻게 변화했는지 확인할 수 있습니다.',
  },
  {
    target: '[data-tour="po-status-request-type-chart"]',
    title: '요청 구분별 분석',
    description: '품목 추가, 출하일정 변경 등 어떤 유형의 요청이 많은지 확인할 수 있습니다.',
  },
  {
    target: '[data-tour="po-status-item-category-trend-chart"]',
    title: '품목구분별 추이',
    description:
      'InBody, BSM 등 품목 구분별로 요청이 어떻게 분포되어 있는지 확인할 수 있습니다.',
  },
  {
    target: '[data-tour="po-status-frozen-chart"]',
    title: '프로즌 여부 분석',
    description:
      '프로즌 이전/이후/미설정 건의 비율을 확인할 수 있습니다. 프로즌 이후 건은 원칙적으로 변경이 어려우니 참고해주세요.',
  },
];

export const requestTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="request-card-product-add"]',
    title: '제품/상품 추가',
    description:
      'InBody, BSM, BPBIO, Wellness 제품군을 신규로 추가 요청할 때 사용합니다. 품목 구분을 선택하고 품목코드/수량을 입력해 접수합니다. SO 번호는 선택 입력입니다.',
  },
  {
    target: '[data-tour="request-card-material-add"]',
    title: '자재 추가',
    description:
      '자재를 신규로 추가 요청할 때 사용합니다. 품목 구분 선택 없이 바로 품목코드/수량을 입력합니다. SO 번호는 선택 입력입니다.',
  },
  {
    target: '[data-tour="request-card-product-delete"]',
    title: '제품/상품 삭제',
    description:
      '기존 제품/상품 수량을 줄이거나 삭제할 때 사용합니다. 품목 구분을 선택해야 하며, SO 번호는 필수 입력입니다.',
  },
  {
    target: '[data-tour="request-card-material-delete"]',
    title: '자재 삭제',
    description: '기존 자재 수량을 줄이거나 삭제할 때 사용합니다. SO 번호는 필수 입력입니다.',
  },
  {
    target: '[data-tour="request-card-code-change"]',
    title: '품목코드 변경',
    description:
      '품목코드가 변경되어야 하는 경우 사용합니다. 품목 목록에 변경할 코드/품목명/수량을 입력해 접수합니다.',
  },
  {
    target: '[data-tour="request-card-schedule-change"]',
    title: '출하일정 변경',
    description:
      '출하일을 변경하고 싶을 때 사용합니다. 다른 요청구분과 달리 품목 목록 입력 없이, 현재 출하일과 희망 출하일, 요청사유만 입력하면 되는 간단한 폼입니다.',
  },
  {
    target: '[data-tour="request-card-shipping-change"]',
    title: '운송방법 변경',
    description:
      '운송방법을 변경하고 싶을 때 사용합니다. 품목 목록 입력 없이, 변경하고자 하는 운송방법을 선택하고 요청사유를 입력하면 됩니다.',
  },
  {
    target: '[data-tour="request-card-split-merge"]',
    title: '분할/합배송',
    description:
      '기 발주 건 중 일부 물량을 앞당겨 배송하거나, 다른 배송과 혼적하고 싶을 때 사용합니다.',
  },
  {
    target: '[data-tour="request-card-etc"]',
    title: '기타',
    description: '위 8가지 항목에 해당하지 않는 요청을 접수할 때 사용합니다.',
  },
  {
    target: '[data-tour="request-history-table-header"]',
    title: '요청 접수 내역',
    description:
      '지금까지 접수한 요청 내역이 표시됩니다. 요청일, SO번호, 고객, 요청부서, 요청자, 출하일, 요청구분, 품목구분, 품목코드, 품목명, 수량, 확정수량, 요청사유, 검토상세, 프로즌여부, 상태까지 한 번에 확인할 수 있습니다.',
  },
  {
    target: '[data-tour="request-history-search"]',
    title: '검색',
    description: 'SO 번호, 고객명, 품목명으로 원하는 요청 건을 검색할 수 있습니다.',
  },
  {
    target: '[data-tour="request-history-filters"]',
    title: '필터',
    description:
      '상태별, 요청구분별, 고객별, 날짜 범위로 필터링하여 원하는 조건의 요청만 조회할 수 있습니다.',
  },
  {
    target: '[data-tour="request-history-sort"]',
    title: '정렬',
    description: '요청일 최신순 등 원하는 기준으로 정렬할 수 있습니다.',
  },
];

export const reviewTourSteps: TourStepConfig[] = [
  {
    target: '[data-tour="review-grid"]',
    title: '검토 대기 목록',
    description:
      '검토가 필요한 요청 건들이 카드 형태로 표시됩니다. 각 카드에는 SO번호, 고객, 요청구분, 출하일과 함께 D-day(출하일까지 남은 일수)가 표시되며, 카드를 클릭하면 상세 내용을 확인하고 승인/반려를 처리할 수 있습니다.',
  },
  {
    target: '[data-tour="review-history-table-header"]',
    title: '전체 검토 이력',
    description:
      '검토 대기 중인 건은 물론, 이미 승인/반려 처리된 건까지 모두 확인할 수 있으며, 요청 접수 내역과 동일한 항목으로 구성되어 있습니다.',
  },
  {
    target: '[data-tour="review-history-search"]',
    title: '검색',
    description: 'SO 번호, 고객명, 품목명으로 검토 이력을 검색할 수 있습니다.',
  },
  {
    target: '[data-tour="review-history-filters"]',
    title: '필터',
    description: '상태별, 요청구분별, 고객별, 날짜 범위로 필터링할 수 있습니다.',
  },
  {
    target: '[data-tour="review-history-sort"]',
    title: '정렬',
    description: '요청일 최신순 등 원하는 기준으로 정렬할 수 있습니다.',
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

export const tourLabelMap: Record<TourKey, string> = {
  'po-status': '📊 PO 현황 가이드',
  request: '📝 요청접수 가이드',
  review: '✅ 검토대기 가이드',
};
