/**
 * 메인 대시보드 페이지
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/common/Header';
import { Toolbar, type ToolbarFilters } from '@/components/common/Toolbar';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { PriorityActions } from '@/components/dashboard/PriorityActions';
import { RequestFormTable } from '@/components/request/RequestFormTable';
import type { PORequest, DashboardStats } from '@/types/request';

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<PORequest[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    pending: 0,
    approved: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(false); // 초기값을 false로 변경
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ToolbarFilters>({});
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PORequest | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [reviewDetails, setReviewDetails] = useState('');
  const [newRequest, setNewRequest] = useState({
    customer: '',
    so_number: '',
    factory_shipment_date: new Date().toISOString().split('T')[0],
    category_of_request: '제품/상품 추가',
    priority: '일반' as '긴급' | '일반' | '보통',
    erp_code: '',
    item_name: '',
    quantity: 1,
    reason_for_request: '수요 예측 오류',
    request_details: '',
  });

  /**
   * 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
   */
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  /**
   * 요청 목록 조회 함수 (수동 호출용)
   */
  const fetchRequests = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const supabase = createClient();

      // 기본 쿼리 구성
      let query = supabase
        .from('requests')
        .select('*')
        .is('deleted_at', null); // Soft delete 제외

      // 검색 필터 적용
      if (searchQuery.trim()) {
        query = query.or(
          `customer.ilike.%${searchQuery}%,so_number.ilike.%${searchQuery}%,item_name.ilike.%${searchQuery}%,erp_code.ilike.%${searchQuery}%`
        );
      }

      // 상태 필터 적용
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // 완료 여부 필터 적용
      if (filters.completed !== undefined) {
        query = query.eq('completed', filters.completed === 'true');
      }

      // 정렬 적용
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // 데이터 변환 (Supabase에서 받은 데이터를 PORequest 타입으로 변환)
      const transformedData: PORequest[] = (data || []).map((item) => ({
        id: item.id,
        request_date: item.request_date || new Date().toISOString().split('T')[0],
        so_number: item.so_number,
        customer: item.customer,
        requesting_dept: item.requesting_dept,
        requester_id: item.requester_id,
        requester_name: item.requester_name,
        factory_shipment_date: item.factory_shipment_date,
        leadtime: item.leadtime,
        category_of_request: item.category_of_request,
        priority: item.priority || '일반',
        erp_code: item.erp_code,
        item_name: item.item_name,
        quantity: item.quantity,
        reason_for_request: item.reason_for_request,
        request_details: item.request_details || undefined,
        feasibility: item.feasibility || undefined,
        review_details: item.review_details || undefined,
        reviewing_dept: item.reviewing_dept || undefined,
        reviewer_id: item.reviewer_id || undefined,
        reviewer_name: item.reviewer_name || undefined,
        reviewed_at: item.reviewed_at || undefined,
        status: item.status,
        completed: item.completed,
        created_at: item.created_at,
        updated_at: item.updated_at,
        deleted_at: item.deleted_at || undefined,
      }));

      setRequests(transformedData);

      // 통계 계산
      const total = transformedData.length;
      const pending = transformedData.filter((r) => r.status === 'pending').length;
      const approved = transformedData.filter((r) => r.status === 'approved').length;
      const completed = transformedData.filter((r) => r.completed).length;

      setStats({ total, pending, approved, completed });
      setIsInitialLoad(false);
    } catch (error: any) {
      console.error('요청 목록 조회 오류:', error);
      // 네트워크 오류나 인증 오류 처리
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청 목록을 조회할 권한이 없습니다.');
      } else if (error?.message?.includes('JWT') || error?.message?.includes('token')) {
        toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
        router.push('/login');
      } else {
        toast.error('요청 목록을 불러오는 중 오류가 발생했습니다.');
      }
      setRequests([]);
      setStats({ total: 0, pending: 0, approved: 0, completed: 0 });
      setIsInitialLoad(false);
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery, filters.status, filters.completed, sortBy, sortOrder, router]);

  /**
   * 초기 로드 및 필터/정렬 변경 시 데이터 조회
   */
  useEffect(() => {
    if (!user || authLoading) {
      return;
    }

    // fetchRequests 함수 호출로 단순화
    fetchRequests();
  }, [fetchRequests]);

  // 로딩 중이거나 인증되지 않은 경우 로딩 표시
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#971B2F] mx-auto"></div>
          <p className="mt-4 text-[#67767F]">로딩 중...</p>
        </div>
      </div>
    );
  }

  /**
   * 요청 상세 보기 핸들러 (미리보기 다이얼로그)
   */
  const handleViewDetails = (requestId: string) => {
    if (requestId === 'all') {
      router.push('/requests');
      return;
    }
    
    const request = requests.find((r) => r.id === requestId);
    if (request) {
      setSelectedRequest(request);
      setViewDialogOpen(true);
    }
  };

  /**
   * 요청 승인 핸들러
   */
  const handleApprove = async (requestId: string) => {
    if (!user || !profile) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 권한 확인
    if (profile.role !== 'reviewer' && profile.role !== 'admin') {
      toast.error('검토자 또는 관리자만 요청을 승인할 수 있습니다.');
      console.warn(`현재 사용자 역할: ${profile.role}`);
      return;
    }

    try {
      const supabase = createClient();
      
      // feasibility와 status를 모두 'approved'로 업데이트
      const { data, error } = await supabase
        .from('requests')
        .update({
          feasibility: 'approved',
          status: 'approved',
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select();

      if (error) {
        console.error('Supabase 오류:', error);
        throw error;
      }

      console.log('승인 성공:', data);
      toast.success('요청이 승인되었습니다.');
      await fetchRequests();
    } catch (error: any) {
      console.error('요청 승인 오류:', error);
      console.error('오류 타입:', typeof error);
      console.error('오류 키:', Object.keys(error));
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 승인할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (error?.message) {
        toast.error(`요청 승인 실패: ${error.message}`);
      } else {
        toast.error('요청 승인 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      }
    }
  };

  /**
   * 요청 거절 다이얼로그 열기
   */
  const handleReject = (requestId: string) => {
    if (!user || !profile) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 권한 확인
    if (profile.role !== 'reviewer' && profile.role !== 'admin') {
      toast.error('검토자 또는 관리자만 요청을 거절할 수 있습니다.');
      console.warn(`현재 사용자 역할: ${profile.role}`);
      return;
    }

    setRejectRequestId(requestId);
    setReviewDetails('');
    setRejectDialogOpen(true);
  };

  /**
   * 요청 거절 확인 핸들러
   */
  const handleConfirmReject = async () => {
    if (!reviewDetails.trim()) {
      toast.error('검토 상세 내용을 입력해주세요.');
      return;
    }

    if (!user || !profile || !rejectRequestId) return;

    try {
      const supabase = createClient();
      
      // feasibility와 status를 모두 'rejected'로 업데이트
      const { data, error } = await supabase
        .from('requests')
        .update({
          feasibility: 'rejected',
          status: 'rejected',
          review_details: reviewDetails,
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', rejectRequestId)
        .select();

      if (error) {
        console.error('Supabase 오류:', error);
        throw error;
      }

      console.log('거절 성공:', data);
      toast.success('요청이 거절되었습니다.');
      setRejectDialogOpen(false);
      setRejectRequestId(null);
      setReviewDetails('');
      await fetchRequests();
    } catch (error: any) {
      console.error('요청 거절 오류:', error);
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 거절할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (error?.message) {
        toast.error(`요청 거절 실패: ${error.message}`);
      } else {
        toast.error('요청 거절 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      }
    }
  };

  /**
   * 검색 핸들러
   */
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  /**
   * 필터 변경 핸들러
   */
  const handleFilterChange = (newFilters: ToolbarFilters) => {
    setFilters(newFilters);
  };

  /**
   * 정렬 변경 핸들러
   */
  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };

  /**
   * 요청 추가 다이얼로그 열기
   */
  const handleAddRequest = () => {
    // 초기값 설정
    setNewRequest({
      customer: '',
      so_number: '',
      factory_shipment_date: new Date().toISOString().split('T')[0],
      category_of_request: '제품/상품 추가',
      priority: '일반' as '긴급' | '일반' | '보통',
      erp_code: '',
      item_name: '',
      quantity: 1,
      reason_for_request: '수요 예측 오류',
      request_details: '',
    });
    setAddDialogOpen(true);
  };

  /**
   * 새 요청 제출 핸들러
   */
  const handleSubmitNewRequest = async () => {
    if (!user || !profile) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 필수 필드 검증
    if (!newRequest.customer || !newRequest.so_number) {
      toast.error('고객과 SO번호는 필수 항목입니다.');
      return;
    }

    // 요청상세는 항상 필수
    if (!newRequest.request_details || newRequest.request_details.trim() === '') {
      toast.error('요청상세는 필수 항목입니다.');
      return;
    }

    // 조건부 필수값 검증: 일정 변경, 운송방법 변경이 아닌 경우 품목 정보 필수
    const isScheduleOrTransportChange = 
      newRequest.category_of_request === '일정 변경' || 
      newRequest.category_of_request === '운송방법 변경';
    
    if (!isScheduleOrTransportChange) {
      if (!newRequest.erp_code || !newRequest.item_name || !newRequest.quantity) {
        toast.error('품목코드, 품목명, 수량은 필수 항목입니다.');
        return;
      }
    }

    try {
      const supabase = createClient();

      const requestData = {
        ...newRequest,
        requesting_dept: profile.department,
        requester_id: user.id,
        requester_name: profile.full_name,
        request_date: new Date().toISOString().split('T')[0],
        status: 'pending' as const,
        completed: false,
        // 일정/운송방법 변경인 경우 품목 정보 null로 설정
        erp_code: isScheduleOrTransportChange ? (newRequest.erp_code || null) : newRequest.erp_code,
        item_name: isScheduleOrTransportChange ? (newRequest.item_name || null) : newRequest.item_name,
        quantity: isScheduleOrTransportChange ? (newRequest.quantity || null) : newRequest.quantity,
      };

      const { error } = await supabase
        .from('requests')
        .insert(requestData);

      if (error) {
        throw error;
      }

      toast.success('새 요청이 생성되었습니다.');
      setAddDialogOpen(false);
      await fetchRequests();
    } catch (error: any) {
      console.error('요청 생성 오류:', error);
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 생성할 권한이 없습니다.');
      } else if (error?.message) {
        toast.error(`요청 생성 실패: ${error.message}`);
      } else {
        toast.error('요청 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  /**
   * 요청 저장 핸들러
   */
  const handleSaveRequest = async (request: PORequest) => {
    if (!user) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    try {
      const supabase = createClient();

      // 본인 소유인지 확인
      if (request.requester_id !== user.id) {
        toast.error('본인의 요청만 수정할 수 있습니다.');
        return;
      }

      // 검토 전 상태인지 확인
      if (request.status !== 'pending') {
        toast.error('검토 전 상태의 요청만 수정할 수 있습니다.');
        return;
      }

      // 업데이트할 데이터 준비
      const updateData: Partial<PORequest> = {
        customer: request.customer,
        requesting_dept: request.requesting_dept,
        requester_name: request.requester_name,
        so_number: request.so_number,
        factory_shipment_date: request.factory_shipment_date,
        category_of_request: request.category_of_request,
        priority: request.priority,
        erp_code: request.erp_code,
        item_name: request.item_name,
        quantity: request.quantity,
        reason_for_request: request.reason_for_request,
        request_details: request.request_details,
        // 가능여부 변경 시 상태도 자동 업데이트
        feasibility: request.feasibility,
        status: request.feasibility === 'approved' ? 'approved' : request.feasibility === 'rejected' ? 'rejected' : 'pending',
      };

      const { error } = await supabase
        .from('requests')
        .update(updateData)
        .eq('id', request.id);

      if (error) {
        throw error;
      }

      toast.success('요청이 수정되었습니다.');
      await fetchRequests();
    } catch (error: any) {
      console.error('요청 수정 오류:', error);
      console.error('오류 상세:', JSON.stringify(error, null, 2));
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 수정할 권한이 없습니다.');
      } else if (error?.message) {
        toast.error(`요청 수정 실패: ${error.message}`);
      } else {
        toast.error('요청 수정 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  /**
   * 요청 삭제 핸들러
   */
  const handleDeleteRequest = async (id: string) => {
    if (!user) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    try {
      const request = requests.find((r) => r.id === id);
      if (!request) {
        toast.error('요청을 찾을 수 없습니다.');
        return;
      }

      // 본인 소유인지 확인
      if (request.requester_id !== user.id) {
        toast.error('본인의 요청만 삭제할 수 있습니다.');
        return;
      }

      // 검토 전 상태인지 확인
      if (request.status !== 'pending') {
        toast.error('검토 전 상태의 요청만 삭제할 수 있습니다.');
        return;
      }

      const supabase = createClient();

      // Soft delete (deleted_at 설정)
      const { error } = await supabase
        .from('requests')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast.success('요청이 삭제되었습니다.');
      await fetchRequests();
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    } catch (error: any) {
      console.error('요청 삭제 오류:', error);
      console.error('오류 상세:', JSON.stringify(error, null, 2));
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 삭제할 권한이 없습니다.');
      } else if (error?.message) {
        toast.error(`요청 삭제 실패: ${error.message}`);
      } else {
        toast.error('요청 삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    }
  };

  /**
   * 삭제 확인 다이얼로그 열기
   */
  const handleDeleteClick = (id: string) => {
    const request = requests.find((r) => r.id === id);
    if (!request) return;

    // 본인 소유인지 확인
    if (request.requester_id !== user?.id) {
      toast.error('본인의 요청만 삭제할 수 있습니다.');
      return;
    }

    // 검토 전 상태인지 확인
    if (request.status !== 'pending') {
      toast.error('검토 전 상태의 요청만 삭제할 수 있습니다.');
      return;
    }

    setRequestToDelete(id);
    setDeleteDialogOpen(true);
  };

  // 우선순위 요청 (현재 정렬 기준 적용)
  const priorityRequests = requests
    .filter((r) => !r.completed && r.status !== 'rejected')
    .sort((a, b) => {
      let compareValue = 0;
      
      // 정렬 기준에 따라 비교
      switch (sortBy) {
        case 'factory_shipment_date':
          compareValue = new Date(a.factory_shipment_date).getTime() - new Date(b.factory_shipment_date).getTime();
          break;
        case 'request_date':
          compareValue = new Date(a.request_date).getTime() - new Date(b.request_date).getTime();
          break;
        case 'created_at':
          compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'so_number':
          compareValue = a.so_number.localeCompare(b.so_number);
          break;
        case 'customer':
          compareValue = a.customer.localeCompare(b.customer);
          break;
        case 'priority':
          // 긴급 > 일반 > 보통 순서
          const priorityOrder = { '긴급': 0, '일반': 1, '보통': 2 };
          compareValue = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
          break;
        default:
          // 기본: 출하일 가까운 순
          compareValue = new Date(a.factory_shipment_date).getTime() - new Date(b.factory_shipment_date).getTime();
      }
      
      // 정렬 순서 적용
      return sortOrder === 'asc' ? compareValue : -compareValue;
    })
    .slice(0, 5);

  // (삭제됨: 최근 요청 카드는 더 이상 사용하지 않음)

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <Header
        userName={profile?.full_name || user.email?.split('@')[0] || '사용자'}
        userEmail={user.email || undefined}
      />

      <div className="container mx-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="text-[#67767F] hover:text-[#101820]">
                  홈
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-[#101820]">대시보드</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* 인사말 */}
          <div>
            <h1 className="text-3xl font-bold text-[#101820]">
              안녕하세요, {profile?.full_name || user.email?.split('@')[0] || '사용자'}님 👋
          </h1>
        </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="전체 요청"
              value={stats.total}
              subtitle={`총 ${stats.total}건`}
              icon="📋"
              themeColor="#A2B2C8"
            />
            <StatsCard
              title="검토 대기"
              value={stats.pending}
              subtitle="처리 필요"
              icon="🕐"
              themeColor="#67767F"
            />
            <StatsCard
              title="승인됨"
              value={stats.approved}
              subtitle={`승인률 ${stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%`}
              icon="✅"
              themeColor="#A2B2C8"
            />
            <StatsCard
              title="완료됨"
              value={stats.completed}
              subtitle="이번 달"
              icon="✅"
              themeColor="#B2B4B8"
            />
          </div>

          {/* Toolbar - 검색, 정렬, 필터 */}
          <Toolbar
            onSearch={handleSearch}
            onFilterChange={handleFilterChange}
            onSortChange={handleSortChange}
          />

          {/* 요청 접수 테이블과 검토 대기 (좌우 배치) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 요청 접수 테이블 (왼쪽 2/3) */}
            <div className="lg:col-span-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#971B2F] mx-auto"></div>
                    <p className="mt-4 text-[#67767F]">로딩 중...</p>
                  </div>
                </div>
              ) : (
                <RequestFormTable
                  requests={requests}
                  onAdd={handleAddRequest}
                  onSave={handleSaveRequest}
                  onDelete={handleDeleteClick}
                />
              )}
            </div>

            {/* 검토 대기 (오른쪽 1/3) */}
            <div className="lg:col-span-1">
              <PriorityActions
                requests={priorityRequests}
                onViewDetails={handleViewDetails}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 요청 상세 보기 다이얼로그 */}
      <AlertDialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>요청 상세 정보</AlertDialogTitle>
          </AlertDialogHeader>
          {selectedRequest && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-[#67767F]">고객</p>
                  <p className="text-[#101820]">{selectedRequest.customer}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">SO번호</p>
                  <p className="text-[#101820]">{selectedRequest.so_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청부서</p>
                  <p className="text-[#101820]">{selectedRequest.requesting_dept}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청자</p>
                  <p className="text-[#101820]">{selectedRequest.requester_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">출하일</p>
                  <p className="text-[#101820]">{selectedRequest.factory_shipment_date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청구분</p>
                  <p className="text-[#101820]">{selectedRequest.category_of_request}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">품목코드</p>
                  <p className="text-[#101820]">{selectedRequest.erp_code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">품목명</p>
                  <p className="text-[#101820]">{selectedRequest.item_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">수량</p>
                  <p className="text-[#101820]">{selectedRequest.quantity}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청사유</p>
                  <p className="text-[#101820]">{selectedRequest.reason_for_request}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-[#67767F]">요청상세</p>
                  <p className="text-[#101820] whitespace-pre-wrap">{selectedRequest.request_details || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">가능여부</p>
                  <p className="text-[#101820]">
                    {selectedRequest.feasibility === 'approved' && '승인'}
                    {selectedRequest.feasibility === 'rejected' && '거절'}
                    {selectedRequest.feasibility === 'pending' && '검토 대기'}
                    {!selectedRequest.feasibility && '미정'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">상태</p>
                  <p className="text-[#101820]">
                    {selectedRequest.status === 'pending' && '검토 대기'}
                    {selectedRequest.status === 'approved' && '승인됨'}
                    {selectedRequest.status === 'rejected' && '거절됨'}
                  </p>
                </div>
                {selectedRequest.review_details && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-[#67767F]">검토상세</p>
                    <p className="text-[#101820] whitespace-pre-wrap">{selectedRequest.review_details}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>요청 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 요청을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (requestToDelete) {
                  handleDeleteRequest(requestToDelete);
                }
              }}
              className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 요청 추가 다이얼로그 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>새 요청 추가</DialogTitle>
            <DialogDescription>
              PO 변경 요청 정보를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">고객 <span className="text-red-500">*</span></Label>
                <Select
                  value={newRequest.customer}
                  onValueChange={(value) => setNewRequest({ ...newRequest, customer: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="고객을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ABC Corp">ABC Corp</SelectItem>
                    <SelectItem value="XYZ Inc">XYZ Inc</SelectItem>
                    <SelectItem value="DEF Ltd">DEF Ltd</SelectItem>
                    <SelectItem value="GHI Co">GHI Co</SelectItem>
                    <SelectItem value="JKL Inc">JKL Inc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="so_number">SO번호 <span className="text-red-500">*</span></Label>
                <Input
                  id="so_number"
                  value={newRequest.so_number}
                  onChange={(e) => setNewRequest({ ...newRequest, so_number: e.target.value })}
                  placeholder="SO번호를 입력하세요"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="factory_shipment_date">출하일 <span className="text-red-500">*</span></Label>
                <Input
                  id="factory_shipment_date"
                  type="date"
                  value={newRequest.factory_shipment_date}
                  onChange={(e) => setNewRequest({ ...newRequest, factory_shipment_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category_of_request">요청구분 <span className="text-red-500">*</span></Label>
                <Select
                  value={newRequest.category_of_request}
                  onValueChange={(value) => setNewRequest({ ...newRequest, category_of_request: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="제품/상품 추가">제품/상품 추가</SelectItem>
                    <SelectItem value="자재 추가">자재 추가</SelectItem>
                    <SelectItem value="제품/상품 삭제">제품/상품 삭제</SelectItem>
                    <SelectItem value="자재 삭제">자재 삭제</SelectItem>
                    <SelectItem value="품목 코드 변경">품목 코드 변경</SelectItem>
                    <SelectItem value="일정 변경">일정 변경</SelectItem>
                    <SelectItem value="운송방법 변경">운송방법 변경</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">우선순위 <span className="text-red-500">*</span></Label>
                <Select
                  value={newRequest.priority}
                  onValueChange={(value) => setNewRequest({ ...newRequest, priority: value as '긴급' | '일반' | '보통' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="긴급">긴급</SelectItem>
                    <SelectItem value="일반">일반</SelectItem>
                    <SelectItem value="보통">보통</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="erp_code">
                  품목코드 
                  {newRequest.category_of_request !== '일정 변경' && 
                   newRequest.category_of_request !== '운송방법 변경' && 
                   <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="erp_code"
                  value={newRequest.erp_code}
                  onChange={(e) => setNewRequest({ ...newRequest, erp_code: e.target.value })}
                  placeholder="ERP 코드를 입력하세요"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item_name">
                  품목명 
                  {newRequest.category_of_request !== '일정 변경' && 
                   newRequest.category_of_request !== '운송방법 변경' && 
                   <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="item_name"
                  value={newRequest.item_name}
                  onChange={(e) => setNewRequest({ ...newRequest, item_name: e.target.value })}
                  placeholder="품목명을 입력하세요"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  수량 
                  {newRequest.category_of_request !== '일정 변경' && 
                   newRequest.category_of_request !== '운송방법 변경' && 
                   <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={newRequest.quantity}
                  onChange={(e) => setNewRequest({ ...newRequest, quantity: parseInt(e.target.value) || 1 })}
                />
        </div>
              <div className="space-y-2">
                <Label htmlFor="reason_for_request">요청사유 <span className="text-red-500">*</span></Label>
                <Select
                  value={newRequest.reason_for_request}
                  onValueChange={(value) => setNewRequest({ ...newRequest, reason_for_request: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="수요 예측 오류">수요 예측 오류</SelectItem>
                    <SelectItem value="재고 확인 부족">재고 확인 부족</SelectItem>
                    <SelectItem value="영업적 이슈(이벤트 등)">영업적 이슈(이벤트 등)</SelectItem>
                    <SelectItem value="재고 부족">재고 부족</SelectItem>
                    <SelectItem value="적재공간 과부족">적재공간 과부족</SelectItem>
                    <SelectItem value="품질 이슈">품질 이슈</SelectItem>
                    <SelectItem value="선적스케줄 변경">선적스케줄 변경</SelectItem>
                    <SelectItem value="고객 요청">고객 요청</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="request_details">요청상세 <span className="text-red-500">*</span></Label>
              <Textarea
                id="request_details"
                value={newRequest.request_details}
                onChange={(e) => setNewRequest({ ...newRequest, request_details: e.target.value })}
                placeholder="요청 상세 내용을 입력하세요"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSubmitNewRequest} className="bg-[#971B2F] hover:bg-[#7A1626]">
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거절 사유 입력 다이얼로그 */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>요청 거절 사유 입력</AlertDialogTitle>
            <AlertDialogDescription>
              거절 사유를 입력해주세요. (필수)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <textarea
              className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#971B2F]"
              placeholder="거절 사유를 상세히 입력해주세요..."
              value={reviewDetails}
              onChange={(e) => setReviewDetails(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRejectDialogOpen(false);
              setReviewDetails('');
              setRejectRequestId(null);
            }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
