/**
 * PO 현황 대시보드 데이터 범위 판별 유틸리티
 */
import type { PORequest } from '@/types/request';

export type DashboardScope = { scope: 'all' } | { scope: 'own'; department: string };

/**
 * 계정 유형에 따른 대시보드 데이터 범위를 반환
 */
export const getDashboardScope = (department: string, role: string): DashboardScope => {
  if (role === 'admin' || department?.includes('영업관리')) {
    return { scope: 'all' };
  }
  return { scope: 'own', department };
};

/**
 * 관리자 대시보드(전체 데이터 + 구분 필터) 여부 판별
 */
export const isAdminDashboard = (scope: DashboardScope): boolean => scope.scope === 'all';

/**
 * 관리자 설정 메뉴 접근 권한 여부
 */
export const canAccessAdminSettings = (department: string, role: string): boolean =>
  role === 'admin' || Boolean(department?.includes('영업관리'));

/**
 * 대시보드 범위에 맞게 요청 목록 필터링
 */
export const applyDashboardScope = (requests: PORequest[], scope: DashboardScope): PORequest[] => {
  if (scope.scope === 'all') return requests;

  const dept = scope.department;
  if (dept.endsWith('팀')) {
    return requests.filter((r) => r.requesting_dept === dept);
  }
  return requests.filter((r) => r.customer === dept);
};
