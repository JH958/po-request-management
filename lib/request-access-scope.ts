/**
 * 요청접수·검토대기 페이지 테이블 조회 범위 유틸리티
 */

/** 본사 부서 여부 (~팀으로 끝남) */
export const isHeadquartersDepartment = (department: string | undefined): boolean =>
  Boolean(department?.trim().endsWith('팀'));

/** 고객처 계정 여부 (본사 부서가 아닌 경우) */
export const isCustomerAccount = (department: string | undefined): boolean =>
  Boolean(department && !isHeadquartersDepartment(department));

export type RequestListFilterMode = 'request-intake' | 'review-history';

type ScopedQuery = {
  eq: (column: string, value: string) => ScopedQuery;
  like: (column: string, pattern: string) => ScopedQuery;
  neq: (column: string, value: string) => ScopedQuery;
};

/**
 * Supabase requests 쿼리에 페이지별 조회 범위 필터 적용
 *
 * 검토 이력(review-history):
 * - 고객처: customer = 본인 소속, requesting_dept는 본사 부서(~팀)
 * - 본사 부서: customer 전체, requesting_dept는 본인 부서 제외한 다른 본사 부서(~팀)
 */
export const applyRequestListFilter = <T extends ScopedQuery>(
  query: T,
  department: string | undefined,
  mode: RequestListFilterMode
): T => {
  if (!department) return query;

  if (mode === 'request-intake') {
    return query.eq('requesting_dept', department) as T;
  }

  if (isCustomerAccount(department)) {
    return query.eq('customer', department).like('requesting_dept', '%팀') as T;
  }

  if (isHeadquartersDepartment(department)) {
    return query.like('requesting_dept', '%팀').neq('requesting_dept', department) as T;
  }

  return query;
};
