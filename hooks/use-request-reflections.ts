/**
 * 요청 목록의 DO 반영 상태 훅 — 요청 ID가 바뀌면 다시 조회 (실패하면 빈 값, 화면은 "-")
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchRequestReflections } from '@/lib/po-request-links-api';
import type { DoReflection } from '@/types/request';

/**
 * 요청 ID 목록의 DO 반영 상태 조회
 * @returns 요청 ID → 반영 상태
 */
export const useRequestReflections = (ids: string[]): Map<string, DoReflection> => {
  const [reflections, setReflections] = useState<Map<string, DoReflection>>(new Map());
  // 같은 ID 목록이면 다시 조회하지 않음
  const idKey = useMemo(() => [...ids].sort().join(','), [ids]);

  useEffect(() => {
    let cancelled = false;
    const list = idKey ? idKey.split(',') : [];
    void fetchRequestReflections(list).then((result) => {
      if (!cancelled) setReflections(result);
    });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return reflections;
};
