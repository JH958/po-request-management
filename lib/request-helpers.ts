/**
 * PO 변경 요청 관련 헬퍼 함수
 */
import { isSameDay, isSameMonth, isSameWeek } from 'date-fns';
import type { PORequest } from '@/types/request';
import { ADD_TYPE_VALUES, PRODUCT_CATEGORIES, REQUEST_TYPES } from '@/lib/request-constants';

/**
 * 오류 객체에서 Supabase/PostgREST 에러 필드를 안전하게 추출
 */
export const asApiError = (error: unknown): { code?: string; message?: string } =>
  (typeof error === 'object' && error !== null ? error : {}) as { code?: string; message?: string };

/**
 * 에러 객체를 문자열로 안전하게 변환
 */
export const getReadableErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  const apiError = asApiError(error);
  if (apiError.message) return apiError.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/**
 * 요청 부서를 고객처/본사로 분류
 */
export const classifyDepartment = (department: string): 'customer' | 'headquarters' => {
  if (department.endsWith('팀')) return 'headquarters';
  return 'customer';
};

/**
 * 고객처/본사 필터 적용
 */
export const filterRequestsByLocation = (
  requests: PORequest[],
  filter: 'all' | 'customer' | 'headquarters'
): PORequest[] => {
  if (filter === 'all') return requests;
  return requests.filter((req) => {
    const type = classifyDepartment(req.requesting_dept || '');
    return filter === 'customer' ? type === 'customer' : type === 'headquarters';
  });
};

/**
 * 일/주/월 기간 필터 적용
 */
export const filterRequestsByPeriod = (
  requests: PORequest[],
  period: 'all' | 'daily' | 'weekly' | 'monthly'
): PORequest[] => {
  if (period === 'all') return requests;
  const now = new Date();
  return requests.filter((req) => {
    const requestDate = new Date(req.request_date);
    if (Number.isNaN(requestDate.getTime())) return false;
    if (period === 'daily') return isSameDay(requestDate, now);
    if (period === 'weekly') return isSameWeek(requestDate, now, { weekStartsOn: 1 });
    return isSameMonth(requestDate, now);
  });
};

/**
 * 가로 막대 Y축 라벨 말줄임
 */
export const truncateChartLabel = (value: string, maxLen = 15): string =>
  value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;

/**
 * 품목/제품 추가 요청 여부 확인
 */
export const isItemAdditionCategory = (category: string | null | undefined): boolean =>
  category === '품목 추가' ||
  category === '제품 추가' ||
  category === '제품/상품 추가' ||
  category === '자재 추가';

/**
 * 품목 구분 선택이 필요한 요청 구분인지 확인
 */
export const needsProductCategory = (categoryOfRequest: string): boolean =>
  [
    '수량 삭제',
    '품목 추가',
    '제품 추가',
    '제품/상품 추가',
    '자재 추가',
    '제품/상품 삭제',
    '자재 삭제',
  ].includes(categoryOfRequest);

/**
 * 품목 목록 입력 영역 표시 여부
 */
export const isItemListVisible = (categoryOfRequest: string): boolean =>
  categoryOfRequest !== '출하일정 변경' && categoryOfRequest !== '운송방법 변경';

/**
 * 요청구분 value에서 라벨 반환
 */
export const getRequestTypeLabel = (value: string): string =>
  REQUEST_TYPES.find((t) => t.value === value)?.label ?? value;

/**
 * 추가 계열 요청구분 여부
 */
export const isAddTypeValue = (value: string): boolean =>
  (ADD_TYPE_VALUES as readonly string[]).includes(value);

/**
 * SO 번호 형식 검증 (SO + 9자리 숫자)
 */
export const validateSONumber = (soNumber: string): boolean => /^SO\d{9}$/.test(soNumber);

/**
 * ERP 품목 코드 형식 검증
 */
export const validateERPCode = (erpCode: string): boolean => /^[A-Za-z0-9]{9}$/.test(erpCode);

/**
 * 승인용 확정 수량 검증
 */
export const validateApproveConfirmedQuantity = (confirmed: number | null, requested: number): boolean => {
  if (confirmed === null) return true;
  if (confirmed < 1) return false;
  if (confirmed > requested) return false;
  return true;
};

/**
 * 반려용 확정 수량 검증
 */
export const validateRejectConfirmedQuantity = (confirmed: number | null, requested: number): boolean => {
  if (confirmed === null) return true;
  if (confirmed < 0) return false;
  if (confirmed > requested) return false;
  return true;
};

/**
 * 품목 구분별 색상 클래스 반환
 */
export const getProductCategoryColor = (category: string): string => {
  const found = PRODUCT_CATEGORIES.find((c) => c.value === category);
  return found?.color ?? 'bg-gray-100 text-gray-800';
};

/**
 * 상태 라벨 변환
 */
export const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: '검토대기',
    in_review: '검토중',
    approved: '승인',
    rejected: '반려',
    completed: '완료',
  };
  return statusMap[status] || status;
};

