/**
 * 요청접수·검토대기 페이지 테이블 조회 범위 유틸리티
 */
import { isSalesTeam } from '@/lib/dashboard-scope';
import { getInternalDepartments, isInternalDepartment } from '@/lib/account-directory';

/** 본사/국내법인 부서 여부 (요청 부서 목록 기준, 목록이 없으면 '팀'으로 끝나는지) */
export const isHeadquartersDepartment = (department: string | undefined): boolean => isInternalDepartment(department);

/** 고객처 계정 여부 (본사 부서가 아닌 경우) */
export const isCustomerAccount = (department: string | undefined): boolean =>
  Boolean(department && !isHeadquartersDepartment(department));

export type RequestListFilterMode = 'request-intake' | 'review-history';

type ScopedQuery = {
  eq: (column: string, value: string) => ScopedQuery;
  like: (column: string, pattern: string) => ScopedQuery;
  neq: (column: string, value: string) => ScopedQuery;
  in: (column: string, values: string[]) => ScopedQuery;
};

/**
 * 요청 부서가 본사/국내법인인 요청만 (목록이 있으면 목록으로, 없으면 '팀'으로 끝나는지)
 */
const onlyInternalRequests = <T extends ScopedQuery>(query: T, exclude?: string): T => {
  const internal = getInternalDepartments().filter((d) => d !== exclude);
  if (internal.length) return query.in('requesting_dept', internal) as T;
  const q = query.like('requesting_dept', '%팀') as T;
  return exclude ? (q.neq('requesting_dept', exclude) as T) : q;
};

/**
 * Supabase requests 쿼리에 페이지별 조회 범위 필터 적용
 *
 * 검토 이력(review-history):
 * - 영업관리팀·관리자: 필터 없음 — 본사·고객처 요청 전체
 * - 고객처: customer = 본인 소속, requesting_dept는 본사/국내법인 부서
 * - 본사 부서: customer 전체, requesting_dept는 본인 부서 제외한 다른 본사/국내법인 부서
 */
export const applyRequestListFilter = <T extends ScopedQuery>(
  query: T,
  department: string | undefined,
  mode: RequestListFilterMode,
  role?: string
): T => {
  if (!department) return query;

  if (mode === 'request-intake') {
    return query.eq('requesting_dept', department) as T;
  }

  if (isSalesTeam(department, role ?? '')) {
    return query;
  }

  if (isCustomerAccount(department)) {
    return onlyInternalRequests(query.eq('customer', department) as T);
  }

  if (isHeadquartersDepartment(department)) {
    return onlyInternalRequests(query, department);
  }

  return query;
};
