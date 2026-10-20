/**
 * 요청구분(= PO 변경 유형)·요청사유·계정 종류 목록(요청 부서·고객처 계정) 전역 설정 컨텍스트
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchRequestReasonSettings, toReasonOption } from '@/lib/request-config-api';
import { fetchChangeTypes, fetchRequestOrigins } from '@/lib/po-changes-api';
import { fetchCustomerAccounts } from '@/lib/po-tracker-settings-api';
import { getCustomerAccounts, setAccountDirectory } from '@/lib/account-directory';
import { REQUEST_REASONS, REQUEST_TYPES } from '@/lib/request-constants';
import type { ReasonOption, RequestTypeCard } from '@/lib/request-constants';

interface RequestConfigContextValue {
  requestTypes: RequestTypeCard[];
  requestReasons: ReasonOption[];
  categoryFilterOptions: string[];
  /** 고객처 계정 이름 (요청서 고객처 선택지) */
  customerAccounts: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const RequestConfigContext = createContext<RequestConfigContextValue | null>(null);

export const RequestConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const [requestTypes, setRequestTypes] = useState<RequestTypeCard[]>(REQUEST_TYPES);
  const [requestReasons, setRequestReasons] = useState<ReasonOption[]>(REQUEST_REASONS);
  const [customerAccounts, setCustomerAccounts] = useState<string[]>(() => getCustomerAccounts());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // 계정 종류 목록은 따로 읽음 (실패해도 요청구분·사유는 계속 — 이때는 기존 규칙으로 판단)
    void Promise.all([fetchRequestOrigins(), fetchCustomerAccounts(true)])
      .then(([origins, accounts]) => {
        setAccountDirectory({
          internalDepartments: [...new Set(origins.map((o) => o.department))],
          customerAccounts: accounts.map((a) => a.customer_name),
        });
        setCustomerAccounts(getCustomerAccounts());
      })
      .catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('계정 종류 목록 로드 실패, 기존 규칙 사용:', error);
        }
      });

    try {
      setLoading(true);
      const [changeTypes, reasons] = await Promise.all([
        // 요청구분 카드 = 사용 중인 PO 변경 유형 (관리자 설정 > PO 변경 유형)
        fetchChangeTypes(),
        fetchRequestReasonSettings(true),
      ]);

      const types = changeTypes
        .filter((type) => type.is_active)
        .map((type) => ({ value: type.code, label: type.label, description: type.description ?? undefined }));
      if (types.length > 0) {
        setRequestTypes(types);
      }
      if (reasons.length > 0) {
        setRequestReasons(reasons.map(toReasonOption));
      }
    } catch (error) {
      console.warn('요청 설정 로드 실패, 기본값 사용:', error);
      setRequestTypes(REQUEST_TYPES);
      setRequestReasons(REQUEST_REASONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categoryFilterOptions = useMemo(
    () => requestTypes.map((t) => t.label),
    [requestTypes]
  );

  const value = useMemo(
    () => ({
      requestTypes,
      requestReasons,
      categoryFilterOptions,
      customerAccounts,
      loading,
      refresh,
    }),
    [requestTypes, requestReasons, categoryFilterOptions, customerAccounts, loading, refresh]
  );

  return <RequestConfigContext.Provider value={value}>{children}</RequestConfigContext.Provider>;
};

/**
 * 요청구분·요청사유 설정 훅
 */
export const useRequestConfig = (): RequestConfigContextValue => {
  const ctx = useContext(RequestConfigContext);
  if (!ctx) {
    throw new Error('useRequestConfig는 RequestConfigProvider 내부에서 사용해야 합니다.');
  }
  return ctx;
};
