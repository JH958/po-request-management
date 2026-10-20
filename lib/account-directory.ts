/**
 * 계정 종류 판별용 목록 — 본사/국내법인 부서(요청 부서)와 고객처 계정
 *
 * RequestConfigContext가 DB(po_request_origins, po_customer_accounts)에서 읽어 채운다.
 * 아직 못 읽었거나 테이블이 없으면 기존 규칙(부서명이 '팀'으로 끝나면 본사)과 기본 고객처 목록으로 판단한다.
 */
import { ALL_CUSTOMERS } from '@/lib/request-constants';

interface AccountDirectory {
  /** 본사/국내법인 부서명 (요청 부서의 department, 꺼진 부서 포함) */
  internalDepartments: string[];
  /** 고객처 계정 이름 (사용 중인 것) */
  customerAccounts: string[];
}

let directory: AccountDirectory | null = null;

/**
 * DB에서 읽은 목록 등록
 */
export const setAccountDirectory = (next: AccountDirectory): void => {
  directory = next.internalDepartments.length || next.customerAccounts.length ? next : null;
};

/**
 * 본사/국내법인 부서인지 (요청 부서 목록 기준)
 */
export const isInternalDepartment = (department: string | null | undefined): boolean => {
  const dept = department?.trim();
  if (!dept) return false;
  if (directory?.internalDepartments.length) return directory.internalDepartments.includes(dept);
  return dept.endsWith('팀');
};

/**
 * 본사/국내법인 부서명 목록 (목록이 없으면 빈 배열 — 이때는 '팀' 규칙으로 판단)
 */
export const getInternalDepartments = (): string[] => directory?.internalDepartments ?? [];

/**
 * 고객처 계정 이름 목록 (목록이 없으면 기본 목록)
 */
export const getCustomerAccounts = (): string[] =>
  directory?.customerAccounts.length ? directory.customerAccounts : [...ALL_CUSTOMERS];
