/**
 * 데이터 업로드 이력·마지막 처리 기준일 조회 훅
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchLatestCompletedDates, fetchRecentUploads } from '@/lib/po-upload-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type { PoSourceUpload, PoUploadKind } from '@/types/po-upload';

interface UsePoUploadsReturn {
  uploads: PoSourceUpload[];
  latestDates: Record<PoUploadKind, string | null>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * 업로드 이력과 종류별 마지막 처리 기준일을 함께 조회
 */
export const usePoUploads = (): UsePoUploadsReturn => {
  const [uploads, setUploads] = useState<PoSourceUpload[]>([]);
  const [latestDates, setLatestDates] = useState<Record<PoUploadKind, string | null>>({
    sales_order: null,
    do: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, dates] = await Promise.all([fetchRecentUploads(), fetchLatestCompletedDates()]);
      setUploads(list);
      setLatestDates(dates);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('업로드 이력 조회 실패:', err);
      }
      setError(getReadableErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { uploads, latestDates, loading, error, refresh };
};
