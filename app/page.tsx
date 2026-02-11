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
import type { PORequest, DashboardStats, FeasibilityStatus, RequestStatus } from '@/types/request';
import { sendUrgentRequestNotification, sendNewRequestNotification } from '@/lib/notification-utils';

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  
  // 역할 체크 헬퍼 함수
  const hasRole = (role: string): boolean => {
    if (!profile?.role) return false;
    // 콤마로 구분된 역할들을 체크
    const roles = profile.role.split(',').map(r => r.trim());
    return roles.includes(role);
  };

  // jhee105@inbody.com 계정은 요청자와 검토자 권한 모두 가짐
  const isRequester = hasRole('requester') || user?.email === 'jhee105@inbody.com';
  const isReviewer = hasRole('reviewer') || hasRole('admin') || user?.email === 'jhee105@inbody.com';
  const isAdmin = hasRole('admin');
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
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveRequestId, setApproveRequestId] = useState<string | null>(null);
  const [reviewDetails, setReviewDetails] = useState('');
  const [currentItem, setCurrentItem] = useState({ erp_code: '', item_name: '', quantity: 0 });
  const [editingFeasibility, setEditingFeasibility] = useState<FeasibilityStatus | null>(null);
  const [editingReviewDetails, setEditingReviewDetails] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [requestType, setRequestType] = useState<'existing' | 'new'>('new');
  const [allPendingDialogOpen, setAllPendingDialogOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    customer: '',
    so_number: '',
    factory_shipment_date: new Date().toISOString().split('T')[0],
    desired_shipment_date: '',
    confirmed_shipment_date: '',
    category_of_request: '품목 추가',
    priority: '일반' as '긴급' | '일반' | '보통',
    shipping_method: '',
    erp_code: '',
    item_name: '',
    quantity: 0,
    reason_for_request: '수요 예측 오류',
    request_details: '',
    items: [] as Array<{ erp_code: string; item_name: string; quantity: number }>,
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

      // Admin 역할: 모든 요청 조회
      if (isAdmin) {
        // 필터 없이 모든 요청 조회
      }
      // Requester/Reviewer: department와 고객, 요청부서가 모두 동일한 건만 조회
      else if ((isRequester || isReviewer) && profile?.department) {
        query = query
          .eq('customer', profile.department)
          .eq('requesting_dept', profile.department);
      }

      // 검색 필터 적용 (고객, 요청부서, 요청자, SO번호)
      if (searchQuery.trim()) {
        query = query.or(
          `customer.ilike.%${searchQuery}%,requesting_dept.ilike.%${searchQuery}%,requester_name.ilike.%${searchQuery}%,so_number.ilike.%${searchQuery}%`
        );
      }

      // 구분 필터 적용
      if (filters.request_type) {
        query = query.eq('request_type', filters.request_type);
      }

      // 상태 필터 적용
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // 완료 여부 필터 적용
      if (filters.completed !== undefined) {
        query = query.eq('completed', filters.completed === 'true');
      }

      // 우선순위 필터 적용
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
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
        so_number: item.so_number || '',
        customer: item.customer,
        requesting_dept: item.requesting_dept,
        requester_id: item.requester_id,
        requester_name: item.requester_name,
        request_type: item.request_type || undefined,
        factory_shipment_date: item.factory_shipment_date,
        desired_shipment_date: item.desired_shipment_date || undefined,
        confirmed_shipment_date: item.confirmed_shipment_date || undefined,
        leadtime: item.leadtime,
        category_of_request: item.category_of_request,
        priority: item.priority || '일반',
        shipping_method: item.shipping_method || undefined,
        erp_code: item.erp_code || '',
        item_name: item.item_name || '',
        quantity: item.quantity || 0,
        reason_for_request: item.reason_for_request,
        request_details: item.request_details || undefined,
        items: item.items ? (typeof item.items === 'string' ? JSON.parse(item.items) : item.items) : undefined,
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
  }, [user, profile, isRequester, isReviewer, isAdmin, searchQuery, filters.request_type, filters.status, filters.completed, filters.priority, sortBy, sortOrder, router]);

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
      setEditingFeasibility(request.feasibility || null);
      setEditingReviewDetails(request.review_details || '');
      setViewDialogOpen(true);
    }
  };

  /**
   * 확인 버튼 클릭 핸들러 (확인 팝업 표시)
   */
  const handleConfirmClick = () => {
    if (!editingReviewDetails.trim()) {
      toast.error('검토상세 내용을 입력해주세요.');
      return;
    }
    
    if (!editingFeasibility) {
      toast.error('가능여부를 선택해주세요.');
      return;
    }
    
    setConfirmDialogOpen(true);
  };

  /**
   * 가능여부 변경 핸들러 (상태 자동 변경)
   */
  const handleFeasibilityChange = async () => {
    if (!selectedRequest || !user || !profile) return;

    // 권한 확인
    if (!isReviewer && !isAdmin) {
      toast.error('검토자 또는 관리자만 가능여부를 변경할 수 있습니다.');
      return;
    }

    // 검토상세 필수 확인
    if (!editingReviewDetails.trim()) {
      toast.error('검토상세 내용을 입력해주세요.');
      return;
    }

    if (!editingFeasibility) {
      toast.error('가능여부를 선택해주세요.');
      return;
    }

    try {
      const supabase = createClient();
      
      // 가능여부에 따른 상태 매핑
      let newStatus: RequestStatus;
      let newFeasibility: FeasibilityStatus = editingFeasibility;
      
      if (editingFeasibility === 'approved') {
        newStatus = 'approved';
      } else if (editingFeasibility === 'rejected') {
        newStatus = 'rejected';
      } else {
        newStatus = 'pending';
      }

      const { error } = await supabase
        .from('requests')
        .update({
          feasibility: newFeasibility,
          status: newStatus,
          review_details: editingReviewDetails,
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedRequest.id);

      if (error) {
        console.error('Supabase 오류:', error);
        throw error;
      }

      toast.success('가능여부가 변경되었습니다.');
      
      // selectedRequest도 업데이트
      if (selectedRequest) {
        setSelectedRequest({ 
          ...selectedRequest, 
          feasibility: newFeasibility, 
          status: newStatus, 
          review_details: editingReviewDetails 
        });
      }
      
      setConfirmDialogOpen(false);
      setViewDialogOpen(false);
      await fetchRequests();
    } catch (error: any) {
      console.error('가능여부 변경 오류:', error);
      
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('가능여부를 변경할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (error?.message) {
        toast.error(`가능여부 변경 실패: ${error.message}`);
      } else {
        toast.error('가능여부 변경 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      }
    }
  };

  /**
   * 요청 승인 다이얼로그 열기
   */
  const handleApprove = (requestId: string) => {
    if (!user || !profile) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 권한 확인
    if (!isReviewer && !isAdmin) {
      toast.error('검토자 또는 관리자만 요청을 승인할 수 있습니다.');
      return;
    }

    setApproveRequestId(requestId);
    setReviewDetails('');
    setApproveDialogOpen(true);
  };

  /**
   * 요청 승인 확인 핸들러
   */
  const handleConfirmApprove = async () => {
    if (!reviewDetails.trim()) {
      toast.error('검토 상세 내용을 입력해주세요.');
      return;
    }

    if (!user || !profile || !approveRequestId) return;

    try {
      const supabase = createClient();
      
      // feasibility와 status를 모두 'approved'로 업데이트
      const { data, error } = await supabase
        .from('requests')
        .update({
          feasibility: 'approved',
          status: 'approved',
          review_details: reviewDetails,
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approveRequestId)
        .select();

      if (error) {
        console.error('Supabase 오류:', error);
        throw error;
      }

      console.log('승인 성공:', data);
      toast.success('요청이 승인되었습니다.');
      setApproveDialogOpen(false);
      setApproveRequestId(null);
      setReviewDetails('');
      await fetchRequests();
    } catch (error: any) {
      console.error('요청 승인 오류:', error);
      
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
    if (!isReviewer && !isAdmin) {
      toast.error('검토자 또는 관리자만 요청을 거절할 수 있습니다.');
      console.warn(`현재 사용자 역할: ${profile?.role}`);
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
  const handleAddRequest = (type: 'existing' | 'new') => {
    setRequestType(type);
    // 초기값 설정
    setNewRequest({
      customer: '',
      so_number: '',
      factory_shipment_date: new Date().toISOString().split('T')[0],
      desired_shipment_date: '',
      confirmed_shipment_date: '',
      category_of_request: '품목 추가',
      priority: '보통' as '긴급' | '일반' | '보통',
      shipping_method: '',
      erp_code: '',
      item_name: '',
      quantity: 0,
      reason_for_request: '수요 예측 오류',
      request_details: '',
      items: [] as Array<{ erp_code: string; item_name: string; quantity: number }>,
    });
    setAddDialogOpen(true);
  };

  /**
   * 품목 추가 핸들러
   */
  const handleAddItem = () => {
    if (!currentItem.erp_code || !currentItem.item_name) {
      toast.error('품목코드와 품목명을 입력해주세요.');
      return;
    }
    
    setNewRequest({
      ...newRequest,
      items: [...newRequest.items, { ...currentItem }],
    });
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
  };

  /**
   * 품목 삭제 핸들러
   */
  const handleRemoveItem = (index: number) => {
    setNewRequest({
      ...newRequest,
      items: newRequest.items.filter((_, i) => i !== index),
    });
  };

  /**
   * Excel 파일 업로드 핸들러
   */
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // xlsx 라이브러리 동적 import
      const XLSX = await import('xlsx');

      // FileReader를 사용해 파일 읽기
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            toast.error('파일을 읽을 수 없습니다.');
            return;
          }

          const items: Array<{ erp_code: string; item_name: string; quantity: number }> = [];

          // 파일 확장자 확인
          const fileExtension = file.name.split('.').pop()?.toLowerCase();

          if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            // Excel 파일 파싱
            const workbook = XLSX.read(data, { type: 'array' });
            
            // 첫 번째 시트 사용
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // 첫 번째 행을 헤더로 사용하여 JSON으로 변환
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1, // 첫 번째 행을 헤더로 사용
              defval: '', // 빈 셀은 빈 문자열로
              raw: false, // 텍스트로 변환
            }) as any[][];

            if (jsonData.length < 2) {
              toast.error('Excel 파일에 데이터가 없습니다.');
              return;
            }

            // 헤더 행 찾기 (품목코드, 품목명, 수량)
            const headerRow = jsonData[0];
            const erpCodeIndex = headerRow.findIndex((cell: any) => 
              String(cell).toLowerCase().includes('품목코드') || 
              String(cell).toLowerCase().includes('erp') ||
              String(cell).toLowerCase().includes('code')
            );
            const itemNameIndex = headerRow.findIndex((cell: any) => 
              String(cell).toLowerCase().includes('품목명') || 
              String(cell).toLowerCase().includes('item') ||
              String(cell).toLowerCase().includes('name')
            );
            const quantityIndex = headerRow.findIndex((cell: any) => 
              String(cell).toLowerCase().includes('수량') || 
              String(cell).toLowerCase().includes('quantity') ||
              String(cell).toLowerCase().includes('qty')
            );

            // 기본값: 순서대로 (품목코드, 품목명, 수량)
            const defaultErpCodeIndex = erpCodeIndex >= 0 ? erpCodeIndex : 0;
            const defaultItemNameIndex = itemNameIndex >= 0 ? itemNameIndex : 1;
            const defaultQuantityIndex = quantityIndex >= 0 ? quantityIndex : 2;

            // 데이터 행 파싱
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!row || row.length === 0) continue;

              const erpCode = String(row[defaultErpCodeIndex] || '').trim();
              const itemName = String(row[defaultItemNameIndex] || '').trim();
              const quantity = parseInt(String(row[defaultQuantityIndex] || '0')) || 0;

              // 빈 행은 건너뛰기
              if (!erpCode && !itemName) continue;

              items.push({
                erp_code: erpCode,
                item_name: itemName,
                quantity: quantity,
              });
            }
          } else if (fileExtension === 'csv') {
            // CSV 파일 파싱 (더 정교한 파싱)
            const text = new TextDecoder('utf-8').decode(data as ArrayBuffer);
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            
            if (lines.length < 2) {
              toast.error('CSV 파일에 데이터가 없습니다.');
              return;
            }

            // 첫 줄은 헤더로 건너뛰기
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              // CSV 파싱 (쉼표로 구분, 따옴표 처리)
              const columns: string[] = [];
              let currentColumn = '';
              let inQuotes = false;

              for (let j = 0; j < line.length; j++) {
                const char = line[j];
                
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                  columns.push(currentColumn.trim());
                  currentColumn = '';
                } else {
                  currentColumn += char;
                }
              }
              columns.push(currentColumn.trim()); // 마지막 컬럼

              if (columns.length >= 3) {
                const erpCode = columns[0].replace(/^"|"$/g, '').trim(); // 따옴표 제거
                const itemName = columns[1].replace(/^"|"$/g, '').trim();
                const quantity = parseInt(columns[2].replace(/^"|"$/g, '')) || 0;

                if (erpCode || itemName) {
                  items.push({
                    erp_code: erpCode,
                    item_name: itemName,
                    quantity: quantity,
                  });
                }
              }
            }
          } else {
            toast.error('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv만 지원)');
            return;
          }

          if (items.length > 0) {
            setNewRequest({
              ...newRequest,
              items: [...newRequest.items, ...items],
            });
            toast.success(`${items.length}개의 품목이 추가되었습니다.`);
          } else {
            toast.error('유효한 데이터가 없습니다. Excel 파일 형식을 확인해주세요.');
          }
        } catch (error: any) {
          console.error('Excel 파일 파싱 오류:', error);
          toast.error(`Excel 파일을 읽는 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}`);
        }
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      console.error('Excel 파일 업로드 오류:', error);
      toast.error(`파일 업로드 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      // 파일 입력 초기화 (같은 파일을 다시 업로드할 수 있도록)
      event.target.value = '';
    }
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
    if (!newRequest.customer) {
      toast.error('고객은 필수 항목입니다.');
      return;
    }
    
    // SO 번호는 'PO 수정 요청'일 때만 필수
    if (requestType === 'existing' && !newRequest.so_number) {
      toast.error('SO번호는 필수 항목입니다.');
      return;
    }
    
    // 운송방법은 'PO 수정 요청'이고 '운송방법 변경'일 때 필수
    if (requestType === 'existing' && newRequest.category_of_request === '운송방법 변경' && !newRequest.shipping_method) {
      toast.error('운송방법을 선택해주세요.');
      return;
    }

    // 요청상세는 항상 필수
    if (!newRequest.request_details || newRequest.request_details.trim() === '') {
      toast.error('요청상세는 필수 항목입니다.');
      return;
    }

    // 조건부 필수값 검증: 출하일정 변경, 운송방법 변경이 아닌 경우 품목 정보 필수
    const isScheduleOrTransportChange = 
      newRequest.category_of_request === '출하일정 변경' || 
      newRequest.category_of_request === '운송방법 변경';
    
    if (!isScheduleOrTransportChange) {
      // 품목 목록이 비어있으면 오류
      if (newRequest.items.length === 0) {
        toast.error('최소 1개 이상의 품목을 추가해주세요.');
        return;
      }
    }

    // requesting_dept 확인
    if (!profile.department) {
      toast.error('사용자 프로필의 부서 정보가 없습니다. 관리자에게 문의하세요.');
      return;
    }

    // 품목 목록 준비
    const itemsData = newRequest.items.length > 0 ? newRequest.items : null;
    const firstItem = newRequest.items.length > 0 ? newRequest.items[0] : null;

    // requestData를 try 블록 밖에서 선언 (에러 로깅을 위해)
    let requestData: any = null;

    try {
      const supabase = createClient();

      // 기본 requestData 생성 (확실히 존재하는 필드만 사용)
      requestData = {
        customer: newRequest.customer,
        requesting_dept: profile.department,
        requester_id: user.id,
        requester_name: profile.full_name,
        request_date: new Date().toISOString().split('T')[0],
        category_of_request: newRequest.category_of_request,
        priority: newRequest.priority,
        reason_for_request: newRequest.reason_for_request,
        request_details: newRequest.request_details,
        status: 'pending',
        completed: false,
        request_type: requestType, // 구분: 기존/신규
      };
      
      // SO 번호 설정
      if (requestType === 'existing') {
        // PO 수정 요청: SO 번호 필수
        requestData.so_number = newRequest.so_number || '';
      } else {
        // PO 추가 요청: SO 번호는 선택사항 (null 허용)
        requestData.so_number = newRequest.so_number || null;
      }
      
      // 출하일 설정
      // factory_shipment_date: 현재 출하일 입력값 (필수)
      // desired_shipment_date: 희망 출하일 입력값
      // confirmed_shipment_date: 확정 출하일 입력값 (검토자/관리자만)
      
      // 현재 출하일 (필수 필드)
      requestData.factory_shipment_date = newRequest.factory_shipment_date;
      
      // 희망 출하일 (입력된 경우에만 저장)
      if (newRequest.desired_shipment_date) {
        requestData.desired_shipment_date = newRequest.desired_shipment_date;
      }
      
      // 확정 출하일 (검토자/관리자만 입력 가능, 입력된 경우에만 저장)
      if (newRequest.confirmed_shipment_date && (isReviewer || isAdmin)) {
        requestData.confirmed_shipment_date = newRequest.confirmed_shipment_date;
      }
      
      // 운송방법은 'PO 수정 요청'이고 '운송방법 변경'일 때만 포함
      if (requestType === 'existing' && newRequest.category_of_request === '운송방법 변경' && newRequest.shipping_method) {
        requestData.shipping_method = newRequest.shipping_method;
      }

      // 품목 정보는 선택적으로 추가 (기본값: 빈 문자열 또는 0)
      requestData.erp_code = (firstItem && firstItem.erp_code) ? firstItem.erp_code : '';
      requestData.item_name = (firstItem && firstItem.item_name) ? firstItem.item_name : '';
      requestData.quantity = (firstItem && firstItem.quantity !== undefined && firstItem.quantity !== null) ? firstItem.quantity : 0;
      
      // items JSONB 필드에 품목 목록 저장
      if (itemsData && itemsData.length > 0) {
        requestData.items = itemsData;
      }
      
      console.log('=== 요청 생성 시작 ===');
      console.log('전송할 데이터:', JSON.stringify(requestData, null, 2));

      const { data: createdRequest, error } = await supabase
        .from('requests')
        .insert(requestData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('=== 요청 생성 성공 ===');
      console.log('생성된 요청 ID:', createdRequest.id);
      
      toast.success('새 요청이 생성되었습니다.');
      
      // 다이얼로그 닫기 (성공 시에만)
      setAddDialogOpen(false);
      
      // 요청 목록 새로고침
      try {
        await fetchRequests();
      } catch (fetchError) {
        // fetchRequests 내부에서 이미 오류를 처리하므로 여기서는 무시
        console.warn('요청 목록 새로고침 중 오류 (무시됨):', fetchError);
      }
      
      // 알람 전송 (에러가 발생해도 요청 생성은 성공으로 처리)
      if (createdRequest) {
        try {
          const soNumber = requestType === 'existing' ? newRequest.so_number : '';
          
          // 우선순위가 '긴급'이거나 신규 접수된 건이면 모든 사용자에게 알람 전송
          if (newRequest.priority === '긴급') {
            // 긴급 요청 알람 전송
            await sendUrgentRequestNotification(
              createdRequest.id,
              soNumber,
              newRequest.customer,
              profile.full_name
            );
            console.log('긴급 알람 전송 완료');
          } else {
            // 신규 접수된 건 알람 전송 (모든 사용자에게)
            await sendNewRequestNotification(
              createdRequest.id,
              soNumber,
              newRequest.customer,
              profile.full_name,
              newRequest.priority
            );
            console.log('신규 접수 알람 전송 완료');
          }
        } catch (notificationError) {
          // 알람 전송 실패는 무시 (콘솔에만 로깅)
          console.warn('알람 전송 실패 (무시됨):', notificationError);
        }
      }
    } catch (error: any) {
      console.error('=== 요청 생성 오류 ===');
      console.error('전체 에러 객체:', error);
      console.error('에러 타입:', typeof error);
      console.error('에러 코드:', error?.code);
      console.error('에러 메시지:', error?.message);
      console.error('에러 상세:', error?.details);
      console.error('에러 힌트:', error?.hint);
      console.error('전송한 데이터:', requestData);
      
      // 에러 코드별 처리
      if (error?.code === 'PGRST301' || error?.message?.includes('permission')) {
        toast.error('요청을 생성할 권한이 없습니다.');
      } else if (error?.code === 'PGRST204') {
        // Schema cache 오류
        toast.error('데이터베이스 스키마 오류입니다. 페이지를 새로고침하거나 관리자에게 문의하세요.');
        console.error('PGRST204: 스키마 캐시에서 컬럼을 찾을 수 없습니다. Supabase 대시보드에서 테이블 구조를 확인하세요.');
      } else if (error?.code === '23514') {
        // CHECK constraint violation
        toast.error('입력값이 유효하지 않습니다. 품목을 1개 이상 추가하고 수량은 양수로 입력해주세요.');
      } else if (error?.code === '23502') {
        // NOT NULL constraint violation
        toast.error('필수 항목이 누락되었습니다. 모든 필수 필드를 입력해주세요.');
      } else if (error?.message) {
        toast.error(`요청 생성 실패: ${error.message}`);
      } else {
        // 에러 객체 전체를 문자열로 변환
        const errorString = JSON.stringify(error, Object.getOwnPropertyNames(error));
        toast.error(`요청 생성 중 오류가 발생했습니다. 콘솔을 확인해주세요.`);
        console.error('변환된 에러:', errorString);
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

  // 검토 대기 요청 (pending 상태만)
  // 검토자 권한: 고객이 '미국법인'이고 요청부서가 '미국법인'이 아닌 건만 조회
  const pendingRequests = requests.filter((r) => {
    if (r.status !== 'pending' || r.completed) return false;
    
    // 검토자 권한이 있는 경우: 고객=미국법인, 요청부서≠미국법인
    if (isReviewer && !isAdmin) {
      return r.customer === '미국법인' && r.requesting_dept !== '미국법인';
    }
    
    // 관리자는 모든 건 조회
    if (isAdmin) {
      return true;
    }
    
    return false;
  });
  
  // 우선순위 요청 (대표 6개만 표시)
  const priorityRequests = pendingRequests
    .sort((a, b) => {
      // 우선순위: 긴급 > 보통
      const priorityOrder: Record<'긴급' | '보통' | '일반', number> = { '긴급': 0, '보통': 1, '일반': 1 };
      const priorityDiff = (priorityOrder[a.priority as '긴급' | '보통' | '일반'] || 1) - (priorityOrder[b.priority as '긴급' | '보통' | '일반'] || 1);
      if (priorityDiff !== 0) return priorityDiff;
      
      // 같은 우선순위면 요청일 최신순
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 6);
  
  // 전체 대기 내역 (나머지)
  const remainingPendingRequests = pendingRequests.slice(6);

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

          {/* 요청 접수 테이블 (가운데 길게 배치) */}
          <div className="w-full">
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

          {/* 검토 대기 (테이블 아래 그리드 형식) */}
          <div className="w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-[#101820]">검토 대기</h2>
              {pendingRequests.length > 6 && (
                <Button
                  onClick={() => setAllPendingDialogOpen(true)}
                  variant="outline"
                  className="text-[#971B2F] border-[#971B2F] hover:bg-[#971B2F] hover:text-white"
                >
                  전체 대기 내역 ({pendingRequests.length}건)
                </Button>
              )}
            </div>
            {priorityRequests.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-[#E5E7EB]">
                <p className="text-[#67767F]">검토 대기 중인 요청이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {priorityRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-white rounded-lg border border-[#E5E7EB] p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-[#67767F]">
                        {request.so_number ? `SO: ${request.so_number}` : '신규'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        request.priority === '긴급' ? 'bg-red-100 text-red-700' : 
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {request.priority}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-[#101820] mb-1">{request.customer}</h3>
                    <p className="text-sm text-[#67767F] mb-3">{request.category_of_request}</p>
                    <div className="text-sm text-[#67767F] mb-4">
                      <p>출하일: {request.factory_shipment_date}</p>
                      <p>리드타임: {request.leadtime || 0}일</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewDetails(request.id)}
                        className="flex-1 px-3 py-2 text-sm bg-[#A2B2C8] text-white rounded hover:bg-[#8A9BB1] transition-colors"
                      >
                        상세보기
                      </button>
                      {(isReviewer || isAdmin) && (
                        <>
                          <button
                            onClick={() => handleApprove(request.id)}
                            className="flex-1 px-3 py-2 text-sm bg-[#4A9B8E] text-white rounded hover:bg-[#3A7B6E] transition-colors"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="flex-1 px-3 py-2 text-sm bg-[#971B2F] text-white rounded hover:bg-[#7A1626] transition-colors"
                          >
                            반려
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  <p className="text-sm font-medium text-[#67767F] mb-2">가능여부</p>
                  {(isReviewer || isAdmin) ? (
                    <Select
                      value={
                        editingFeasibility === 'approved' ? '가능' :
                        editingFeasibility === 'rejected' ? '불가능' :
                        editingFeasibility === 'pending' ? '보류' : ''
                      }
                      onValueChange={(value: '가능' | '불가능' | '보류') => {
                        setEditingFeasibility(
                          value === '가능' ? 'approved' :
                          value === '불가능' ? 'rejected' : 'pending'
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="가능여부 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="가능">가능</SelectItem>
                        <SelectItem value="불가능">불가능</SelectItem>
                        <SelectItem value="보류">보류</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-[#101820]">
                      {selectedRequest.feasibility === 'approved' && '가능'}
                      {selectedRequest.feasibility === 'rejected' && '불가능'}
                      {selectedRequest.feasibility === 'pending' && '보류'}
                      {!selectedRequest.feasibility && '미정'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">상태</p>
                  <p className="text-[#101820]">
                    {selectedRequest.status === 'pending' && '검토대기'}
                    {selectedRequest.status === 'approved' && '승인'}
                    {selectedRequest.status === 'rejected' && '반려'}
                    {selectedRequest.status === 'in_review' && '검토중'}
                    {selectedRequest.status === 'completed' && '완료'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-[#67767F] mb-2">검토상세</p>
                  {(isReviewer || isAdmin) ? (
                    <Textarea
                      value={editingReviewDetails}
                      onChange={(e) => setEditingReviewDetails(e.target.value)}
                      placeholder="검토상세 내용을 입력해주세요 (필수)"
                      className="min-h-[100px]"
                    />
                  ) : (
                    <p className="text-[#101820] whitespace-pre-wrap">
                      {selectedRequest.review_details || '-'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            {(isReviewer || isAdmin) && (
              <Button
                onClick={handleConfirmClick}
                className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
                disabled={!editingFeasibility || !editingReviewDetails.trim()}
              >
                확인
              </Button>
            )}
            <AlertDialogCancel onClick={() => {
              setEditingFeasibility(null);
              setEditingReviewDetails('');
            }}>
              닫기
            </AlertDialogCancel>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {requestType === 'existing' ? 'PO 수정 요청' : 'PO 추가 요청'}
            </DialogTitle>
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
                    <SelectItem value="미국법인">미국법인</SelectItem>
                    <SelectItem value="중국법인">중국법인</SelectItem>
                    <SelectItem value="중국생산법인">중국생산법인</SelectItem>
                    <SelectItem value="일본법인">일본법인</SelectItem>
                    <SelectItem value="유럽법인">유럽법인</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* SO 번호 필드 */}
              <div className="space-y-2">
                <Label htmlFor="so_number">
                  SO번호 
                  {requestType === 'existing' && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="so_number"
                  value={newRequest.so_number}
                  onChange={(e) => setNewRequest({ ...newRequest, so_number: e.target.value })}
                  placeholder="SO번호를 입력하세요"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* 현재 출하일 (항상 표시) */}
              <div className="space-y-2">
                <Label htmlFor="factory_shipment_date">
                  현재 출하일 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="factory_shipment_date"
                  type="date"
                  value={newRequest.factory_shipment_date}
                  onChange={(e) => setNewRequest({ ...newRequest, factory_shipment_date: e.target.value })}
                />
              </div>
              {/* 희망 출하일 (PO 추가 요청일 때만 표시) */}
              {requestType === 'new' && (
                <div className="space-y-2">
                  <Label htmlFor="desired_shipment_date">희망 출하일</Label>
                  <Input
                    id="desired_shipment_date"
                    type="date"
                    value={newRequest.desired_shipment_date}
                    onChange={(e) => setNewRequest({ ...newRequest, desired_shipment_date: e.target.value })}
                  />
                </div>
              )}
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
                    {requestType === 'new' ? (
                      // PO 추가 요청: 품목 추가, 수량 추가만 표시
                      <>
                        <SelectItem value="품목 추가">품목 추가</SelectItem>
                        <SelectItem value="수량 추가">수량 추가</SelectItem>
                      </>
                    ) : (
                      // PO 수정 요청: 품목 추가, 수량 추가 제외
                      <>
                        <SelectItem value="품목 삭제">품목 삭제</SelectItem>
                        <SelectItem value="수량 삭제">수량 삭제</SelectItem>
                        <SelectItem value="품목 코드 변경">품목 코드 변경</SelectItem>
                        <SelectItem value="출하일정 변경">출하일정 변경</SelectItem>
                        <SelectItem value="운송방법 변경">운송방법 변경</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* 운송방법 필드 (PO 수정 요청이고 요청구분이 '운송방법 변경'일 때만 표시) */}
            {requestType === 'existing' && newRequest.category_of_request === '운송방법 변경' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipping_method">변경 운송방법 <span className="text-red-500">*</span></Label>
                  <Select
                    value={newRequest.shipping_method}
                    onValueChange={(value) => setNewRequest({ ...newRequest, shipping_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="운송방법을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ocean">Ocean</SelectItem>
                      <SelectItem value="Air">Air</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="DHL">DHL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            {/* 희망 출하일과 확정 출하일 (출하일정 변경일 때만 표시) */}
            {newRequest.category_of_request === '출하일정 변경' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="desired_shipment_date">희망 출하일</Label>
                  <Input
                    id="desired_shipment_date"
                    type="date"
                    value={newRequest.desired_shipment_date}
                    onChange={(e) => setNewRequest({ ...newRequest, desired_shipment_date: e.target.value })}
                  />
                </div>
                {(profile?.role === 'reviewer' || profile?.role === 'admin') && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmed_shipment_date">확정 출하일 (검토자/관리자만)</Label>
                    <Input
                      id="confirmed_shipment_date"
                      type="date"
                      value={newRequest.confirmed_shipment_date}
                      onChange={(e) => setNewRequest({ ...newRequest, confirmed_shipment_date: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}
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
                    <SelectItem value="보통">보통</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* 품목 테이블 영역 */}
            {newRequest.category_of_request !== '출하일정 변경' && 
             newRequest.category_of_request !== '운송방법 변경' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>품목 목록 <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('excel-upload')?.click()}
                      className="text-sm"
                    >
                      Excel 업로드
                    </Button>
                    <input
                      id="excel-upload"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleExcelUpload}
                    />
                  </div>
                </div>
                
                {/* 품목 추가 입력 필드 */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 space-y-1">
                    <Label htmlFor="current_erp_code" className="text-xs">품목코드</Label>
                    <Input
                      id="current_erp_code"
                      value={currentItem.erp_code}
                      onChange={(e) => setCurrentItem({ ...currentItem, erp_code: e.target.value })}
                      placeholder="ERP 코드"
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-4 space-y-1">
                    <Label htmlFor="current_item_name" className="text-xs">품목명</Label>
                    <Input
                      id="current_item_name"
                      value={currentItem.item_name}
                      onChange={(e) => setCurrentItem({ ...currentItem, item_name: e.target.value })}
                      placeholder="품목명"
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label htmlFor="current_quantity" className="text-xs">수량 (음수, 0, 양수 가능)</Label>
                    <Input
                      id="current_quantity"
                      type="number"
                      value={currentItem.quantity}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                        setCurrentItem({ ...currentItem, quantity: isNaN(val) ? 0 : val });
                      }}
                      placeholder="예: -1, 0, 4"
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      onClick={handleAddItem}
                      size="sm"
                      className="w-full bg-[#971B2F] hover:bg-[#7A1626]"
                    >
                      +
                    </Button>
                  </div>
                </div>
                
                {/* 품목 테이블 */}
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">품목코드</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">품목명</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-700">수량</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-700 w-16">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {newRequest.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                            품목을 추가해주세요.
                          </td>
                        </tr>
                      ) : (
                        newRequest.items.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-3 py-2">{item.erp_code}</td>
                            <td className="px-3 py-2">{item.item_name}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                ×
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
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

      {/* 승인 사유 입력 다이얼로그 */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>요청 승인 사유 입력</AlertDialogTitle>
            <AlertDialogDescription>
              승인 사유를 입력해주세요. (필수)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <textarea
              className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#971B2F]"
              placeholder="승인 사유를 상세히 입력해주세요..."
              value={reviewDetails}
              onChange={(e) => setReviewDetails(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setApproveDialogOpen(false);
              setReviewDetails('');
              setApproveRequestId(null);
            }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmApprove}
              className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 전체 대기 내역 팝업 */}
      <Dialog open={allPendingDialogOpen} onOpenChange={setAllPendingDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>전체 검토 대기 내역 ({pendingRequests.length}건)</DialogTitle>
            <DialogDescription>
              검토 대기 중인 모든 요청 내역입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="bg-white rounded-lg border border-[#E5E7EB] p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-[#67767F]">
                    {request.so_number ? `SO: ${request.so_number}` : '신규'}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    request.priority === '긴급' ? 'bg-red-100 text-red-700' : 
                    request.priority === '일반' ? 'bg-blue-100 text-blue-700' : 
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {request.priority}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#101820] mb-1">{request.customer}</h3>
                <p className="text-sm text-[#67767F] mb-3">{request.category_of_request}</p>
                <div className="text-sm text-[#67767F] mb-4">
                  <p>출하일: {request.factory_shipment_date}</p>
                  <p>리드타임: {request.leadtime || 0}일</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAllPendingDialogOpen(false);
                      handleViewDetails(request.id);
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-[#A2B2C8] text-white rounded hover:bg-[#8A9BB1] transition-colors"
                  >
                    상세보기
                  </button>
                  {(profile?.role === 'reviewer' || profile?.role === 'admin') && (
                    <>
                      <button
                        onClick={() => {
                          setAllPendingDialogOpen(false);
                          handleApprove(request.id);
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-[#4A9B8E] text-white rounded hover:bg-[#3A7B6E] transition-colors"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => {
                          setAllPendingDialogOpen(false);
                          handleReject(request.id);
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-[#971B2F] text-white rounded hover:bg-[#7A1626] transition-colors"
                      >
                        반려
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllPendingDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 확인 팝업 다이얼로그 */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수정 확인</AlertDialogTitle>
            <AlertDialogDescription>
              수정하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDialogOpen(false)}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFeasibilityChange}
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
