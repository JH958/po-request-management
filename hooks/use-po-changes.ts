/**
 * PO 변경 페이지 데이터 훅 — 기간별 변경 이벤트·후보 묶음, 변경 유형, 재등록 대기, 업로드 날짜 조회
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchChangeEvents,
  fetchChangeGroups,
  fetchChangeTypes,
  fetchDoUploadDays,
  fetchPendingLines,
  fetchRequestOrigins,
} from '@/lib/po-changes-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type {
  DoUploadDay,
  PendingReRegistrationLine,
  PoChangeEvent,
  PoChangeGroup,
  PoChangeTypeSetting,
  PoRequestOrigin,
} from '@/types/po-changes';

interface UsePoChangesReturn {
  events: PoChangeEvent[];
  groups: PoChangeGroup[];
  /** 변경 유형 설정 (꺼진 유형 포함) */
  changeTypes: PoChangeTypeSetting[];
  /** 요청 부서 (꺼진 부서 포함) */
  origins: PoRequestOrigin[];
  pendingLines: PendingReRegistrationLine[];
  uploadDays: DoUploadDay[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * 기간(from~to)의 PO 변경 데이터를 함께 조회
 */
export const usePoChanges = (from: string, to: string): UsePoChangesReturn => {
  const [events, setEvents] = useState<PoChangeEvent[]>([]);
  const [groups, setGroups] = useState<PoChangeGroup[]>([]);
  const [changeTypes, setChangeTypes] = useState<PoChangeTypeSetting[]>([]);
  const [origins, setOrigins] = useState<PoRequestOrigin[]>([]);
  const [pendingLines, setPendingLines] = useState<PendingReRegistrationLine[]>([]);
  const [uploadDays, setUploadDays] = useState<DoUploadDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!from || !to) return;
    try {
      setLoading(true);
      setError(null);
      const [eventRows, pending, days, types, originRows] = await Promise.all([
        fetchChangeEvents(from, to),
        fetchPendingLines(),
        fetchDoUploadDays(),
        fetchChangeTypes(),
        fetchRequestOrigins(),
      ]);
      const groupRows = await fetchChangeGroups(eventRows);
      setEvents(eventRows);
      setGroups(groupRows);
      setChangeTypes(types);
      setOrigins(originRows);
      setPendingLines(pending);
      setUploadDays(days);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('PO 변경 데이터 조회 실패:', err);
      }
      setError(getReadableErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { events, groups, changeTypes, origins, pendingLines, uploadDays, loading, error, refresh };
};
