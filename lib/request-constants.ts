/**
 * PO 변경 요청 관련 상수 정의
 */

export const ALL_CUSTOMERS = [
  '일본(일본법인)',
  '미국(미국법인)',
  '중국(중국법인)',
  '말레이시아(아시아법인)',
  '인도(인도법인)',
  '네덜란드(유럽법인)',
  '멕시코(멕시코법인)',
  '중국(중국법인_생산)',
  '독일(유럽법인_독일지사)',
  '주식회사 코르트',
  '호주(호주법인)',
  '미국(미국동부법인)',
  '주식회사 인바디헬스케어',
  '영국(유럽법인_영국지사)',
  '베트남(베트남법인)',
  '튀르키예(튀르키예법인)',
  '국내_인바디 서부지사',
  '국내_인바디 남부지사',
  '국내_인바디 강남지사',
  '국내_인바디 대전지사',
  '국내_인바디 대구지사',
  '국내_인바디 광주지사',
  '국내_인바디 강북지사',
  '국내_인바디 강서지사',
  '국내_인바디 강원지사',
  '국내_인바디 중부지사',
  '국내_인바디 부산지사',
  '태국(InBody Thailand Co., Ltd.)',
  '인도네시아(PT. InBody Global Healthcare)',
] as const;

export const HEADQUARTERS_TEAMS = ['영업관리팀', '제조관리팀', '혈압계팀', 'W팀'] as const;

export const DOMESTIC_BRANCH_SHIPPING_METHODS = ['Parcel', 'Pickup', 'Truck', 'Regular'] as const;
export const OVERSEAS_CUSTOMER_SHIPPING_METHODS = ['Ocean', 'Air', 'UPS', 'DHL', 'FEDEX', 'Parcel'] as const;
export const ALL_SHIPPING_METHODS = [
  'Ocean', 'Air', 'UPS', 'DHL', 'FEDEX', 'Parcel', 'Pickup', 'Truck', 'Regular',
] as const;

export const PRODUCT_CATEGORIES = [
  { value: 'InBody', label: 'InBody', color: 'bg-blue-100 text-blue-800' },
  { value: 'BSM', label: 'BSM', color: 'bg-green-100 text-green-800' },
  { value: 'BPBIO', label: 'BPBIO', color: 'bg-purple-100 text-purple-800' },
  { value: 'Wellness', label: 'Wellness', color: 'bg-pink-100 text-pink-800' },
  { value: 'Spare parts', label: 'Spare parts', color: 'bg-gray-100 text-gray-800' },
  { value: 'ALL', label: 'ALL', color: 'bg-orange-100 text-orange-800' },
] as const;

/** 요청 작성 폼 품목 구분 (Spare parts 제외) */
export const FORM_PRODUCT_CATEGORIES = PRODUCT_CATEGORIES.filter(
  (c) => c.value !== 'Spare parts'
);

export interface RequestTypeCard {
  value: string;
  label: string;
  description?: string;
}

/** 신규 요청구분 9개 카드 정의 */
export const REQUEST_TYPES: RequestTypeCard[] = [
  { value: 'product_add', label: '제품/상품 추가', description: '긴급 발주 건 포함' },
  { value: 'material_add', label: '자재 추가', description: '긴급 발주 건 포함' },
  { value: 'product_delete', label: '제품/상품 삭제' },
  { value: 'material_delete', label: '자재 삭제' },
  { value: 'code_change', label: '품목코드 변경', description: '설계변경 등으로 구>신코드 변경해야 하는 건 등' },
  { value: 'schedule_change', label: '출하일정 변경' },
  { value: 'shipping_change', label: '운송방법 변경' },
  { value: 'split_merge', label: '분할/합배송', description: '기 발주 건 중 일부 물량 앞당겨 배송 요청, 인바디 헬스케어와의 혼적 요청 등' },
  { value: 'etc', label: '기타' },
];

/** '추가' 계열 요청구분 value */
export const ADD_TYPE_VALUES = ['product_add', 'material_add'] as const;

export interface ReasonOption {
  value: string;
  label: string;
  description?: string;
}

/** 신규 요청사유 10개 항목 */
export const REQUEST_REASONS: ReasonOption[] = [
  { value: '수요 예측 오류', label: '수요 예측 오류' },
  { value: '영업 이벤트', label: '영업 이벤트', description: '대량 납품, 이벤트성 판매 등' },
  { value: '재고 부족', label: '재고 부족', description: '상품, 자재 입고 지연, 제품 자체의 재고 부족 등' },
  { value: '적재공간 과부족', label: '적재공간 과부족' },
  { value: '품질 이슈', label: '품질 이슈', description: '초기불량으로 인한 제품 무상 대응 등' },
  { value: '선적스케줄 변경', label: '선적스케줄 변경' },
  { value: '선수금 미입금', label: '선수금 미입금' },
  { value: '포워더 미지정', label: '포워더 미지정' },
  { value: '발주 지연', label: '발주 지연' },
  { value: '기타', label: '기타', description: '전쟁, 창고코드 미지정, 인증 이슈 등' },
];

/** 요청구분 필터 드롭다운용 (신규 요청구분 9개) */
export const ALL_CATEGORY_FILTER_OPTIONS = REQUEST_TYPES.map((t) => t.label);

export const EXTERNAL_LINKS = {
  D365: 'https://inbody.operations.dynamics.com/?cmp=IHQ&mi=DefaultDashboard',
  GM: 'https://gm.weareinbody.com/',
} as const;
