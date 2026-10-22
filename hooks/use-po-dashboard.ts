/**
 * PO 현황 대시보드 데이터 훅 — 기간과 직전 같은 길이 기간의 변경·요청을 함께 조회
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardChanges, fetchDashboardRequests } from '@/lib/po-dashboard-api';
import { fetchChangeTypes } from '@/lib/po-changes-api';
import { getPreviousRange } from '@/lib/po-dashboard-utils';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type { PoChangeTypeSetting } from '@/types/po-changes';
import type { DashboardChangeRow, DashboardRequestRow } from '@/types/po-dashboard';

interface UsePoDashboardReturn {
  changes: DashboardChangeRow[];
  /** 직전 같은 길이 기간의 변경 (건수 비교용) */
  previousChanges: DashboardChangeRow[];
  requests: DashboardRequestRow[];
  changeTypes: PoChangeTypeSetting[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * 기간(from~to)의 대시보드 데이터를 조회
 */
export const usePoDashboard = (from: string, to: string): UsePoDashboardReturn => {
  const [changes, setChanges] = useState<DashboardChangeRow[]>([]);
  const [previousChanges, setPreviousChanges] = useState<DashboardChangeRow[]>([]);
  const [requests, setRequests] = useState<DashboardRequestRow[]>([]);
  const [changeTypes, setChangeTypes] = useState<PoChangeTypeSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!from || !to || from > to) return;
    try {
      setLoading(true);
      setError(null);
      const prev = getPreviousRange(from, to);
      // 직전 기간까지 한 번에 받아 나눔
      const [allChanges, requestRows, types] = await Promise.all([
        fetchDashboardChanges(prev.from, to),
        fetchDashboardRequests(from, to),
        fetchChangeTypes(),
      ]);
      setChanges(allChanges.filter((r) => r.detected_on >= from));
      setPreviousChanges(allChanges.filter((r) => r.detected_on < from));
      setRequests(requestRows);
      setChangeTypes(types);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('PO 현황 대시보드 조회 실패:', err);
      }
      setError(getReadableErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { changes, previousChanges, requests, changeTypes, loading, error, refresh };
};
