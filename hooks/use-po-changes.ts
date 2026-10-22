/**
 * PO 변경 페이지 데이터 훅 — 기간별 변경 이벤트·후보 묶음·요청 연결·연결 후보, 변경 유형, 재등록 대기, 미반영 요청, 업로드 날짜 조회
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
import { fetchChangeLinks, fetchMatchCandidates, fetchUnreflectedRequests } from '@/lib/po-request-links-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type {
  ChangeRequestLink,
  DoUploadDay,
  MatchCandidate,
  PendingReRegistrationLine,
  PoChangeEvent,
  PoChangeGroup,
  PoChangeTypeSetting,
  PoRequestOrigin,
  UnreflectedRequest,
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
  /** 기간 안 변경에 연결된 요청 */
  links: ChangeRequestLink[];
  /** 기간 안 변경의 연결 후보 */
  candidates: MatchCandidate[];
  /** 미반영 요청 (기간과 무관) */
  unreflected: UnreflectedRequest[];
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
  const [links, setLinks] = useState<ChangeRequestLink[]>([]);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [unreflected, setUnreflected] = useState<UnreflectedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!from || !to) return;
    try {
      setLoading(true);
      setError(null);
      const [eventRows, pending, days, types, originRows, linkRows, candidateRows, unreflectedRows] = await Promise.all([
        fetchChangeEvents(from, to),
        fetchPendingLines(),
        fetchDoUploadDays(),
        fetchChangeTypes(),
        fetchRequestOrigins(),
        fetchChangeLinks(from, to),
        fetchMatchCandidates(from, to),
        fetchUnreflectedRequests(),
      ]);
      const groupRows = await fetchChangeGroups(eventRows);
      setEvents(eventRows);
      setGroups(groupRows);
      setChangeTypes(types);
      setOrigins(originRows);
      setPendingLines(pending);
      setUploadDays(days);
      setLinks(linkRows);
      setCandidates(candidateRows);
      setUnreflected(unreflectedRows);
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

  return { events, groups, changeTypes, origins, pendingLines, uploadDays, links, candidates, unreflected, loading, error, refresh };
};
