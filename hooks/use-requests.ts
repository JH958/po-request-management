/**
 * 요청 목록 조회 커스텀 훅
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { asApiError, transformRequestData } from '@/lib/request-helpers';
import { applyRequestListFilter } from '@/lib/request-access-scope';
import type { RequestListFilterMode } from '@/lib/request-access-scope';
import type { PORequest, DashboardStats } from '@/types/request';

interface UseRequestsOptions {
  userId: string | undefined;
  department: string | undefined;
  role?: string;
  /** 조회 범위: 요청접수(요청부서) / 검토이력(고객·본사) */
  filterMode?: RequestListFilterMode;
  enabled?: boolean;
}

/**
 * 사용자 권한에 따른 요청 목록 조회 훅
 */
export const useRequests = ({
  userId,
  department,
  role,
  filterMode = 'request-intake',
  enabled = true,
}: UseRequestsOptions) => {
  const router = useRouter();
  const [requests, setRequests] = useState<PORequest[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!userId || !enabled) return;

    try {
      setLoading(true);
      const supabase = createClient();

      let query = supabase.from('requests').select('*').is('deleted_at', null);
      query = applyRequestListFilter(query, department, filterMode, role);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      const transformedData = transformRequestData((data || []) as Record<string, unknown>[]);
      setRequests(transformedData);

      setStats({
        total: transformedData.length,
        pending: transformedData.filter((r) => r.status === 'pending').length,
        approved: transformedData.filter((r) => r.status === 'approved').length,
        rejected: transformedData.filter((r) => r.status === 'rejected').length,
      });
    } catch (error: unknown) {
      console.error('요청 목록 조회 오류:', error);
      const err = asApiError(error);
      if (err?.code === 'PGRST301' || err?.message?.includes('permission')) {
        toast.error('요청 목록을 조회할 권한이 없습니다.');
      } else if (err?.message?.includes('JWT') || err?.message?.includes('token')) {
        toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
        router.push('/login');
      } else {
        toast.error('요청 목록을 불러오는 중 오류가 발생했습니다.');
      }
      setRequests([]);
      setStats({ total: 0, pending: 0, approved: 0, rejected: 0 });
    } finally {
      setLoading(false);
    }
  }, [userId, department, role, filterMode, enabled, router]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  return { requests, stats, loading, fetchRequests, setRequests };
};

/**
 * 전체 요청 목록 조회 (대시보드용)
 */
export const useAllRequests = (enabled = true) => {
  const [requests, setRequests] = useState<PORequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAllRequests = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(transformRequestData((data || []) as Record<string, unknown>[]));
    } catch (error) {
      console.error('전체 요청 조회 오류:', error);
      toast.error('요청 목록을 불러오는데 실패했습니다.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchAllRequests();
  }, [fetchAllRequests]);

  return { requests, loading, fetchAllRequests };
};

/**
 * 검토 대기 요청 조회
 */
export const usePendingRequests = ({
  userId,
  department,
  role,
  enabled = true,
}: {
  userId: string | undefined;
  department: string | undefined;
  role?: string;
  enabled?: boolean;
}) => {
  const [pendingRequests, setPendingRequests] = useState<PORequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPending = useCallback(async () => {
    if (!userId || !enabled) return;
    try {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from('requests')
        .select('*')
        .eq('status', 'pending')
        .is('deleted_at', null);

      query = applyRequestListFilter(query, department, 'review-history', role);
      query = query.neq('requester_id', userId);

      const { data, error } = await query.order('factory_shipment_date', { ascending: true });
      if (error) throw error;
      setPendingRequests(transformRequestData((data || []) as Record<string, unknown>[]));
    } catch (error) {
      console.error('검토 대기 요청 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, department, role, enabled]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  return { pendingRequests, loading, fetchPending };
};
