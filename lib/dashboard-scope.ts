/**
 * PO 현황 대시보드 데이터 범위 판별 유틸리티
 */
import { isInternalDepartment } from '@/lib/account-directory';
import type { PORequest } from '@/types/request';

export type DashboardScope = { scope: 'all' } | { scope: 'own'; department: string };

/**
 * 계정 유형에 따른 대시보드 데이터 범위를 반환
 */
export const getDashboardScope = (department: string, role: string): DashboardScope => {
  if (isSalesTeam(department, role)) {
    return { scope: 'all' };
  }
  return { scope: 'own', department };
};

/**
 * 관리자 대시보드(전체 데이터 + 구분 필터) 여부 판별
 */
export const isAdminDashboard = (scope: DashboardScope): boolean => scope.scope === 'all';

/**
 * 관리자 여부 (role에 admin) — 관리자 설정 전체·데이터 업로드·조회 권한 부여
 * (부서 인자는 예전 호출부와 맞추기 위해 남겨둠)
 */
export const canAccessAdminSettings = (_department: string, role: string): boolean =>
  (role ?? '').split(',').map((r) => r.trim()).includes('admin');

/**
 * 영업관리팀 또는 관리자 여부 — PO 변경 페이지·후보 승인/반려·사유 입력, 전체 조회
 */
export const isSalesTeam = (department: string, role: string): boolean =>
  canAccessAdminSettings(department, role) || Boolean(department?.includes('영업관리'));

/**
 * 대시보드 범위에 맞게 요청 목록 필터링
 */
export const applyDashboardScope = (requests: PORequest[], scope: DashboardScope): PORequest[] => {
  if (scope.scope === 'all') return requests;

  const dept = scope.department;
  if (isInternalDepartment(dept)) {
    return requests.filter((r) => r.requesting_dept === dept);
  }
  return requests.filter((r) => r.customer === dept);
};
