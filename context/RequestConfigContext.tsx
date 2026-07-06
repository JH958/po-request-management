/**
 * 요청구분·요청사유 전역 설정 컨텍스트
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchRequestReasonSettings,
  fetchRequestTypeSettings,
  toReasonOption,
  toRequestTypeCard,
} from '@/lib/request-config-api';
import { REQUEST_REASONS, REQUEST_TYPES } from '@/lib/request-constants';
import type { ReasonOption, RequestTypeCard } from '@/lib/request-constants';

interface RequestConfigContextValue {
  requestTypes: RequestTypeCard[];
  requestReasons: ReasonOption[];
  categoryFilterOptions: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const RequestConfigContext = createContext<RequestConfigContextValue | null>(null);

export const RequestConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const [requestTypes, setRequestTypes] = useState<RequestTypeCard[]>(REQUEST_TYPES);
  const [requestReasons, setRequestReasons] = useState<ReasonOption[]>(REQUEST_REASONS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [types, reasons] = await Promise.all([
        fetchRequestTypeSettings(true),
        fetchRequestReasonSettings(true),
      ]);

      if (types.length > 0) {
        setRequestTypes(types.map(toRequestTypeCard));
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
      loading,
      refresh,
    }),
    [requestTypes, requestReasons, categoryFilterOptions, loading, refresh]
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