export type ChartData = { name: string; count: number };
export type StatusData = { name: '승인' | '반려' | '대기'; value: number; percentage: number };

/**
 * 차트용 통계 계산
 */
export const calculateChartStatistics = (requests: PORequest[]) => {
  if (!requests || requests.length === 0) {
    return {
      departmentStats: [] as ChartData[],
      categoryStats: [] as ChartData[],
      reasonStats: [] as ChartData[],
      statusStats: [] as StatusData[],
    };
  }

  const reduceCounts = (values: Array<string | null | undefined>) =>
    values.reduce<Record<string, number>>((acc, v) => {
      const raw = (v ?? '').toString();
      const key = raw.trim() ? raw.trim() : '-';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const deptCounts = reduceCounts(requests.map((r) => r.requesting_dept));
  const departmentStats: ChartData[] = Object.entries(deptCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const categoryCounts = reduceCounts(requests.map((r) => r.category_of_request));
  const categoryStats: ChartData[] = Object.entries(categoryCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const reasonCounts = reduceCounts(requests.map((r) => r.reason_for_request));
  const reasonStats: ChartData[] = Object.entries(reasonCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const total = requests.length;
  const statusCounts = requests.reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? 'pending';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const approved = statusCounts.approved || 0;
  const rejected = statusCounts.rejected || 0;
  const pending = statusCounts.pending || 0;
  const statusStats: StatusData[] = [
    { name: '승인', value: approved, percentage: total ? Math.round((approved / total) * 100) : 0 },
    { name: '반려', value: rejected, percentage: total ? Math.round((rejected / total) * 100) : 0 },
    { name: '대기', value: pending, percentage: total ? Math.round((pending / total) * 100) : 0 },
  ];

  return { departmentStats, categoryStats, reasonStats, statusStats };
};

/**
 * 월별 요청 추이 데이터 계산
 */
export const calculateMonthlyTrend = (requests: PORequest[]): ChartData[] => {
  const monthCounts = requests.reduce<Record<string, number>>((acc, r) => {
    const d = new Date(r.request_date);
    if (Number.isNaN(d.getTime())) return acc;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(monthCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-12);
};

/**
 * 품목구분별 추이 데이터 계산
 */
export const calculateProductCategoryTrend = (requests: PORequest[]): ChartData[] => {
  const catCounts: Record<string, number> = {};
  requests.forEach((r) => {
    if (!r.product_category) {
      catCounts['미지정'] = (catCounts['미지정'] || 0) + 1;
      return;
    }
    r.product_category.split(',').forEach((cat) => {
      const trimmed = cat.trim();
      if (trimmed) catCounts[trimmed] = (catCounts[trimmed] || 0) + 1;
    });
  });

  return Object.entries(catCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Supabase 응답을 PORequest 타입으로 변환
 */
export const transformRequestData = (data: Record<string, unknown>[]): PORequest[] =>
  data.map((item) => ({
    id: item.id as string,
    request_date: (item.request_date as string) || new Date().toISOString().split('T')[0],
    so_number: (item.so_number as string) || '',
    customer: item.customer as string,
    requesting_dept: item.requesting_dept as string,
    requester_id: item.requester_id as string | undefined,
    requester_name: item.requester_name as string,
    request_type: (item.request_type as 'existing' | 'new') || undefined,
    factory_shipment_date: item.factory_shipment_date as string,
    desired_shipment_date: (item.desired_shipment_date as string) || undefined,
    confirmed_shipment_date: (item.confirmed_shipment_date as string) || undefined,
    leadtime: item.leadtime as number | undefined,
    category_of_request: item.category_of_request as string,
    priority: (item.priority as PORequest['priority']) || '일반',
    shipping_method: (item.shipping_method as string) || undefined,
    erp_code: (item.erp_code as string) || '',
    item_name: (item.item_name as string) || '',
    quantity: (item.quantity as number) || 0,
    confirmed_quantity: (item.confirmed_quantity as number | null) ?? null,
    reason_for_request: item.reason_for_request as string,
    request_details: (item.request_details as string) || undefined,
    items: item.items
      ? typeof item.items === 'string'
        ? JSON.parse(item.items)
        : (item.items as PORequest['items'])
      : undefined,
    product_category: (item.product_category as string) || null,
    feasibility: (item.feasibility as PORequest['feasibility']) || undefined,
    review_details: (item.review_details as string) || undefined,
    reviewing_dept: (item.reviewing_dept as string) || undefined,
    reviewer_id: (item.reviewer_id as string) || undefined,
    reviewer_name: (item.reviewer_name as string) || undefined,
    reviewed_at: (item.reviewed_at as string) || undefined,
    status: item.status as PORequest['status'],
    completed: item.completed as boolean,
    created_at: item.created_at as string,
    updated_at: item.updated_at as string,
    deleted_at: (item.deleted_at as string) || undefined,
  }));
