/**
 * 메인 대시보드 페이지
 */
'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { StatsCard } from '@/components/dashboard/StatsCard';
import type { PORequest, DashboardStats, FeasibilityStatus, RequestStatus } from '@/types/request';
import { sendUrgentRequestNotification, sendNewRequestNotification } from '@/lib/notification-utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table as AdminTable,
  TableBody as AdminTableBody,
  TableCell as AdminTableCell,
  TableHead as AdminTableHead,
  TableHeader as AdminTableHeader,
  TableRow as AdminTableRow,
  TableCaption as AdminTableCaption,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, calculateDaysLeft } from '@/lib/dashboard-utils';
import { format as formatDateRange, format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Download, Bell, CheckCircle2, XCircle, AlertCircle, Edit, Plus, Search, ClipboardList, Clock, Calendar as CalendarIcon, Database, Globe, Package, RefreshCw, BarChart3 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * 오류 객체에서 Supabase/PostgREST 에러 필드를 안전하게 추출하는 헬퍼
 */
const asApiError = (error: unknown): { code?: string; message?: string } =>
  (typeof error === 'object' && error !== null ? error : {}) as { code?: string; message?: string };

/**
 * 에러 객체를 문자열로 안전하게 변환하는 헬퍼
 */
const getReadableErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  const apiError = asApiError(error);
  if (apiError.message) {
    return apiError.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/**
 * 품목/제품 추가 요청 여부를 확인하는 헬퍼
 */
const isItemAdditionCategory = (category: string | null | undefined): boolean =>
  category === '품목 추가' || category === '제품 추가';

/**
 * 품목 구분 옵션 목록
 */
const PRODUCT_CATEGORIES = [
  { value: 'InBody', label: 'InBody', color: 'bg-blue-100 text-blue-800' },
  { value: 'BSM', label: 'BSM', color: 'bg-green-100 text-green-800' },
  { value: 'BPBIO', label: 'BPBIO', color: 'bg-purple-100 text-purple-800' },
  { value: 'Wellness', label: 'Wellness', color: 'bg-pink-100 text-pink-800' },
  { value: 'Spare parts', label: 'Spare parts', color: 'bg-gray-100 text-gray-800' },
  { value: 'ALL', label: 'ALL', color: 'bg-orange-100 text-orange-800' },
] as const;

/**
 * 품목 구분별 색상 클래스를 반환하는 헬퍼
 */
const getProductCategoryColor = (category: string): string => {
  const found = PRODUCT_CATEGORIES.find((c) => c.value === category);
  return found?.color ?? 'bg-gray-100 text-gray-800';
};

/**
 * 품목 구분 문자열(쉼표 구분)을 색상 뱃지 배열로 렌더링하는 헬퍼
 */
const renderProductCategoryBadges = (category: string | null | undefined, size: 'sm' | 'md' = 'sm') => {
  if (!category) return null;
  const categories = category.split(',').map((c) => c.trim()).filter(Boolean);
  if (categories.length === 0) return null;
  const padding = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((cat) => (
        <span
          key={cat}
          className={`inline-flex items-center rounded-full font-medium ${padding} ${getProductCategoryColor(cat)}`}
        >
          {cat}
        </span>
      ))}
    </div>
  );
};

/**
 * 품목 구분 선택이 필요한 요청 구분인지 확인하는 헬퍼
 */
const needsProductCategory = (categoryOfRequest: string): boolean =>
  ['수량 삭제', '품목 추가', '제품 추가'].includes(categoryOfRequest);

type ChartData = { name: string; count: number };
type StatusData = { name: '승인' | '반려' | '대기'; value: number; percentage: number };

/**
 * 확정 수량 입력값을 검증하는 헬퍼
 */
/**
 * 승인용 확정 수량 검증: 최소 1개 이상 (0은 반려 전용)
 */
const validateApproveConfirmedQuantity = (confirmed: number | null, requested: number): boolean => {
  if (confirmed === null) return true; // 입력 안 함 (전체 가능)
  if (confirmed < 1) return false; // 승인 시 최소 1개 (0 불가)
  if (confirmed > requested) return false; // 요청 수량 초과 불가
  return true;
};

/**
 * 반려용 확정 수량 검증: 0개 허용 (전량 대응 불가)
 */
const validateRejectConfirmedQuantity = (confirmed: number | null, requested: number): boolean => {
  if (confirmed === null) return true; // 입력 안 함
  if (confirmed < 0) return false; // 음수 불가
  if (confirmed > requested) return false; // 요청 수량 초과 불가
  return true;
};

interface NotificationItem {
  id: string;
  user_id: string;
  request_id: string;
  type: 'approved' | 'rejected';
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  requests?: {
    so_number: string | null;
    customer: string | null;
    request_date: string | null;
    category_of_request: string | null;
    product_category: string | null;
    erp_code: string | null;
    item_name: string | null;
    quantity: number | null;
    confirmed_quantity: number | null;
    review_details: string | null;
    status: string | null;
  } | null;
}

const ALL_CUSTOMERS = [
  '일본(일본법인)',
  '미국(미국법인)',
  '중국(중국법인)',
  '말레이시아(아시아법인)',
  '인도(인도법인)',
  '네덜란드(유럽법인)',
  '멕시코(멕시코법인)',
  '중국(중국법인_생산)',
  '독일(유럽법인_독일지사)',
  '주식회사 코르트',
  '호주(호주법인)',
  '미국(미국동부법인)',
  '주식회사 인바디헬스케어',
  '영국(유럽법인_영국지사)',
  '베트남(베트남법인)',
  '튀르키예(튀르키예법인)',
  '국내_인바디 서부지사',
  '국내_인바디 남부지사',
  '국내_인바디 강남지사',
  '국내_인바디 대전지사',
  '국내_인바디 대구지사',
  '국내_인바디 광주지사',
  '국내_인바디 강북지사',
  '국내_인바디 강서지사',
  '국내_인바디 강원지사',
  '국내_인바디 중부지사',
  '국내_인바디 부산지사',
  '태국(InBody Thailand Co., Ltd.)',
  '인도네시아(PT. InBody Global Healthcare)',
] as const;

const HEADQUARTERS_TEAMS = ['영업관리팀', '제조관리팀', '혈압계팀', 'W팀'] as const;
const DOMESTIC_BRANCH_SHIPPING_METHODS = ['Parcel', 'Pickup', 'Truck', 'Regular'] as const;
const OVERSEAS_CUSTOMER_SHIPPING_METHODS = ['Ocean', 'Air', 'UPS', 'DHL', 'FEDEX', 'Parcel'] as const;
const ALL_SHIPPING_METHODS = ['Ocean', 'Air', 'UPS', 'DHL', 'FEDEX', 'Parcel', 'Pickup', 'Truck', 'Regular'] as const;

const getInitialNewRequest = (type: 'existing' | 'new' = 'new') => ({
  customer: '',
  so_number: '',
  factory_shipment_date: new Date().toISOString().split('T')[0],
  desired_shipment_date: '',
  confirmed_shipment_date: '',
  category_of_request: type === 'existing' ? '수량 삭제' : '품목 추가',
  priority: '보통' as '긴급' | '일반' | '보통',
  shipping_method: '',
  erp_code: '',
  item_name: '',
  quantity: 0,
  reason_for_request: '수요 예측 오류',
  request_details: '',
  items: [] as Array<{ erp_code: string; item_name: string; quantity: number }>,
});

/**
 * SO 번호 형식 검증 (SO + 9자리 숫자)
 */
const validateSONumber = (soNumber: string): boolean => {
  const soPattern = /^SO\d{9}$/;
  return soPattern.test(soNumber);
};

/**
 * ERP 품목 코드 형식 검증 (영문 대소문자+숫자 9자리)
 */
const validateERPCode = (erpCode: string): boolean => {
  const erpPattern = /^[A-Za-z0-9]{9}$/;
  return erpPattern.test(erpCode);
};

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
    rejected: 0,
  });
  const [, setLoading] = useState(false);
  const [searchQuery, _setSearchQuery] = useState('');
  const [filters, _setFilters] = useState<{ request_type?: string; status?: string; completed?: string; priority?: string }>({});
  const [sortBy, _setSortBy] = useState<string>('created_at');
  const [sortOrder, _setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [, setIsInitialLoad] = useState(true);
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
  const [confirmedQuantity, setConfirmedQuantity] = useState<number | null>(null);
  const [currentItem, setCurrentItem] = useState({ erp_code: '', item_name: '', quantity: 0 });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationDetail, setShowNotificationDetail] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  /** 품목 구분 선택값 목록 (수량 삭제 / 품목 추가 / 제품 추가 요청 시, 복수 선택 가능) */
  const [productCategory, setProductCategory] = useState<string[]>([]);
  /** PO 수정 요청 SO 번호 필드 검증 메시지 */
  const [soNumberError, setSONumberError] = useState('');
  /** 품목 입력 행 ERP 코드 검증 메시지 */
  const [erpCodeError, setERPCodeError] = useState('');
  const [editingFeasibility, setEditingFeasibility] = useState<FeasibilityStatus | null>(null);
  const [editingReviewDetails, setEditingReviewDetails] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [requestType, setRequestType] = useState<'existing' | 'new'>('new');
  const [allPendingDialogOpen, setAllPendingDialogOpen] = useState(false);

  // 페이지 모드 관련 상태
  const [pageMode, setPageMode] = useState<'requester' | 'admin'>('requester');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 관리자 페이지 전용 상태
  const [adminRequests, setAdminRequests] = useState<PORequest[]>([]);
  const [, setAdminStats] = useState<DashboardStats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // 관리자 대시보드(차트) 전용 상태
  const [customerStats, setCustomerStats] = useState<ChartData[]>([]);
  const [departmentStats, setDepartmentStats] = useState<ChartData[]>([]);
  const [categoryStats, setCategoryStats] = useState<ChartData[]>([]);
  const [reasonStats, setReasonStats] = useState<ChartData[]>([]);
  const [statusStats, setStatusStats] = useState<StatusData[]>([]);
  const [activeTab, setActiveTab] = useState<'customer' | 'department'>('customer');

  // 요청자 페이지 전용 상태
  const [requesterPendingRequests, setRequesterPendingRequests] = useState<PORequest[]>([]);
  const [requesterPendingLoading, setRequesterPendingLoading] = useState(false);
  const [requesterSearchTerm, setRequesterSearchTerm] = useState('');
  const [requesterFilterCustomer, setRequesterFilterCustomer] = useState('all');
  const [requesterFilterStatus, setRequesterFilterStatus] = useState('all');
  const [requesterSortOrder, setRequesterSortOrder] = useState('request-date-desc');

  const requesterTableScrollRef = useRef<HTMLDivElement | null>(null);
  const requesterBottomScrollbarRef = useRef<HTMLDivElement | null>(null);
  const requesterBottomScrollbarInnerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRequesterScrollRef = useRef(false);

  // 상세보기 Dialog (검토 대기 → 상세)
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [detailRequest, setDetailRequest] = useState<PORequest | null>(null);

  // 통계 카드 클릭 Dialog
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [statsDialogType, setStatsDialogType] = useState<'total' | 'pending' | 'approved' | 'rejected'>('total');
  const [statsDialogRequests, setStatsDialogRequests] = useState<PORequest[]>([]);

  // 관리자 검색/필터/정렬 상태
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [debouncedAdminSearchTerm, setDebouncedAdminSearchTerm] = useState('');
  const [adminFilterStatus, setAdminFilterStatus] = useState('all');
  const [adminFilterCategory, setAdminFilterCategory] = useState('all');
  const [adminDateRange, setAdminDateRange] = useState<DateRange | undefined>();
  const [adminSortOrder, setAdminSortOrder] = useState('newest');

  const [newRequest, setNewRequest] = useState(getInitialNewRequest('new'));

  /** 품목 목록 입력 영역 표시 여부 (출하·운송 변경 시 숨김) */
  const isItemListVisible = useMemo(
    () =>
      newRequest.category_of_request !== '출하일정 변경' &&
      newRequest.category_of_request !== '운송방법 변경',
    [newRequest.category_of_request]
  );

  /**
   * 사용자 권한/부서 기준으로 선택 가능한 고객 목록을 반환하는 헬퍼
   */
  const getAvailableCustomers = useCallback((): string[] => {
    if (isAdmin) {
      return [...ALL_CUSTOMERS];
    }

    const department = profile?.department;
    if (department && HEADQUARTERS_TEAMS.includes(department as (typeof HEADQUARTERS_TEAMS)[number])) {
      return [...ALL_CUSTOMERS];
    }

    if (department) {
      return [department];
    }

    return [...ALL_CUSTOMERS];
  }, [isAdmin, profile?.department]);

  const availableCustomers = useMemo(() => getAvailableCustomers(), [getAvailableCustomers]);

  /**
   * 로그인 사용자 부서 기준으로 선택 가능한 운송방법 목록을 반환하는 헬퍼
   */
  const availableShippingMethods = useMemo((): string[] => {
    const department = (profile?.department ?? '').trim();

    if (!department) {
      return [...ALL_SHIPPING_METHODS];
    }

    const isDomesticBranchDepartment = department.endsWith('지사');
    if (isDomesticBranchDepartment) {
      return [...DOMESTIC_BRANCH_SHIPPING_METHODS];
    }

    const isOverseasCustomerDepartment = (ALL_CUSTOMERS as readonly string[]).includes(department);
    if (isOverseasCustomerDepartment) {
      return [...OVERSEAS_CUSTOMER_SHIPPING_METHODS];
    }

    return [...ALL_SHIPPING_METHODS];
  }, [profile?.department]);

  /**
   * 부서 변경 등으로 현재 선택된 운송방법이 허용 목록에서 벗어난 경우 초기화
   */
  useEffect(() => {
    if (newRequest.category_of_request !== '운송방법 변경' || !newRequest.shipping_method) {
      return;
    }

    if (availableShippingMethods.includes(newRequest.shipping_method)) {
      return;
    }

    setNewRequest((prev) => ({ ...prev, shipping_method: '' }));
  }, [availableShippingMethods, newRequest.category_of_request, newRequest.shipping_method]);

  /**
   * 현재 로그인한 사용자가 직접 요청한 건인지 확인
   * @param request - 확인할 요청 데이터
   * @returns 본인 요청 여부
   */
  const isOwnRequest = useCallback((request: PORequest | null | undefined): boolean => {
    if (!request || !user?.id) return false;
    return request.requester_id === user.id;
  }, [user?.id]);

  /**
   * 요청자/검토자 페이지의 고객 필터 옵션 목록
   */
  const requesterCustomerOptions = useMemo(() => {
    return Array.from(
      new Set(
        requests
          .map((request) => request.customer)
          .filter((customer): customer is string => Boolean(customer))
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [requests]);

  /**
   * 요청자/검토자 페이지의 검색/필터/정렬이 반영된 요청 내역
   */
  const sortedRequesterHistoryRequests = useMemo(() => {
    let filteredRequests = [...requests];
    const normalizedSearch = requesterSearchTerm.trim().toLowerCase();

    if (normalizedSearch) {
      filteredRequests = filteredRequests.filter((request) =>
        (request.so_number || '').toLowerCase().includes(normalizedSearch) ||
        (request.customer || '').toLowerCase().includes(normalizedSearch)
      );
    }

    if (requesterFilterCustomer !== 'all') {
      filteredRequests = filteredRequests.filter(
        (request) => request.customer === requesterFilterCustomer
      );
    }

    if (requesterFilterStatus !== 'all') {
      filteredRequests = filteredRequests.filter(
        (request) => request.status === requesterFilterStatus
      );
    }

    const priorityWeight: Record<string, number> = {
      긴급: 3,
      일반: 2,
      보통: 1,
    };

    return filteredRequests.sort((a, b) => {
      switch (requesterSortOrder) {
        case 'request-date-asc':
          return new Date(a.request_date || 0).getTime() - new Date(b.request_date || 0).getTime();
        case 'shipment-date-asc':
          return new Date(a.factory_shipment_date || 0).getTime() - new Date(b.factory_shipment_date || 0).getTime();
        case 'shipment-date-desc':
          return new Date(b.factory_shipment_date || 0).getTime() - new Date(a.factory_shipment_date || 0).getTime();
        case 'priority-desc':
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        case 'request-date-desc':
        default: {
          const requestDateDiff = new Date(b.request_date || 0).getTime() - new Date(a.request_date || 0).getTime();
          if (requestDateDiff !== 0) {
            return requestDateDiff;
          }
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
      }
    });
  }, [requests, requesterSearchTerm, requesterFilterCustomer, requesterFilterStatus, requesterSortOrder]);

  /**
   * 상단 고정 가로 스크롤바와 테이블 스크롤바 너비를 동기화
   */
  useEffect(() => {
    const syncRequesterScrollbarWidth = () => {
      if (!requesterTableScrollRef.current || !requesterBottomScrollbarInnerRef.current) {
        return;
      }

      requesterBottomScrollbarInnerRef.current.style.width = `${requesterTableScrollRef.current.scrollWidth}px`;
    };

    syncRequesterScrollbarWidth();
    window.addEventListener('resize', syncRequesterScrollbarWidth);

    return () => {
      window.removeEventListener('resize', syncRequesterScrollbarWidth);
    };
  }, [sortedRequesterHistoryRequests]);

  /**
   * 요청자 테이블 하단 스크롤 움직임을 상단 스크롤바에 동기화
   */
  const handleRequesterTableScroll = () => {
    if (!requesterTableScrollRef.current || !requesterBottomScrollbarRef.current) {
      return;
    }
    if (isSyncingRequesterScrollRef.current) {
      return;
    }

    isSyncingRequesterScrollRef.current = true;
    requesterBottomScrollbarRef.current.scrollLeft = requesterTableScrollRef.current.scrollLeft;
    isSyncingRequesterScrollRef.current = false;
  };

  /**
   * 요청자 하단 고정 스크롤바 움직임을 테이블 가로 스크롤에 동기화
   */
  const handleRequesterBottomScrollbarScroll = () => {
    if (!requesterTableScrollRef.current || !requesterBottomScrollbarRef.current) {
      return;
    }
    if (isSyncingRequesterScrollRef.current) {
      return;
    }

    isSyncingRequesterScrollRef.current = true;
    requesterTableScrollRef.current.scrollLeft = requesterBottomScrollbarRef.current.scrollLeft;
    isSyncingRequesterScrollRef.current = false;
  };

  /**
   * PO 추가/수정 요청 폼을 초기 상태로 되돌리는 헬퍼
   */
  const resetAddRequestForm = useCallback(() => {
    setNewRequest(getInitialNewRequest(requestType));
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
    setProductCategory([]);
    setSONumberError('');
    setERPCodeError('');
  }, [requestType]);

  /**
   * 요청 추가 다이얼로그 열림/닫힘 상태를 제어하는 핸들러
   */
  const handleAddDialogChange = useCallback((open: boolean) => {
    setAddDialogOpen(open);
    if (!open) {
      resetAddRequestForm();
    }
  }, [resetAddRequestForm]);

  /**
   * 고객 선택이 1개로 제한된 계정은 다이얼로그 오픈 시 고객을 자동 선택
   */
  useEffect(() => {
    if (!addDialogOpen) return;

    setNewRequest((prev) => {
      const nextCustomer =
        availableCustomers.length === 1
          ? availableCustomers[0]
          : (prev.customer && availableCustomers.includes(prev.customer) ? prev.customer : '');

      if (prev.customer === nextCustomer) {
        return prev;
      }

      return { ...prev, customer: nextCustomer };
    });
  }, [addDialogOpen, availableCustomers]);

  /**
   * 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
   */
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  /**
   * 로그인된 사용자의 알림 목록을 초기 로드
   */
  useEffect(() => {
    if (!user) return;
    void fetchNotifications();
    // fetchNotifications는 컴포넌트 내부 함수이며 user 변경 시 재조회면 충분함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * 알림 팝오버가 열릴 때 최신 알림을 재조회
   */
  useEffect(() => {
    if (!showNotifications) return;
    void fetchNotifications();
    // 팝오버 오픈 시점 기준으로만 재조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNotifications, user]);

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

      // Admin 또는 영업관리팀/제조관리팀: 모든 요청 조회
      const canViewAll = isAdmin || profile?.department === '영업관리팀' || profile?.department === '제조관리팀';
      if (canViewAll) {
        // 필터 없이 모든 요청 조회
      }
      // 그 외: department와 동일한 customer 건만 조회
      else if ((isRequester || isReviewer) && profile?.department) {
        query = query.eq('customer', profile.department);
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
        confirmed_quantity: item.confirmed_quantity ?? null,
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
      const rejected = transformedData.filter((r) => r.status === 'rejected').length;
      setStats({ total, pending, approved, rejected });
      setIsInitialLoad(false);
    } catch (error: unknown) {
      console.error('요청 목록 조회 오류:', error);
      const err = asApiError(error);
      // 네트워크 오류나 인증 오류 처리
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
  }, [fetchRequests, user, authLoading]);

  /**
   * 관리자 모드: 통계 데이터 조회
   */
  const fetchAdminStats = useCallback(async () => {
    try {
      const supabase = createClient();

      // 전체 요청 건수
      const { count: totalCount, error: totalError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      if (totalError) throw totalError;

      // 검토 대기 건수
      const { count: pendingCount, error: pendingError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('deleted_at', null);
      if (pendingError) throw pendingError;

      // 승인 건수
      const { count: approvedCount, error: approvedError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .is('deleted_at', null);
      if (approvedError) throw approvedError;

      // 반려 건수
      const { count: rejectedCount, error: rejectedError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected')
        .is('deleted_at', null);
      if (rejectedError) throw rejectedError;

      setAdminStats({
        total: totalCount ?? 0,
        pending: pendingCount ?? 0,
        approved: approvedCount ?? 0,
        rejected: rejectedCount ?? 0,
      });
    } catch (error) {
      console.error('관리자 통계 조회 오류:', error);
      toast.error('통계 데이터를 불러오는데 실패했습니다.');
    }
  }, []);

  /**
   * 관리자 모드: 전체 요청 목록 조회
   */
  const fetchAdminRequests = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAdminRequests((data || []) as PORequest[]);
    } catch (error) {
      console.error('관리자 요청 목록 조회 오류:', error);
      toast.error('요청 목록을 불러오는데 실패했습니다.');
      setAdminError('요청 목록을 불러오는데 실패했습니다.');
    }
  }, []);

  /**
   * 관리자 대시보드(차트) 통계를 계산하는 헬퍼
   */
  const calculateStatistics = useCallback((requests: PORequest[]) => {
    if (!requests || requests.length === 0) {
      setCustomerStats([]);
      setDepartmentStats([]);
      setCategoryStats([]);
      setReasonStats([]);
      setStatusStats([]);
      return;
    }

    const reduceCounts = (values: Array<string | null | undefined>) =>
      values.reduce<Record<string, number>>((acc, v) => {
        const raw = (v ?? '').toString();
        const key = raw.trim() ? raw.trim() : '-';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

    // 1) 고객처별 (상위 10개)
    const customerCounts = reduceCounts(requests.map((r) => r.customer));
    const customerData: ChartData[] = Object.entries(customerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    setCustomerStats(customerData);

    // 2) 부서별
    const deptCounts = reduceCounts(requests.map((r) => r.requesting_dept));
    const deptData: ChartData[] = Object.entries(deptCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setDepartmentStats(deptData);

    // 3) 요청 구분별
    const categoryCounts = reduceCounts(requests.map((r) => r.category_of_request));
    const categoryData: ChartData[] = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setCategoryStats(categoryData);

    // 4) 요청 사유별 (reason_for_request 기준)
    const reasonCounts = reduceCounts(requests.map((r) => r.reason_for_request));
    const reasonData: ChartData[] = Object.entries(reasonCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setReasonStats(reasonData);

    // 5) 상태별 (승인/반려/대기)
    const total = requests.length;
    const statusCounts = requests.reduce<Record<string, number>>((acc, r) => {
      const key = r.status ?? 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const approved = statusCounts.approved || 0;
    const rejected = statusCounts.rejected || 0;
    const pending = statusCounts.pending || 0;
    const statusData: StatusData[] = [
      { name: '승인', value: approved, percentage: total ? Math.round((approved / total) * 100) : 0 },
      { name: '반려', value: rejected, percentage: total ? Math.round((rejected / total) * 100) : 0 },
      { name: '대기', value: pending, percentage: total ? Math.round((pending / total) * 100) : 0 },
    ];
    setStatusStats(statusData);
  }, []);

  /**
   * 요청자 모드: 검토 대기 요청 조회 (출하일 기준 정렬, 부서별 필터링)
   */
  const fetchRequesterPendingRequests = useCallback(async () => {
    try {
      setRequesterPendingLoading(true);
      const supabase = createClient();

      let query = supabase
        .from('requests')
        .select('*')
        .eq('status', 'pending')
        .is('deleted_at', null);

      // 전체 조회 권한이 없는 경우 customer 컬럼으로 필터링
      const allAccess = isAdmin || profile?.department === '영업관리팀' || profile?.department === '제조관리팀';
      if (profile?.department && !allAccess) {
        query = query.eq('customer', profile.department);
      }

      const { data, error } = await query.order('factory_shipment_date', { ascending: true });

      if (error) throw error;
      setRequesterPendingRequests((data || []) as PORequest[]);
    } catch (error) {
      console.error('검토 대기 요청 조회 오류:', error);
    } finally {
      setRequesterPendingLoading(false);
    }
  }, [profile, isAdmin]);

  /**
   * 요청자 모드 데이터 로드
   */
  useEffect(() => {
    if (pageMode === 'requester' && user) {
      fetchRequesterPendingRequests();
    }
  }, [pageMode, user, fetchRequesterPendingRequests]);

  /**
   * 관리자 검색 디바운스
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAdminSearchTerm(adminSearchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [adminSearchTerm]);

  /**
   * 관리자 필터링/정렬 결과 (메모이제이션)
   */
  const filteredAndSortedAdminRequests = useMemo(() => {
    let result = [...adminRequests];

    // 검색어 필터
    if (debouncedAdminSearchTerm) {
      const term = debouncedAdminSearchTerm.toLowerCase();
      result = result.filter((req) =>
        (req.so_number || '').toLowerCase().includes(term) ||
        (req.customer || '').toLowerCase().includes(term) ||
        (req.item_name || '').toLowerCase().includes(term)
      );
    }

    // 상태 필터
    if (adminFilterStatus !== 'all') {
      result = result.filter((req) => req.status === adminFilterStatus);
    }

    // 요청구분 필터
    if (adminFilterCategory !== 'all') {
      result = result.filter((req) => req.category_of_request === adminFilterCategory);
    }

    // 날짜 범위 필터 (요청일 기준)
    if (adminDateRange?.from) {
      const fromDate = new Date(adminDateRange.from);
      fromDate.setHours(0, 0, 0, 0);

      const toDate = adminDateRange.to ? new Date(adminDateRange.to) : new Date(adminDateRange.from);
      toDate.setHours(23, 59, 59, 999);

      result = result.filter((req) => {
        const requestDate = new Date(req.request_date);
        return requestDate >= fromDate && requestDate <= toDate;
      });
    }

    // 정렬
    result.sort((a, b) => {
      switch (adminSortOrder) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'shipment-asc':
          return new Date(a.factory_shipment_date || '').getTime() - new Date(b.factory_shipment_date || '').getTime();
        case 'shipment-desc':
          return new Date(b.factory_shipment_date || '').getTime() - new Date(a.factory_shipment_date || '').getTime();
        case 'customer-asc':
          return (a.customer || '').localeCompare(b.customer || '');
        case 'customer-desc':
          return (b.customer || '').localeCompare(a.customer || '');
        default:
          return 0;
      }
    });

    return result;
  }, [adminRequests, debouncedAdminSearchTerm, adminFilterStatus, adminFilterCategory, adminDateRange, adminSortOrder]);

  /**
   * 관리자 모드 데이터 로드
   */
  useEffect(() => {
    if (pageMode === 'admin' && isAdminAuthenticated && user) {
      const loadAdminData = async () => {
        setAdminLoading(true);
        setAdminError(null);
        try {
          await Promise.all([
            fetchAdminStats(),
            fetchAdminRequests(),
          ]);
        } catch (error) {
          console.error('관리자 데이터 로드 오류:', error);
        } finally {
          setAdminLoading(false);
        }
      };
      loadAdminData();
    }
  }, [pageMode, isAdminAuthenticated, user, fetchAdminStats, fetchAdminRequests]);

  /**
   * 관리자 요청 목록 변경 시 차트 통계 재계산
   */
  useEffect(() => {
    if (pageMode !== 'admin' || !isAdminAuthenticated) return;
    calculateStatistics(adminRequests);
  }, [pageMode, isAdminAuthenticated, adminRequests, calculateStatistics]);

  /**
   * 페이지 모드 변경 핸들러
   */
  const handleModeChange = (value: string) => {
    if (value === 'admin') {
      if (!isAdminAuthenticated) {
        setShowPasswordDialog(true);
        setPasswordInput('');
        setPasswordError('');
      } else {
        setPageMode('admin');
      }
    } else {
      setPageMode('requester');
    }
  };

  /**
   * 관리자 비밀번호 확인 핸들러
   */
  const handlePasswordSubmit = () => {
    if (passwordInput === 'admin1234') {
      setIsAdminAuthenticated(true);
      setPageMode('admin');
      setShowPasswordDialog(false);
      setPasswordInput('');
      setPasswordError('');
      toast.success('관리자 모드로 전환되었습니다.');
    } else {
      setPasswordError('비밀번호가 올바르지 않습니다.');
      setPageMode('requester');
    }
  };

  /**
   * Excel 다운로드 핸들러
   */
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');

      // 필터링된 데이터를 한글 헤더로 변환
      const exportData = filteredAndSortedAdminRequests.map((r) => ({
        '요청일': r.request_date || '',
        'SO 번호': r.so_number || '',
        '고객': r.customer || '',
        '요청부서': r.requesting_dept || '',
        '요청자': r.requester_name || '',
        '출하일': r.factory_shipment_date || '',
        '요청구분': r.category_of_request || '',
        '품목코드': r.erp_code || '',
        '품목명': r.item_name || '',
        '수량': r.quantity || 0,
        '요청사유': r.reason_for_request || '',
        '검토 상세': r.review_details || '-',
        '상태': r.status === 'pending' ? '검토대기' : r.status === 'approved' ? '승인' : r.status === 'rejected' ? '반려' : r.status === 'in_review' ? '검토중' : r.status === 'completed' ? '완료' : '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '요청 내역');

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `PO변경요청_내역_${today}.xlsx`);
      toast.success('Excel 파일이 다운로드되었습니다.');
    } catch (error) {
      console.error('Excel 다운로드 오류:', error);
      toast.error('Excel 파일 생성 중 오류가 발생했습니다.');
    }
  };

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

    // 본인이 요청한 건은 본인이 검토할 수 없음
    if (isOwnRequest(selectedRequest)) {
      toast.error('본인이 요청한 건은 검토할 수 없습니다.');
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
      const newFeasibility: FeasibilityStatus = editingFeasibility;
      
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
        console.error('Supabase 오류:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
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
    } catch (error: unknown) {
      const errMsg = getReadableErrorMessage(error);
      const err = asApiError(error);
      console.error('가능여부 변경 오류:', {
        code: err.code,
        message: errMsg,
        raw: error,
      });
      if (err?.code === 'PGRST301' || errMsg.includes('permission')) {
        toast.error('가능여부를 변경할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (err?.code === '42P01' || errMsg.includes('notifications') || errMsg.includes('relation')) {
        // notifications 테이블 미생성으로 인한 트리거 오류: 상태 변경은 완료됐으므로 목록 새로고침
        toast.warning('가능여부는 변경됐으나 알림 생성에 실패했습니다. (DB 마이그레이션 필요)');
        setConfirmDialogOpen(false);
        setViewDialogOpen(false);
        await fetchRequests();
      } else if (errMsg) {
        toast.error(`가능여부 변경 실패: ${errMsg}`);
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

    const targetRequest = requests.find((request) => request.id === requestId);
    if (isOwnRequest(targetRequest)) {
      toast.error('본인이 요청한 건은 승인할 수 없습니다.');
      return;
    }

    setApproveRequestId(requestId);
    setReviewDetails('');
    setConfirmedQuantity(targetRequest?.confirmed_quantity ?? null);
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

    const approveTargetRequest = requests.find((request) => request.id === approveRequestId);
    if (isOwnRequest(approveTargetRequest)) {
      toast.error('본인이 요청한 건은 승인할 수 없습니다.');
      setApproveDialogOpen(false);
      setApproveRequestId(null);
      setReviewDetails('');
      setConfirmedQuantity(null);
      return;
    }

    const requestedQty = approveTargetRequest?.quantity ?? 0;
    const isItemAdditionRequest = isItemAdditionCategory(approveTargetRequest?.category_of_request);
    if (isItemAdditionRequest) {
      if (!validateApproveConfirmedQuantity(confirmedQuantity, requestedQty)) {
        toast.error('승인 시 확정 수량은 1개 이상이어야 합니다. 전량 불가인 경우 반려를 이용해주세요.');
        return;
      }
    }

    try {
      const supabase = createClient();
      
      // feasibility와 status를 모두 'approved'로 업데이트
      const { data, error } = await supabase
        .from('requests')
        .update({
          feasibility: 'approved',
          status: 'approved',
          review_details: reviewDetails,
          confirmed_quantity: isItemAdditionRequest ? confirmedQuantity : null,
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approveRequestId)
        .select();

      if (error) {
        console.error('Supabase 오류:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      console.log('승인 성공:', data);
      if (isItemAdditionRequest && confirmedQuantity !== null) {
        if (confirmedQuantity < requestedQty) {
          toast.success(`확정 수량 ${confirmedQuantity}개로 승인되었습니다. (요청: ${requestedQty}개)`);
        } else {
          toast.success(`확정 수량 ${confirmedQuantity}개로 승인되었습니다.`);
        }
      } else {
        toast.success('요청이 승인되었습니다.');
      }
      setApproveDialogOpen(false);
      setApproveRequestId(null);
      setReviewDetails('');
      setConfirmedQuantity(null);
      await fetchRequests();
    } catch (error: unknown) {
      const errMsg = getReadableErrorMessage(error);
      const err = asApiError(error);
      console.error('요청 승인 오류:', {
        code: err.code,
        message: errMsg,
        raw: error,
      });
      if (err?.code === 'PGRST301' || errMsg.includes('permission')) {
        toast.error('요청을 승인할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (err?.code === '42P01' || errMsg.includes('notifications') || errMsg.includes('relation')) {
        // notifications 테이블 미생성으로 인한 트리거 오류: 요청 상태 자체는 업데이트됐을 수 있으므로 목록 새로고침
        toast.warning('요청은 승인됐으나 알림 생성에 실패했습니다. (DB 마이그레이션 필요)');
        setApproveDialogOpen(false);
        setApproveRequestId(null);
        setReviewDetails('');
        setConfirmedQuantity(null);
        await fetchRequests();
      } else if (errMsg) {
        toast.error(`요청 승인 실패: ${errMsg}`);
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

    const targetRequest = requests.find((request) => request.id === requestId);
    if (isOwnRequest(targetRequest)) {
      toast.error('본인이 요청한 건은 반려할 수 없습니다.');
      return;
    }

    setRejectRequestId(requestId);
    setReviewDetails('');
    setConfirmedQuantity(targetRequest?.confirmed_quantity ?? null);
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

    const rejectTargetRequest = requests.find((request) => request.id === rejectRequestId);
    if (isOwnRequest(rejectTargetRequest)) {
      toast.error('본인이 요청한 건은 반려할 수 없습니다.');
      setRejectDialogOpen(false);
      setRejectRequestId(null);
      setReviewDetails('');
      setConfirmedQuantity(null);
      return;
    }

    const requestedQty = rejectTargetRequest?.quantity ?? 0;
    const isItemAdditionRequest = isItemAdditionCategory(rejectTargetRequest?.category_of_request);
    if (isItemAdditionRequest) {
      if (!validateRejectConfirmedQuantity(confirmedQuantity, requestedQty)) {
        toast.error('확정 수량은 0개 이상이며 요청 수량을 초과할 수 없습니다.');
        return;
      }
    }

    try {
      const supabase = createClient();
      
      // feasibility와 status를 모두 'rejected'로 업데이트
      const { data, error } = await supabase
        .from('requests')
        .update({
          feasibility: 'rejected',
          status: 'rejected',
          review_details: reviewDetails,
          confirmed_quantity: isItemAdditionRequest ? confirmedQuantity : null,
          reviewer_id: user.id,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', rejectRequestId)
        .select();

      if (error) {
        console.error('Supabase 오류:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      console.log('거절 성공:', data);
      if (isItemAdditionRequest && confirmedQuantity !== null) {
        if (confirmedQuantity === 0) {
          toast.success('전량 대응 불가(확정 0개)로 반려되었습니다.');
        } else {
          toast.success(`확정 수량 ${confirmedQuantity}개만 가능합니다. 확정 수량만큼만 PO를 추가해주시기 바랍니다.`);
        }
      } else {
        toast.success('요청이 거절되었습니다.');
      }
      setRejectDialogOpen(false);
      setRejectRequestId(null);
      setReviewDetails('');
      setConfirmedQuantity(null);
      await fetchRequests();
    } catch (error: unknown) {
      const errMsg = getReadableErrorMessage(error);
      const err = asApiError(error);
      console.error('요청 거절 오류:', {
        code: err.code,
        message: errMsg,
        raw: error,
      });
      if (err?.code === 'PGRST301' || errMsg.includes('permission')) {
        toast.error('요청을 거절할 권한이 없습니다. 관리자에게 문의하세요.');
      } else if (err?.code === '42P01' || errMsg.includes('notifications') || errMsg.includes('relation')) {
        // notifications 테이블 미생성으로 인한 트리거 오류: 목록 새로고침 후 안내
        toast.warning('요청은 반려됐으나 알림 생성에 실패했습니다. (DB 마이그레이션 필요)');
        setRejectDialogOpen(false);
        setRejectRequestId(null);
        setReviewDetails('');
        setConfirmedQuantity(null);
        await fetchRequests();
      } else if (errMsg) {
        toast.error(`요청 거절 실패: ${errMsg}`);
      } else {
        toast.error('요청 거절 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      }
    }
  };

  /**
   * 상태 라벨 변환 헬퍼
   */
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': '검토대기',
      'in_review': '검토중',
      'approved': '승인',
      'rejected': '반려',
      'completed': '완료',
    };
    return statusMap[status] || status;
  };

  /**
   * 부서가 전체 조회 가능한지 확인하는 헬퍼 (영업관리팀, 제조관리팀은 모든 고객처 조회 가능)
   */
  const canViewAllCustomers = (): boolean => {
    if (isAdmin) return true;
    const dept = profile?.department;
    return dept === '영업관리팀' || dept === '제조관리팀';
  };

  /**
   * 로그인 사용자의 알림 목록을 조회하는 함수
   */
  async function fetchNotifications() {
    if (!user) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          request_id,
          type,
          title,
          message,
          is_read,
          created_at,
          updated_at,
          requests:request_id (
            so_number,
            customer,
            request_date,
            category_of_request,
            product_category,
            erp_code,
            item_name,
            quantity,
            confirmed_quantity,
            review_details,
            status
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      const nextNotifications = (data || []) as unknown as NotificationItem[];
      setNotifications(nextNotifications);
      setUnreadCount(nextNotifications.filter((notification) => !notification.is_read).length);
    } catch (error: unknown) {
      const apiError = asApiError(error);
      const errorMessage = getReadableErrorMessage(error);

      // notifications 테이블/관계 미구성 상태에서는 앱 동작을 유지하고 알림만 비활성화
      if (
        apiError.code === '42P01' || // relation does not exist
        apiError.code === 'PGRST200' ||
        apiError.code === 'PGRST205' ||
        errorMessage.includes('notifications') ||
        errorMessage.includes('Could not find the table')
      ) {
        setNotifications([]);
        setUnreadCount(0);
        console.warn('알림 테이블 또는 관계가 아직 준비되지 않았습니다:', {
          code: apiError.code,
          message: errorMessage,
        });
        return;
      }

      console.error('알림 조회 실패:', {
        code: apiError.code,
        message: errorMessage,
        raw: error,
      });
    }
  }

  /**
   * 특정 알림을 읽음 처리하는 함수
   */
  const markAsRead = async (notificationId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) {
        throw error;
      }

      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error: unknown) {
      console.error('알림 읽음 처리 실패:', {
        code: asApiError(error).code,
        message: getReadableErrorMessage(error),
        raw: error,
      });
      toast.error('알림 읽음 처리에 실패했습니다.');
    }
  };

  /**
   * 모든 알림을 읽음 처리하는 함수
   */
  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        throw error;
      }

      setNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true })));
      setUnreadCount(0);
      toast.success('모든 알림을 읽음 처리했습니다.');
    } catch (error: unknown) {
      console.error('모두 읽음 처리 실패:', {
        code: asApiError(error).code,
        message: getReadableErrorMessage(error),
        raw: error,
      });
      toast.error('알림 처리에 실패했습니다.');
    }
  };

  /**
   * 알림 카드를 클릭하면 읽음 처리 후 상세를 연다
   */
  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setSelectedNotification(notification);
    setShowNotificationDetail(true);
    setShowNotifications(false);
  };

  /**
   * 통계 카드 클릭 핸들러
   */
  const handleStatsCardClick = async (type: 'total' | 'pending' | 'approved' | 'rejected', isAdminMode: boolean = false) => {
    try {
      setStatsDialogType(type);
      const supabase = createClient();
      
      let query = supabase.from('requests').select('*').is('deleted_at', null);
      
      // 부서 기반 필터링 (관리자 모드가 아니고, 전체 조회 권한이 없는 경우)
      if (!isAdminMode && !canViewAllCustomers() && profile?.department) {
        query = query.eq('customer', profile.department);
      }
      
      switch (type) {
        case 'pending':
          query = query.eq('status', 'pending');
          break;
        case 'approved':
          query = query.eq('status', 'approved');
          break;
        case 'rejected':
          query = query.eq('status', 'rejected');
          break;
        // 'total'은 필터링 없음
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setStatsDialogRequests((data || []) as PORequest[]);
      setShowStatsDialog(true);
    } catch (error) {
      console.error('통계 데이터 조회 실패:', error);
      toast.error('요청 내역을 불러올 수 없습니다.');
    }
  };

  /**
   * 요청 추가 다이얼로그 열기
   */
  const handleAddRequest = (type: 'existing' | 'new') => {
    setRequestType(type);
    // 초기값 설정
    setNewRequest(getInitialNewRequest(type));
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
    setProductCategory([]);
    setSONumberError('');
    setERPCodeError('');
    setAddDialogOpen(true);
  };

  /**
   * PO 수정 요청 SO 번호 입력 시 실시간 형식 검증
   */
  const handleSONumberChange = (value: string) => {
    setNewRequest((prev) => ({ ...prev, so_number: value }));
    if (requestType === 'existing') {
      if (value && !validateSONumber(value)) {
        setSONumberError(
          'SO 번호를 다시 확인해주세요. (형식: SO + 9자리 숫자, 예: SO123456789)'
        );
      } else {
        setSONumberError('');
      }
    } else {
      setSONumberError('');
    }
  };

  /**
   * 품목 ERP 코드 입력 시 실시간 형식 검증
   */
  const handleERPCodeChange = (value: string) => {
    setCurrentItem((prev) => ({ ...prev, erp_code: value }));
    if (value && !validateERPCode(value)) {
      setERPCodeError('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)');
    } else {
      setERPCodeError('');
    }
  };

  /**
   * 상세보기 열기 (전체 대기 내역 Dialog에서 호출)
   */
  const handleViewDetail = (request: PORequest) => {
    setDetailRequest(request);
    setShowDetailDialog(true);
    // allPendingDialogOpen은 true를 유지
  };

  /**
   * 상세보기 닫기 (전체 대기 내역 Dialog로 복귀)
   */
  const handleCloseDetail = () => {
    setShowDetailDialog(false);
    setDetailRequest(null);
    // allPendingDialogOpen은 true를 유지
  };

  /**
   * 품목 추가 핸들러
   */
  const handleAddItem = () => {
    if (currentItem.erp_code && !validateERPCode(currentItem.erp_code)) {
      toast.error('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)');
      return;
    }
    if (!currentItem.erp_code || !currentItem.item_name) {
      toast.error('품목코드와 품목명을 입력해주세요.');
      return;
    }

    setNewRequest({
      ...newRequest,
      items: [...newRequest.items, { ...currentItem }],
    });
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
    setERPCodeError('');
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
            }) as unknown[][];

            if (jsonData.length < 2) {
              toast.error('Excel 파일에 데이터가 없습니다.');
              return;
            }

            // 헤더 행 찾기 (품목코드, 품목명, 수량)
            const headerRow = jsonData[0];
            const erpCodeIndex = headerRow.findIndex((cell: unknown) => 
              String(cell).toLowerCase().includes('품목코드') || 
              String(cell).toLowerCase().includes('erp') ||
              String(cell).toLowerCase().includes('code')
            );
            const itemNameIndex = headerRow.findIndex((cell: unknown) => 
              String(cell).toLowerCase().includes('품목명') || 
              String(cell).toLowerCase().includes('item') ||
              String(cell).toLowerCase().includes('name')
            );
            const quantityIndex = headerRow.findIndex((cell: unknown) => 
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
        } catch (error: unknown) {
          console.error('Excel 파일 파싱 오류:', error);
          const errMsg = asApiError(error)?.message || '알 수 없는 오류';
          toast.error(`Excel 파일을 읽는 중 오류가 발생했습니다: ${errMsg}`);
        }
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error: unknown) {
      console.error('Excel 파일 업로드 오류:', error);
      const errMsg = asApiError(error)?.message || '알 수 없는 오류';
      toast.error(`파일 업로드 중 오류가 발생했습니다: ${errMsg}`);
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

    if (requestType === 'existing' && newRequest.so_number && !validateSONumber(newRequest.so_number)) {
      toast.error('SO 번호를 다시 확인해주세요. (형식: SO + 9자리 숫자)');
      return;
    }

    if (isItemListVisible && erpCodeError) {
      toast.error('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)');
      return;
    }

    // 품목 구분 필수 입력 확인 (수량 삭제 / 품목 추가 / 제품 추가 요청 시)
    if (needsProductCategory(newRequest.category_of_request) && productCategory.length === 0) {
      toast.error('품목 구분을 선택해주세요.');
      return;
    }
    
    // 운송방법은 'PO 수정 요청'이고 '운송방법 변경'일 때 필수
    if (requestType === 'existing' && newRequest.category_of_request === '운송방법 변경' && !newRequest.shipping_method) {
      toast.error('운송방법을 선택해주세요.');
      return;
    }

    if (
      requestType === 'existing' &&
      newRequest.category_of_request === '운송방법 변경' &&
      newRequest.shipping_method &&
      !availableShippingMethods.includes(newRequest.shipping_method)
    ) {
      toast.error('선택 가능한 운송방법이 아닙니다. 부서별 허용 운송방법을 확인해주세요.');
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
    let requestData: Record<string, unknown> | null = null;

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
      // factory_shipment_date: 현재 출하일 입력값 (PO 수정) 또는 희망 출하일 입력값 (PO 추가)
      // desired_shipment_date: 희망 출하일 입력값
      // confirmed_shipment_date: 확정 출하일 입력값 (검토자/관리자만)
      
      if (requestType === 'new') {
        // PO 추가 요청: 희망 출하일을 factory_shipment_date에 저장
        requestData.factory_shipment_date = newRequest.desired_shipment_date || new Date().toISOString().split('T')[0];
        if (newRequest.desired_shipment_date) {
          requestData.desired_shipment_date = newRequest.desired_shipment_date;
        }
      } else {
        // PO 수정 요청: 현재 출하일 그대로 사용
        requestData.factory_shipment_date = newRequest.factory_shipment_date;
        // 희망 출하일 (입력된 경우에만 저장)
        if (newRequest.desired_shipment_date) {
          requestData.desired_shipment_date = newRequest.desired_shipment_date;
        }
      }
      
      // 확정 출하일 (검토자/관리자만 입력 가능, 입력된 경우에만 저장)
      if (newRequest.confirmed_shipment_date && (isReviewer || isAdmin)) {
        requestData.confirmed_shipment_date = newRequest.confirmed_shipment_date;
      }
      
      // 운송방법은 'PO 수정 요청'이고 '운송방법 변경'일 때만 포함
      if (requestType === 'existing' && newRequest.category_of_request === '운송방법 변경' && newRequest.shipping_method) {
        requestData.shipping_method = newRequest.shipping_method;
      }

      // 품목 구분 저장 (수량 삭제 / 품목 추가 / 제품 추가 요청 시, 복수 선택 쉼표 구분 저장)
      if (needsProductCategory(newRequest.category_of_request) && productCategory.length > 0) {
        requestData.product_category = productCategory.join(', ');
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

      if (productCategory.length > 0 && needsProductCategory(newRequest.category_of_request)) {
        toast.success(`품목 구분 [${productCategory.join(', ')}]로 요청이 접수되었습니다.`);
      } else {
        toast.success('새 요청이 생성되었습니다.');
      }

      // 성공 시 폼 초기화
      resetAddRequestForm();
      
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
    } catch (error: unknown) {
      const err = asApiError(error);
      console.error('=== 요청 생성 오류 ===');
      console.error('전체 에러 객체:', error);
      console.error('에러 타입:', typeof error);
      console.error('에러 코드:', err?.code);
      console.error('에러 메시지:', err?.message);
      console.error('전송한 데이터:', requestData);
      
      // 에러 코드별 처리
      if (err?.code === 'PGRST301' || err?.message?.includes('permission')) {
        toast.error('요청을 생성할 권한이 없습니다.');
      } else if (err?.code === 'PGRST204') {
        // Schema cache 오류
        toast.error('데이터베이스 스키마 오류입니다. 페이지를 새로고침하거나 관리자에게 문의하세요.');
        console.error('PGRST204: 스키마 캐시에서 컬럼을 찾을 수 없습니다. Supabase 대시보드에서 테이블 구조를 확인하세요.');
      } else if (err?.code === '23514') {
        // CHECK constraint violation
        toast.error('입력값이 유효하지 않습니다. 품목을 1개 이상 추가하고 수량은 양수로 입력해주세요.');
      } else if (err?.code === '23502') {
        // NOT NULL constraint violation
        toast.error('필수 항목이 누락되었습니다. 모든 필수 필드를 입력해주세요.');
      } else if (err?.message) {
        toast.error(`요청 생성 실패: ${err.message}`);
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
  const _handleSaveRequest = async (request: PORequest) => {
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
    } catch (error: unknown) {
      const err = asApiError(error);
      console.error('요청 수정 오류:', error);
      console.error('오류 상세:', JSON.stringify(error, null, 2));
      
      if (err?.code === 'PGRST301' || err?.message?.includes('permission')) {
        toast.error('요청을 수정할 권한이 없습니다.');
      } else if (err?.message) {
        toast.error(`요청 수정 실패: ${err.message}`);
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
    } catch (error: unknown) {
      const err = asApiError(error);
      console.error('요청 삭제 오류:', error);
      console.error('오류 상세:', JSON.stringify(error, null, 2));
      
      if (err?.code === 'PGRST301' || err?.message?.includes('permission')) {
        toast.error('요청을 삭제할 권한이 없습니다.');
      } else if (err?.message) {
        toast.error(`요청 삭제 실패: ${err.message}`);
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
  const _handleDeleteClick = (id: string) => {
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

  // (삭제됨: 최근 요청 카드는 더 이상 사용하지 않음)

  /** 외부 링크 URL 상수 */
  const EXTERNAL_LINKS = {
    D365: 'https://inbody.operations.dynamics.com/?cmp=IHQ&mi=DefaultDashboard',
    GM: 'https://gm.weareinbody.com/',
  } as const;

  /**
   * 외부 링크를 새 탭에서 여는 핸들러
   */
  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <Header
        userName={profile?.full_name || user.email?.split('@')[0] || '사용자'}
        userEmail={user.email || undefined}
        rightSlot={
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={0}>
              {/* D365 링크 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative flex h-9 w-9 items-center justify-center rounded-full p-0 hover:bg-gray-100"
                    onClick={() => handleExternalLink(EXTERNAL_LINKS.D365)}
                    aria-label="D365 ERP 시스템을 새 탭에서 열기"
                  >
                    <Database className="h-6 w-6 text-[#101820]" strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>D365</TooltipContent>
              </Tooltip>

              {/* GM 링크 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative flex h-9 w-9 items-center justify-center rounded-full p-0 hover:bg-gray-100"
                    onClick={() => handleExternalLink(EXTERNAL_LINKS.GM)}
                    aria-label="GM 해외 발주 사이트를 새 탭에서 열기"
                  >
                    <Globe className="h-6 w-6 text-[#101820]" strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>GM</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 기존 알림 아이콘 */}
            <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="relative flex h-9 w-9 items-center justify-center rounded-full p-0 hover:bg-gray-100"
                aria-label="알림 열기"
              >
                <Bell className="h-6 w-6 text-[#101820]" strokeWidth={2} />
                {unreadCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#971B2F] px-1 text-[10px] font-semibold text-white leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="flex items-center justify-between border-b p-4">
                <h3 className="text-lg font-semibold text-[#101820]">알림</h3>
                {unreadCount > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-[#67767F] hover:text-[#101820]"
                  >
                    모두 읽음
                  </Button>
                ) : null}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#67767F]">알림이 없습니다.</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={cn(
                        'w-full border-b p-4 text-left cursor-pointer transition-colors hover:bg-gray-50',
                        !notification.is_read && 'bg-blue-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-1 flex h-8 w-8 items-center justify-center rounded-full',
                            notification.type === 'approved' ? 'bg-green-100' : 'bg-red-100'
                          )}
                        >
                          {notification.type === 'approved' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p
                              className={cn(
                                'text-sm font-medium',
                                !notification.is_read ? 'text-[#101820]' : 'text-[#67767F]'
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.is_read ? (
                              <span className="h-2 w-2 rounded-full bg-[#971B2F]" />
                            ) : null}
                          </div>
                          {notification.requests?.product_category && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-[#67767F]">📦</span>
                              {renderProductCategoryBadges(notification.requests.product_category)}
                            </div>
                          )}
                          <p className="text-xs text-[#67767F]">
                            SO 번호: {notification.requests?.so_number || '-'}
                          </p>
                          <p className="text-xs text-[#67767F]">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale: ko,
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          </div>
        }
      />

      <div className="w-full px-8 py-6 lg:px-14 xl:px-20">
        <div className="space-y-6">
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

          {/* 상단: 라디오 버튼 (Segmented Control) */}
          <div className="flex justify-end items-center">
            <RadioGroup
              value={pageMode}
              onValueChange={handleModeChange}
              className="inline-flex bg-[#F3F4F6] p-1 rounded-lg gap-1"
              aria-label="페이지 모드 선택"
            >
              <label
                htmlFor="mode-requester"
                className={cn(
                  'px-4 py-2 rounded-md cursor-pointer transition-all text-sm font-medium',
                  pageMode === 'requester'
                    ? 'bg-white text-[#971B2F] shadow-sm'
                    : 'text-[#67767F] hover:text-[#4B4F5A]'
                )}
              >
                <RadioGroupItem value="requester" id="mode-requester" className="sr-only" />
                요청자/검토자
              </label>
              <label
                htmlFor="mode-admin"
                className={cn(
                  'px-4 py-2 rounded-md cursor-pointer transition-all text-sm font-medium',
                  pageMode === 'admin'
                    ? 'bg-white text-[#971B2F] shadow-sm'
                    : 'text-[#67767F] hover:text-[#4B4F5A]'
                )}
              >
                <RadioGroupItem value="admin" id="mode-admin" className="sr-only" />
                관리자
              </label>
            </RadioGroup>
          </div>

          {/* 요청자/검토자 페이지 */}
          {pageMode === 'requester' && (
          <>

          {/* 요청 현황 대시보드 제목 */}
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-[#101820]">
              PO 변경 요청 현황 <ClipboardList className="inline-block ml-1 size-7 text-[#971B2F]" />
            </h1>
            <p className="text-[#67767F] mt-1">요청 접수부터 완료까지 진행 현황을 한눈에 확인하세요.</p>
          </div>

          {/* 요청 진행현황 대시보드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="전체 요청"
              value={stats.total}
              subtitle="클릭하여 상세 보기"
              icon={<ClipboardList className="h-8 w-8 text-[#971B2F]" />}
              themeColor="#A2B2C8"
              onClick={() => handleStatsCardClick('total')}
            />
            <StatsCard
              title="검토 대기"
              value={stats.pending}
              subtitle="클릭하여 상세 보기"
              icon={<Clock className="h-8 w-8 text-[#67767F]" />}
              themeColor="#67767F"
              onClick={() => handleStatsCardClick('pending')}
            />
            <StatsCard
              title="승인"
              value={stats.approved}
              subtitle="클릭하여 상세 보기"
              icon={<CheckCircle2 className="h-8 w-8 text-[#A2B2C8]" />}
              themeColor="#A2B2C8"
              onClick={() => handleStatsCardClick('approved')}
            />
            <StatsCard
              title="반려"
              value={stats.rejected}
              subtitle="클릭하여 상세 보기"
              icon={<XCircle className="h-8 w-8 text-[#971B2F]" />}
              themeColor="#971B2F"
              onClick={() => handleStatsCardClick('rejected')}
            />
          </div>

          {/* 요청 접수 + 검토 대기: PC에서 1:2 비율 3열 */}
          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            {/* 요청 접수 영역 */}
            <Card className="border-[#E5E7EB] flex flex-col min-h-[380px]">
              <CardHeader>
                <CardTitle className="text-xl text-[#101820]">요청 접수</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4 p-6">
                <Button
                  className="flex-1 w-full flex-col gap-1 text-xl font-semibold bg-[#971B2F] hover:bg-[#7A1626] text-white"
                  onClick={() => handleAddRequest('existing')}
                  aria-label="PO 수정 요청 작성"
                >
                  <span className="flex items-center">
                    <Edit className="mr-2 h-6 w-6" />
                    PO 수정 요청
                  </span>
                  <span className="text-xs font-normal opacity-80">
                    수량 삭제 / 품목코드 변경 / 출하일정 변경 / 운송방법 변경 / 기타
                  </span>
                </Button>
                <Button
                  className="flex-1 w-full flex-col gap-1 text-xl font-semibold bg-[#A2B2C8] hover:bg-[#8A9BB1] text-[#101820]"
                  onClick={() => handleAddRequest('new')}
                  aria-label="PO 추가 요청 작성"
                >
                  <span className="flex items-center">
                    <Plus className="mr-2 h-6 w-6" />
                    PO 추가 요청
                  </span>
                  <span className="text-xs font-normal opacity-80">품목 추가</span>
                </Button>
              </CardContent>
            </Card>

            {/* 검토 대기 영역 */}
            <Card className="border-[#E5E7EB] flex flex-col min-h-[380px] lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl text-[#101820]">검토 대기</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-6">
                {requesterPendingLoading ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="검토 대기 로딩 중">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] p-4 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                    ))}
                  </div>
                ) : requesterPendingRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-[#67767F]">검토 대기 중인 요청이 없습니다.</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="grid grid-cols-1 gap-3 flex-1 sm:grid-cols-2 xl:grid-cols-4">
                      {requesterPendingRequests.slice(0, 4).map((request) => {
                        const daysLeft = calculateDaysLeft(request.factory_shipment_date);
                        const ownRequest = isOwnRequest(request);
                        return (
                          <div
                            key={request.id}
                            className={cn(
                              'bg-white rounded-lg border border-[#E5E7EB] p-4 transition-shadow',
                              ownRequest
                                ? 'opacity-70 cursor-not-allowed'
                                : 'hover:shadow-md cursor-pointer'
                            )}
                            onClick={() => {
                              if (ownRequest) return;
                              handleViewDetails(request.id);
                            }}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-lg font-semibold text-[#101820]">
                                {request.so_number ? `SO: ${request.so_number}` : '신규'}
                              </span>
                              <span className={cn(
                                'px-2 py-0.5 rounded text-xs font-medium',
                                daysLeft <= 5 ? 'bg-red-100 text-red-700' :
                                daysLeft <= 10 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              )}>
                                D-{daysLeft}일
                              </span>
                            </div>
                            <p className="text-sm text-[#67767F] mb-1">{request.customer}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{request.category_of_request}</Badge>
                              <span className="text-sm text-[#67767F]">
                                출하일: {request.factory_shipment_date ? formatDate(request.factory_shipment_date) : '-'}
                              </span>
                            </div>
                            {ownRequest && (
                              <p className="mt-2 text-xs font-medium text-[#971B2F]">
                                본인 요청 건으로 검토할 수 없습니다.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {requesterPendingRequests.length > 4 && (
                      <Button
                        onClick={() => setAllPendingDialogOpen(true)}
                        variant="outline"
                        className="w-full mt-3 text-[#971B2F] border-[#971B2F] hover:bg-[#971B2F] hover:text-white"
                      >
                        전체 대기 내역 ({requesterPendingRequests.length}건)
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 요청 접수 내역 카드 */}
          <Card className="border-[#E5E7EB] mb-6">
            <CardHeader>
              <CardTitle className="text-xl text-[#101820]">요청 접수 내역</CardTitle>
              <p className="text-sm text-[#67767F]">총 {sortedRequesterHistoryRequests.length}건의 요청</p>
            </CardHeader>
            <CardContent>
              {/* 검색/필터/정렬 바 */}
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#67767F]" />
                  <Input
                    placeholder="SO 번호, 고객명으로 검색..."
                    value={requesterSearchTerm}
                    onChange={(e) => setRequesterSearchTerm(e.target.value)}
                    className="pl-10"
                    aria-label="요청자 검색"
                  />
                </div>
                <Select value={requesterFilterStatus} onValueChange={setRequesterFilterStatus}>
                  <SelectTrigger className="w-full md:w-[140px]">
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="pending">검토대기</SelectItem>
                    <SelectItem value="approved">승인</SelectItem>
                    <SelectItem value="rejected">반려</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={requesterFilterCustomer} onValueChange={setRequesterFilterCustomer}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="고객" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 고객</SelectItem>
                    {requesterCustomerOptions.map((customer) => (
                      <SelectItem key={customer} value={customer}>
                        {customer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={requesterSortOrder} onValueChange={setRequesterSortOrder}>
                  <SelectTrigger className="w-full md:w-[170px]">
                    <SelectValue placeholder="정렬" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="request-date-desc">요청일 최신순</SelectItem>
                    <SelectItem value="request-date-asc">요청일 오래된순</SelectItem>
                    <SelectItem value="shipment-date-asc">출하일 빠른순</SelectItem>
                    <SelectItem value="shipment-date-desc">출하일 늦은순</SelectItem>
                    <SelectItem value="priority-desc">우선순위 높은순</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                ref={requesterTableScrollRef}
                className="overflow-x-auto overflow-y-auto max-h-[500px] border rounded-lg"
                onScroll={handleRequesterTableScroll}
              >
                <AdminTable className="min-w-[1700px]">
                  <AdminTableHeader className="sticky top-0 bg-white z-20 shadow-sm">
                    <AdminTableRow>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">요청일</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">SO 번호</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">고객</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">요청부서</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">요청자</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">출하일</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">요청구분</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">품목구분</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">품목코드</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">품목명</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">수량</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">확정 수량</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">요청사유</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">검토 상세</AdminTableHead>
                      <AdminTableHead className="sticky top-0 z-20 bg-white">상태</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {sortedRequesterHistoryRequests.length === 0 ? (
                      <AdminTableRow>
                        <AdminTableCell colSpan={14} className="text-center py-8 text-[#67767F]">
                          요청 데이터가 없습니다.
                        </AdminTableCell>
                      </AdminTableRow>
                    ) : (
                      sortedRequesterHistoryRequests.map((r) => (
                        <AdminTableRow key={r.id}>
                          <AdminTableCell className="text-[#4B4F5A]">{r.request_date ? formatDate(r.request_date) : '-'}</AdminTableCell>
                          <AdminTableCell className="font-medium text-[#101820]">{r.so_number || '-'}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.customer}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.requesting_dept}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.requester_name}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.factory_shipment_date ? formatDate(r.factory_shipment_date) : '-'}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.category_of_request}</AdminTableCell>
                          <AdminTableCell>
                            {needsProductCategory(r.category_of_request) && r.product_category
                              ? renderProductCategoryBadges(r.product_category)
                              : <span className="text-[#B2B4B8]">-</span>}
                          </AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.erp_code || '-'}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.item_name || '-'}</AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.quantity || 0}</AdminTableCell>
                          <AdminTableCell className="text-right">
                            {isItemAdditionCategory(r.category_of_request) &&
                            r.confirmed_quantity !== null &&
                            r.confirmed_quantity !== undefined ? (
                              <div className="flex flex-col items-end">
                                <span
                                  className={cn(
                                    'font-semibold',
                                    r.confirmed_quantity < (r.quantity || 0) ? 'text-orange-600' : 'text-green-600'
                                  )}
                                >
                                  {r.confirmed_quantity.toLocaleString()}
                                </span>
                                {r.confirmed_quantity < (r.quantity || 0) && (
                                  <span className="text-xs text-orange-500">
                                    ({(r.quantity || 0) - r.confirmed_quantity} 부족)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#B2B4B8]">-</span>
                            )}
                          </AdminTableCell>
                          <AdminTableCell className="text-[#4B4F5A]">{r.reason_for_request}</AdminTableCell>
                          <AdminTableCell className="max-w-xs truncate text-[#4B4F5A]" title={r.review_details || '-'}>
                            {r.review_details || '-'}
                          </AdminTableCell>
                          <AdminTableCell>
                            <Badge
                              variant={
                                r.status === 'approved' ? 'default' :
                                r.status === 'rejected' ? 'destructive' :
                                'secondary'
                              }
                              className={
                                r.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                r.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                r.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                r.status === 'in_review' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                'bg-gray-100 text-gray-500 border-gray-200'
                              }
                            >
                              {getStatusLabel(r.status)}
                            </Badge>
                          </AdminTableCell>
                        </AdminTableRow>
                      ))
                    )}
                  </AdminTableBody>
                </AdminTable>
              </div>
              {/* 하단 고정 가로 스크롤바 (세로 끝까지 내리지 않아도 항상 보이도록 처리) */}
              <div
                ref={requesterBottomScrollbarRef}
                className="overflow-x-auto overflow-y-hidden h-4 mt-2 border rounded bg-white"
                onScroll={handleRequesterBottomScrollbarScroll}
                aria-label="요청 내역 하단 가로 스크롤바"
              >
                <div ref={requesterBottomScrollbarInnerRef} className="h-px" />
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {/* 관리자 페이지 */}
          {pageMode === 'admin' && isAdminAuthenticated && (
          <>
            {/* 관리자 인사말 */}
            <div>
              <h1 className="text-3xl font-bold text-[#101820]">
                관리자 대시보드 🔧
              </h1>
              <p className="text-[#67767F] mt-1">전체 요청 현황을 관리합니다.</p>
            </div>

            {/* 관리자 전용 대시보드 (차트) */}
            {isReviewer && (
              <div className="mb-8">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-[#101820]">📊 대시보드</h2>
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-[#67767F]">전체 {adminRequests.length}건</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setAdminLoading(true);
                        setAdminError(null);
                        try {
                          await Promise.all([fetchAdminStats(), fetchAdminRequests()]);
                        } finally {
                          setAdminLoading(false);
                        }
                      }}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      새로고침
                    </Button>
                  </div>
                </div>

                {adminRequests.length === 0 ? (
                  <div className="rounded-lg border bg-gray-50 p-12 text-center">
                    <BarChart3 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                    <p className="text-sm text-[#67767F]">표시할 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 차트 1: 고객처/부서별 */}
                    <div className="rounded-lg border bg-white p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[#101820]">요청 건수 분석</h3>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              activeTab === 'customer' && 'border-[#971B2F] bg-[#971B2F] text-white hover:bg-[#7A1626] hover:text-white'
                            )}
                            onClick={() => setActiveTab('customer')}
                          >
                            고객처별
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              activeTab === 'department' && 'border-[#971B2F] bg-[#971B2F] text-white hover:bg-[#7A1626] hover:text-white'
                            )}
                            onClick={() => setActiveTab('department')}
                          >
                            부서별
                          </Button>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={activeTab === 'customer' ? customerStats : departmentStats}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                          <YAxis tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                                    <p className="mb-1 font-bold text-[#101820]">{(payload[0].payload as ChartData).name}</p>
                                    <p className="text-sm font-semibold text-[#971B2F]">📊 {payload[0].value}건</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="count" fill="#971B2F" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 차트 2-3: 요청 구분/사유 */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* 차트 2: 요청 구분별 */}
                      <div className="rounded-lg border bg-white p-6">
                        <h3 className="mb-4 text-lg font-semibold text-[#101820]">요청 구분별 분석</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={categoryStats} layout="vertical" margin={{ left: 90 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis type="number" tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                            <YAxis dataKey="name" type="category" width={85} tick={{ fill: '#4B4F5A', fontSize: 11 }} />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const total = categoryStats.reduce((sum, item) => sum + item.count, 0);
                                  const value = Number(payload[0].value || 0);
                                  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                  return (
                                    <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                                      <p className="mb-1 font-bold text-[#101820]">{(payload[0].payload as ChartData).name}</p>
                                      <p className="text-sm font-semibold text-[#971B2F]">📊 {value}건</p>
                                      <p className="text-xs text-[#67767F]">전체의 {percentage}%</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="count" fill="#4B4F5A" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* 차트 3: 요청 사유별 */}
                      <div className="rounded-lg border bg-white p-6">
                        <h3 className="mb-4 text-lg font-semibold text-[#101820]">요청 사유별 분석</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={reasonStats} layout="vertical" margin={{ left: 90 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis type="number" tick={{ fill: '#4B4F5A', fontSize: 12 }} />
                            <YAxis dataKey="name" type="category" width={85} tick={{ fill: '#4B4F5A', fontSize: 11 }} />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const total = reasonStats.reduce((sum, item) => sum + item.count, 0);
                                  const value = Number(payload[0].value || 0);
                                  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                  return (
                                    <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                                      <p className="mb-1 font-bold text-[#101820]">{(payload[0].payload as ChartData).name}</p>
                                      <p className="text-sm font-semibold text-[#971B2F]">📊 {value}건</p>
                                      <p className="text-xs text-[#67767F]">전체의 {percentage}%</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="count" fill="#67767F" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* 차트 4: 승인/반려 비율 */}
                    <div className="flex justify-center">
                      <div className="w-full max-w-3xl rounded-lg border bg-white p-6">
                        <h3 className="mb-4 text-center text-lg font-semibold text-[#101820]">승인/반려 비율</h3>
                        <ResponsiveContainer width="100%" height={400}>
                          <PieChart>
                            <defs>
                              {/* 승인: 버건디 그라디언트 */}
                              <linearGradient id="gradApproved" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#971B2F" />
                                <stop offset="100%" stopColor="#C9485E" />
                              </linearGradient>
                              {/* 반려: 다크 그레이 그라디언트 */}
                              <linearGradient id="gradRejected" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#4B4F5A" />
                                <stop offset="100%" stopColor="#767B88" />
                              </linearGradient>
                              {/* 대기: 블루 그레이 그라디언트 */}
                              <linearGradient id="gradPending" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#A2B2C8" />
                                <stop offset="100%" stopColor="#C8D4E2" />
                              </linearGradient>
                            </defs>
                            <Pie
                              data={statusStats}
                              cx="50%"
                              cy="50%"
                              innerRadius={80}
                              outerRadius={130}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, percentage }) => `${name} ${percentage}%`}
                            >
                              {statusStats.map((entry, index) => {
                                const gradients: Record<string, string> = {
                                  승인: 'url(#gradApproved)',
                                  반려: 'url(#gradRejected)',
                                  대기: 'url(#gradPending)',
                                };
                                const solidColors: Record<string, string> = {
                                  승인: '#971B2F',
                                  반려: '#4B4F5A',
                                  대기: '#A2B2C8',
                                };
                                return (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={gradients[entry.name] || '#6B7280'}
                                    stroke={solidColors[entry.name] || '#6B7280'}
                                    strokeWidth={1}
                                  />
                                );
                              })}
                            </Pie>
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload as StatusData;
                                  return (
                                    <div className="rounded-lg border-2 border-[#971B2F] bg-white p-3 shadow-xl">
                                      <p className="mb-1 font-bold text-[#101820]">{data.name}</p>
                                      <p className="text-sm font-semibold text-[#971B2F]">📊 {data.value}건</p>
                                      <p className="text-xs text-[#67767F]">전체의 {data.percentage}%</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Legend
                              verticalAlign="bottom"
                              height={50}
                              formatter={(value, entry) => {
                                const data = (entry as unknown as { payload: StatusData }).payload;
                                const dotColors: Record<string, string> = {
                                  승인: '#971B2F',
                                  반려: '#4B4F5A',
                                  대기: '#A2B2C8',
                                };
                                return (
                                  <span className="inline-flex items-center gap-1 text-sm">
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full"
                                      style={{ background: dotColors[value] || '#6B7280' }}
                                    />
                                    {value}: <strong>{data.value}건</strong> ({data.percentage}%)
                                  </span>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 에러 표시 */}
            {adminError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>오류 발생</AlertTitle>
                <AlertDescription>{adminError}</AlertDescription>
              </Alert>
            )}

            {/* 요청 접수 내역 테이블 */}
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl text-[#4B4F5A]">요청 접수 내역</CardTitle>
                  <Button
                    onClick={handleExportExcel}
                    className="text-white"
                    style={{ backgroundColor: '#971B2F' }}
                    aria-label="Excel 파일 다운로드"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Excel 다운로드
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
              {/* 검색/필터/정렬 바 */}
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#67767F]" />
                  <Input
                    placeholder="SO 번호, 고객명, 품목명으로 검색..."
                    value={adminSearchTerm}
                    onChange={(e) => setAdminSearchTerm(e.target.value)}
                    className="pl-10"
                    aria-label="검색"
                  />
                </div>
                <Select value={adminFilterStatus} onValueChange={setAdminFilterStatus}>
                  <SelectTrigger className="w-full md:w-[140px]">
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="pending">검토대기</SelectItem>
                    <SelectItem value="approved">승인</SelectItem>
                    <SelectItem value="rejected">반려</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={adminFilterCategory} onValueChange={setAdminFilterCategory}>
                  <SelectTrigger className="w-full md:w-[140px]">
                    <SelectValue placeholder="요청구분" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 구분</SelectItem>
                    <SelectItem value="품목 추가">품목 추가</SelectItem>
                    <SelectItem value="수량 삭제">수량 삭제</SelectItem>
                    <SelectItem value="품목코드 변경">품목코드 변경</SelectItem>
                    <SelectItem value="출하일정 변경">출하일정 변경</SelectItem>
                    <SelectItem value="운송방법 변경">운송방법 변경</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full md:w-[280px] justify-start text-left font-normal',
                        !adminDateRange && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {adminDateRange?.from ? (
                        adminDateRange.to ? (
                          <>
                            {formatDateRange(adminDateRange.from, 'yyyy-MM-dd', { locale: ko })} -{' '}
                            {formatDateRange(adminDateRange.to, 'yyyy-MM-dd', { locale: ko })}
                          </>
                        ) : (
                          formatDateRange(adminDateRange.from, 'yyyy-MM-dd', { locale: ko })
                        )
                      ) : (
                        <span>날짜 범위 선택</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={adminDateRange?.from}
                      selected={adminDateRange}
                      onSelect={setAdminDateRange}
                      numberOfMonths={2}
                      locale={ko}
                    />
                    <div className="p-3 border-t">
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setAdminDateRange(undefined)}
                      >
                        초기화
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Select value={adminSortOrder} onValueChange={setAdminSortOrder}>
                  <SelectTrigger className="w-full md:w-[150px]">
                    <SelectValue placeholder="정렬" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">요청일 최신순</SelectItem>
                    <SelectItem value="oldest">요청일 오래된순</SelectItem>
                    <SelectItem value="shipment-asc">출하일 빠른순</SelectItem>
                    <SelectItem value="shipment-desc">출하일 늦은순</SelectItem>
                    <SelectItem value="customer-asc">고객명 오름차순</SelectItem>
                    <SelectItem value="customer-desc">고객명 내림차순</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {adminLoading ? (
                <div className="space-y-3" role="status" aria-label="요청 내역 로딩 중">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto overflow-x-auto border rounded-lg relative scrollbar-thin scrollbar-thumb-[#B2B4B8] scrollbar-track-gray-100">
                  <AdminTable>
                    <AdminTableCaption>PO 변경 요청 접수 내역 (필터 적용: {filteredAndSortedAdminRequests.length}건 / 전체 {adminRequests.length}건)</AdminTableCaption>
                    <AdminTableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                      <AdminTableRow>
                        <AdminTableHead className="min-w-[100px] bg-white border-b">요청일</AdminTableHead>
                        <AdminTableHead className="min-w-[120px] bg-white border-b">SO번호</AdminTableHead>
                        <AdminTableHead className="min-w-[100px] bg-white border-b">고객</AdminTableHead>
                        <AdminTableHead className="min-w-[100px] bg-white border-b">요청부서</AdminTableHead>
                        <AdminTableHead className="min-w-[80px] bg-white border-b">요청자</AdminTableHead>
                        <AdminTableHead className="min-w-[100px] bg-white border-b">출하일</AdminTableHead>
                        <AdminTableHead className="min-w-[120px] bg-white border-b">요청구분</AdminTableHead>
                        <AdminTableHead className="min-w-[100px] bg-white border-b">품목구분</AdminTableHead>
                        <AdminTableHead className="min-w-[120px] bg-white border-b">품목코드</AdminTableHead>
                        <AdminTableHead className="min-w-[150px] bg-white border-b">품목명</AdminTableHead>
                        <AdminTableHead className="min-w-[60px] bg-white border-b">수량</AdminTableHead>
                        <AdminTableHead className="min-w-[90px] bg-white border-b">확정 수량</AdminTableHead>
                        <AdminTableHead className="min-w-[120px] bg-white border-b">요청사유</AdminTableHead>
                        <AdminTableHead className="min-w-[180px] bg-white border-b">검토 상세</AdminTableHead>
                        <AdminTableHead className="min-w-[80px] bg-white border-b">상태</AdminTableHead>
                      </AdminTableRow>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {filteredAndSortedAdminRequests.length === 0 ? (
                        <AdminTableRow>
                          <AdminTableCell colSpan={14} className="text-center py-8 text-[#67767F]">
                            {adminRequests.length === 0 ? '요청 데이터가 없습니다.' : '검색 결과가 없습니다.'}
                          </AdminTableCell>
                        </AdminTableRow>
                      ) : (
                        filteredAndSortedAdminRequests.map((r) => (
                          <AdminTableRow key={r.id}>
                            <AdminTableCell className="text-[#4B4F5A]">{r.request_date ? formatDate(r.request_date) : '-'}</AdminTableCell>
                            <AdminTableCell className="font-medium text-[#101820]">{r.so_number || '-'}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.customer}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.requesting_dept}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.requester_name}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.factory_shipment_date ? formatDate(r.factory_shipment_date) : '-'}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.category_of_request}</AdminTableCell>
                            <AdminTableCell>
                              {needsProductCategory(r.category_of_request) && r.product_category
                                ? renderProductCategoryBadges(r.product_category)
                                : <span className="text-[#B2B4B8]">-</span>}
                            </AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.erp_code || '-'}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.item_name || '-'}</AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.quantity || 0}</AdminTableCell>
                            <AdminTableCell className="text-right">
                              {isItemAdditionCategory(r.category_of_request) &&
                              r.confirmed_quantity !== null &&
                              r.confirmed_quantity !== undefined ? (
                                <div className="flex flex-col items-end">
                                  <span
                                    className={cn(
                                      'font-semibold',
                                      r.confirmed_quantity < (r.quantity || 0) ? 'text-orange-600' : 'text-green-600'
                                    )}
                                  >
                                    {r.confirmed_quantity.toLocaleString()}
                                  </span>
                                  {r.confirmed_quantity < (r.quantity || 0) && (
                                    <span className="text-xs text-orange-500">
                                      ({(r.quantity || 0) - r.confirmed_quantity} 부족)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#B2B4B8]">-</span>
                              )}
                            </AdminTableCell>
                            <AdminTableCell className="text-[#4B4F5A]">{r.reason_for_request}</AdminTableCell>
                            <AdminTableCell className="max-w-xs truncate text-[#4B4F5A]" title={r.review_details || '-'}>
                              {r.review_details || '-'}
                            </AdminTableCell>
                            <AdminTableCell>
                              <Badge
                                variant={
                                  r.status === 'approved' ? 'default' :
                                  r.status === 'rejected' ? 'destructive' :
                                  'secondary'
                                }
                                className={
                                  r.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                  r.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                  r.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                  r.status === 'in_review' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                  r.status === 'completed' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                  'bg-gray-100 text-gray-500 border-gray-200'
                                }
                              >
                                {r.status === 'pending' ? '검토대기' : r.status === 'approved' ? '승인' : r.status === 'rejected' ? '반려' : r.status === 'in_review' ? '검토중' : r.status === 'completed' ? '완료' : '-'}
                              </Badge>
                            </AdminTableCell>
                          </AdminTableRow>
                        ))
                      )}
                    </AdminTableBody>
                  </AdminTable>
                </div>
              )}
              </CardContent>
            </Card>
          </>
          )}
        </div>
      </div>

      {/* 관리자 비밀번호 입력 다이얼로그 */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        setShowPasswordDialog(open);
        if (!open) {
          setPasswordInput('');
          setPasswordError('');
          if (!isAdminAuthenticated) {
            setPageMode('requester');
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>관리자 인증</DialogTitle>
            <DialogDescription>
              관리자 페이지에 접근하려면 비밀번호를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">비밀번호</Label>
              <Input
                id="admin-password"
                type="password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePasswordSubmit();
                  }
                }}
                placeholder="비밀번호를 입력하세요"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-red-500">{passwordError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPasswordDialog(false);
              setPasswordInput('');
              setPasswordError('');
              setPageMode('requester');
            }}>
              취소
            </Button>
            <Button onClick={handlePasswordSubmit} className="bg-[#971B2F] hover:bg-[#7A1626]">
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 요청 상세 보기 다이얼로그 */}
      <AlertDialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>요청 상세 정보</AlertDialogTitle>
          </AlertDialogHeader>
          {selectedRequest && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 검토자용 품목 구분 강조 박스 */}
              {(isReviewer || isAdmin) && !isOwnRequest(selectedRequest) && selectedRequest.product_category && (
                <div className="rounded-lg border-2 border-[#971B2F]/30 bg-gradient-to-r from-[#971B2F]/5 to-[#971B2F]/10 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#971B2F]/15">
                      <Package className="h-5 w-5 text-[#971B2F]" />
                    </div>
                    <div className="flex-1">
                      <p className="mb-1.5 text-sm font-medium text-[#971B2F]">품목 구분</p>
                      <div>{renderProductCategoryBadges(selectedRequest.product_category, 'md')}</div>
                      <p className="mt-1.5 text-xs text-[#67767F]">
                        📦 담당 부서 배정에 사용됩니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
                {needsProductCategory(selectedRequest.category_of_request) && (
                  <div>
                    <p className="text-sm font-medium text-[#67767F]">품목구분</p>
                    <div className="mt-1">
                      {renderProductCategoryBadges(selectedRequest.product_category, 'md') ?? (
                        <p className="text-[#B2B4B8]">-</p>
                      )}
                    </div>
                  </div>
                )}
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
                {isItemAdditionCategory(selectedRequest.category_of_request) &&
                  selectedRequest.confirmed_quantity !== null &&
                  selectedRequest.confirmed_quantity !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-[#67767F]">확정 수량</p>
                      <p
                        className={cn(
                          'font-semibold',
                          selectedRequest.confirmed_quantity < selectedRequest.quantity
                            ? 'text-orange-600'
                            : 'text-green-600'
                        )}
                      >
                        {selectedRequest.confirmed_quantity}
                      </p>
                      {selectedRequest.confirmed_quantity < selectedRequest.quantity && (
                        <p className="mt-1 text-xs text-orange-600">
                          요청 수량보다 {selectedRequest.quantity - selectedRequest.confirmed_quantity}개 적습니다
                        </p>
                      )}
                    </div>
                  )}
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
                  {(isReviewer || isAdmin) && !isOwnRequest(selectedRequest) ? (
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
                  {(isReviewer || isAdmin) && !isOwnRequest(selectedRequest) ? (
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
                {(isReviewer || isAdmin) && isOwnRequest(selectedRequest) && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-[#971B2F]">
                      본인 요청 건은 검토할 수 없습니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            {(isReviewer || isAdmin) && !isOwnRequest(selectedRequest) && (
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
      <Dialog open={addDialogOpen} onOpenChange={handleAddDialogChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#101820]">
              {requestType === 'existing' ? 'PO 수정 요청' : 'PO 추가 요청'}
            </DialogTitle>
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
                    {availableCustomers.map((customerName) => (
                      <SelectItem key={customerName} value={customerName}>
                        {customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* SO 번호 필드 */}
              <div className="space-y-2">
                <Label htmlFor="so_number">
                  SO 번호{' '}
                  {requestType === 'existing' && <span className="text-[#971B2F]">*</span>}
                </Label>
                <Input
                  id="so_number"
                  value={newRequest.so_number}
                  onChange={(e) => handleSONumberChange(e.target.value)}
                  placeholder="예: SO123456789"
                  aria-invalid={requestType === 'existing' && Boolean(soNumberError)}
                  aria-describedby={
                    requestType === 'existing' && soNumberError ? 'so-number-error-msg' : undefined
                  }
                  className={cn(
                    requestType === 'existing' &&
                      soNumberError &&
                      'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500'
                  )}
                />
                {requestType === 'existing' && soNumberError ? (
                  <p id="so-number-error-msg" className="text-xs text-red-500" role="alert">
                    {soNumberError}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* 현재 출하일 (PO 수정 요청일 때만 표시) */}
              {requestType === 'existing' && (
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
              )}
              {/* 희망 출하일 (PO 추가 요청일 때 표시, factory_shipment_date에 저장됨) */}
              {requestType === 'new' && (
                <div className="space-y-2">
                  <Label htmlFor="desired_shipment_date">
                    희망 출하일 <span className="text-red-500">*</span>
                  </Label>
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
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requestType === 'new' ? (
                      // PO 추가 요청: 수량 추가 옵션 제거
                      <>
                        <SelectItem value="품목 추가">품목 추가</SelectItem>
                      </>
                    ) : (
                      // PO 수정 요청: 품목 추가, 수량 추가 제외
                      <>
                        <SelectItem value="수량 삭제">수량 삭제</SelectItem>
                        <SelectItem value="품목코드 변경">품목코드 변경</SelectItem>
                        <SelectItem value="출하일정 변경">출하일정 변경</SelectItem>
                        <SelectItem value="운송방법 변경">운송방법 변경</SelectItem>
                        <SelectItem value="기타">기타</SelectItem>
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
                      {availableShippingMethods.map((method) => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label>품목 목록 <span className="text-red-500">*</span></Label>
                    <p className="text-xs text-[#67767F]">변경 후 최종 수량을 입력해주세요</p>
                  </div>
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

                {/* 품목 구분 선택 (수량 삭제 / 품목 추가 / 제품 추가 요청 시에만 표시) */}
                {needsProductCategory(newRequest.category_of_request) && (
                  <div className="rounded-lg border-2 border-[#971B2F]/20 bg-[#971B2F]/5 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-sm font-semibold text-[#101820]">
                        품목 구분 <span className="text-[#971B2F]">*</span>
                      </Label>
                      <Package className="h-4 w-4 text-[#971B2F]" />
                    </div>
                    <p className="mb-3 text-xs text-[#67767F]">
                      요청하려는 품목의 구분을 선택해주세요. 중복 선택 가능하며, 선택 후 다시 클릭하면 취소됩니다.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {PRODUCT_CATEGORIES.map((category) => {
                        const isChecked = productCategory.includes(category.value);
                        return (
                          <div
                            key={category.value}
                            className={`flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2 transition-colors ${
                              isChecked
                                ? 'border-[#971B2F] bg-[#971B2F]/10'
                                : 'border-gray-200 bg-white hover:border-[#971B2F]/40 hover:bg-[#971B2F]/5'
                            }`}
                            onClick={() => {
                              setProductCategory((prev) =>
                                prev.includes(category.value)
                                  ? prev.filter((v) => v !== category.value)
                                  : [...prev, category.value]
                              );
                            }}
                          >
                            <Checkbox
                              id={`product-category-${category.value}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                setProductCategory((prev) =>
                                  checked
                                    ? [...prev, category.value]
                                    : prev.filter((v) => v !== category.value)
                                );
                              }}
                              className="border-[#971B2F] data-[state=checked]:bg-[#971B2F] data-[state=checked]:border-[#971B2F]"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Label
                              htmlFor={`product-category-${category.value}`}
                              className="cursor-pointer text-sm font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {category.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                    {productCategory.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {productCategory.map((cat) => (
                          <span
                            key={cat}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getProductCategoryColor(cat)}`}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 품목 추가 입력 필드 */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 flex flex-col gap-1">
                    <Label htmlFor="current_erp_code" className="text-xs">
                      품목 코드 <span className="text-[#971B2F]">*</span>
                    </Label>
                    <Input
                      id="current_erp_code"
                      value={currentItem.erp_code}
                      onChange={(e) => handleERPCodeChange(e.target.value)}
                      placeholder="예: I9U800002"
                      className={cn(
                        'text-sm',
                        erpCodeError &&
                          'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500'
                      )}
                      aria-invalid={Boolean(erpCodeError)}
                      aria-describedby={erpCodeError ? 'erp-code-error-msg' : undefined}
                    />
                    {erpCodeError ? (
                      <p id="erp-code-error-msg" className="text-xs text-red-500" role="alert">
                        {erpCodeError}
                      </p>
                    ) : null}
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
                    <Label htmlFor="current_quantity" className="text-xs">수량</Label>
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
                    <SelectItem value="영업적 이슈(이벤트 등)">영업적 이슈(이벤트 등)</SelectItem>
                    <SelectItem value="재고 부족">재고 부족</SelectItem>
                    <SelectItem value="적재공간 과부족">적재공간 과부족</SelectItem>
                    <SelectItem value="품질 이슈">품질 이슈</SelectItem>
                    <SelectItem value="선적스케줄 변경">선적스케줄 변경</SelectItem>
                    <SelectItem value="선수금 미입금">선수금 미입금</SelectItem>
                    <SelectItem value="포워더 미지정">포워더 미지정</SelectItem>
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
            <Button variant="outline" onClick={() => handleAddDialogChange(false)}>
              취소
            </Button>
            <Button
              onClick={handleSubmitNewRequest}
              className="bg-[#971B2F] hover:bg-[#7A1626]"
              disabled={
                (requestType === 'existing' && Boolean(soNumberError)) ||
                (isItemListVisible && Boolean(erpCodeError))
              }
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 알림 상세 보기 다이얼로그 */}
      <Dialog open={showNotificationDetail} onOpenChange={setShowNotificationDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#101820]">요청 상세 정보</DialogTitle>
          </DialogHeader>
          {selectedNotification ? (
            <div className="space-y-6">
              {isItemAdditionCategory(selectedNotification.requests?.category_of_request) &&
                selectedNotification.requests?.confirmed_quantity !== null &&
                selectedNotification.requests?.confirmed_quantity !== undefined &&
                selectedNotification.requests.confirmed_quantity < (selectedNotification.requests.quantity || 0) && (
                  <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        {selectedNotification.requests.confirmed_quantity === 0 ? (
                          <>
                            <p className="font-semibold text-orange-900">전량 대응 불가</p>
                            <p className="mt-1 text-sm text-orange-800">
                              요청 수량: {selectedNotification.requests.quantity}개 → 확정 수량: 0개
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-orange-900">일부 수량만 가능합니다</p>
                            <p className="mt-1 text-sm text-orange-800">
                              요청 수량: {selectedNotification.requests.quantity}개 → 확정 수량:{' '}
                              {selectedNotification.requests.confirmed_quantity}개
                            </p>
                            <p className="mt-1 text-sm text-orange-700">확정 수량만큼만 PO를 추가해주시기 바랍니다.</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              <div className="flex items-center gap-3 flex-wrap">
                {selectedNotification.type === 'approved' ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-semibold text-green-600">승인됨</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-600" />
                    <span className="text-lg font-semibold text-red-600">반려됨</span>
                  </>
                )}
                {selectedNotification.requests?.product_category && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📦</span>
                    {renderProductCategoryBadges(selectedNotification.requests.product_category, 'md')}
                  </div>
                )}
                <span className="ml-auto text-sm text-[#67767F]">
                  {format(new Date(selectedNotification.created_at), 'yyyy-MM-dd HH:mm')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-[#67767F]">SO 번호</Label>
                  <p className="mt-1 text-[#101820] font-medium">
                    {selectedNotification.requests?.so_number || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-[#67767F]">요청일</Label>
                  <p className="mt-1 text-[#101820]">
                    {selectedNotification.requests?.request_date
                      ? format(new Date(selectedNotification.requests.request_date), 'yyyy-MM-dd')
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-[#67767F]">고객</Label>
                  <p className="mt-1 text-[#101820]">{selectedNotification.requests?.customer || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm text-[#67767F]">요청구분</Label>
                  <p className="mt-1 text-[#101820]">
                    {selectedNotification.requests?.category_of_request || '-'}
                  </p>
                </div>
                {selectedNotification.requests?.category_of_request &&
                  needsProductCategory(selectedNotification.requests.category_of_request) && (
                    <div>
                      <Label className="text-sm text-[#67767F]">품목구분</Label>
                      <div className="mt-1">
                        {renderProductCategoryBadges(selectedNotification.requests?.product_category, 'md') ?? (
                          <p className="text-[#B2B4B8]">-</p>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-[#67767F]">요청 수량</Label>
                  <p className="mt-1 text-[#101820] font-medium">
                    {selectedNotification.requests?.quantity?.toLocaleString() || '-'}
                  </p>
                </div>
                {isItemAdditionCategory(selectedNotification.requests?.category_of_request) &&
                  selectedNotification.requests?.confirmed_quantity !== null &&
                  selectedNotification.requests?.confirmed_quantity !== undefined && (
                    <div>
                      <Label className="text-sm text-[#67767F]">확정 수량</Label>
                      <p
                        className={cn(
                          'mt-1 font-semibold',
                          selectedNotification.requests.confirmed_quantity <
                            (selectedNotification.requests.quantity || 0)
                            ? 'text-orange-600'
                            : 'text-green-600'
                        )}
                      >
                        {selectedNotification.requests.confirmed_quantity.toLocaleString()}
                      </p>
                    </div>
                  )}
              </div>

              {selectedNotification.requests?.review_details ? (
                <div>
                  <Label className="text-sm text-[#67767F]">
                    {selectedNotification.type === 'approved' ? '승인 메모' : '반려 사유'}
                  </Label>
                  <div className="mt-2 rounded-md border bg-gray-50 p-4">
                    <p className="text-sm text-[#101820] whitespace-pre-wrap">
                      {selectedNotification.requests.review_details}
                    </p>
                  </div>
                </div>
              ) : null}

              <div>
                <Label className="text-sm text-[#67767F]">품목 정보</Label>
                <div className="mt-2 rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium">품목 코드</th>
                        <th className="px-4 py-2 text-left font-medium">품목명</th>
                        <th className="px-4 py-2 text-right font-medium">수량</th>
                        <th className="px-4 py-2 text-right font-medium">확정 수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-4 py-2 font-medium">{selectedNotification.requests?.erp_code || '-'}</td>
                        <td className="px-4 py-2">{selectedNotification.requests?.item_name || '-'}</td>
                        <td className="px-4 py-2 text-right">
                          {selectedNotification.requests?.quantity?.toLocaleString() || '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {isItemAdditionCategory(selectedNotification.requests?.category_of_request) &&
                          selectedNotification.requests?.confirmed_quantity !== null &&
                          selectedNotification.requests?.confirmed_quantity !== undefined ? (
                            <span
                              className={cn(
                                'font-semibold',
                                selectedNotification.requests.confirmed_quantity <
                                  (selectedNotification.requests.quantity || 0)
                                  ? 'text-orange-600'
                                  : 'text-green-600'
                              )}
                            >
                              {selectedNotification.requests.confirmed_quantity.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[#B2B4B8]">-</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setShowNotificationDetail(false)} variant="outline">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거절 사유 입력 다이얼로그 */}
      <AlertDialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open);
          if (!open) {
            setReviewDetails('');
            setRejectRequestId(null);
            setConfirmedQuantity(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>요청 거절 사유 입력</AlertDialogTitle>
            <AlertDialogDescription>
              거절 사유를 입력해주세요. (필수)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {(() => {
              const rejectTargetRequest = rejectRequestId
                ? requests.find((request) => request.id === rejectRequestId)
                : null;
              const isItemAdditionRequest = isItemAdditionCategory(rejectTargetRequest?.category_of_request);
              const requestedQty = rejectTargetRequest?.quantity ?? 0;

              if (!isItemAdditionRequest) return null;

              return (
                <div>
                  <Label htmlFor="confirmed-quantity-reject" className="text-[#67767F]">
                    확정 수량
                    <span className="ml-2 text-xs text-[#67767F]">
                      (재고 부족 등의 이유로 요청 수량보다 적은 수량만 가능한 경우 입력)
                    </span>
                  </Label>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex-1">
                      <Input
                        id="confirmed-quantity-reject"
                        type="number"
                        min={0}
                        max={requestedQty}
                        value={confirmedQuantity ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setConfirmedQuantity(null);
                            return;
                          }
                          const nextValue = Number(raw);
                          if (Number.isNaN(nextValue)) {
                            setConfirmedQuantity(null);
                            return;
                          }
                          setConfirmedQuantity(nextValue);
                        }}
                        placeholder={`최대 ${requestedQty}개`}
                      />
                    </div>
                    <div className="text-sm text-[#67767F]">
                      <p>
                        요청 수량:{' '}
                        <span className="font-semibold text-[#101820]">{requestedQty}</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[#67767F]">
                    * 입력하지 않으면 요청 수량 전체가 가능한 것으로 처리됩니다.
                  </p>
                </div>
              );
            })()}
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
              setConfirmedQuantity(null);
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
      <AlertDialog
        open={approveDialogOpen}
        onOpenChange={(open) => {
          setApproveDialogOpen(open);
          if (!open) {
            setReviewDetails('');
            setApproveRequestId(null);
            setConfirmedQuantity(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>요청 승인 사유 입력</AlertDialogTitle>
            <AlertDialogDescription>
              승인 사유를 입력해주세요. (필수)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {(() => {
              const approveTargetRequest = approveRequestId
                ? requests.find((request) => request.id === approveRequestId)
                : null;
              const isItemAdditionRequest = isItemAdditionCategory(approveTargetRequest?.category_of_request);
              const requestedQty = approveTargetRequest?.quantity ?? 0;

              if (!isItemAdditionRequest) return null;

              return (
                <div>
                  <Label htmlFor="confirmed-quantity-approve" className="text-[#67767F]">
                    확정 수량
                    <span className="ml-2 text-xs text-[#67767F]">
                      (재고 부족 등의 이유로 요청 수량보다 적은 수량만 가능한 경우 입력)
                    </span>
                  </Label>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex-1">
                      <Input
                        id="confirmed-quantity-approve"
                        type="number"
                        min={1}
                        max={requestedQty}
                        value={confirmedQuantity ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setConfirmedQuantity(null);
                            return;
                          }
                          const nextValue = Number(raw);
                          if (Number.isNaN(nextValue)) {
                            setConfirmedQuantity(null);
                            return;
                          }
                          setConfirmedQuantity(nextValue);
                        }}
                        placeholder={`최대 ${requestedQty}개`}
                      />
                    </div>
                    <div className="text-sm text-[#67767F]">
                      <p>
                        요청 수량:{' '}
                        <span className="font-semibold text-[#101820]">{requestedQty}</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[#67767F]">
                    * 입력하지 않으면 요청 수량 전체가 가능한 것으로 처리됩니다.
                  </p>
                </div>
              );
            })()}
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
              setConfirmedQuantity(null);
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
        <DialogContent className="w-[90vw] max-w-none max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>전체 검토 대기 내역 ({requesterPendingRequests.length}건)</DialogTitle>
            <DialogDescription>
              검토 대기 중인 모든 요청 내역입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-h-[70vh] overflow-y-auto p-1">
            {requesterPendingRequests.map((request) => {
              const daysLeft = calculateDaysLeft(request.factory_shipment_date);
              const ownRequest = isOwnRequest(request);
              return (
                <div
                  key={request.id}
                  className={cn(
                    'bg-white rounded-lg border border-[#E5E7EB] p-4 transition-shadow',
                    ownRequest ? 'opacity-70' : 'hover:shadow-md'
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-lg font-semibold text-[#101820]">
                      {request.so_number ? `SO: ${request.so_number}` : '신규'}
                    </span>
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      daysLeft <= 5 ? 'bg-red-100 text-red-700' :
                      daysLeft <= 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    )}>
                      D-{daysLeft}일
                    </span>
                  </div>
                  <p className="text-sm text-[#67767F] mb-1">{request.customer}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">{request.category_of_request}</Badge>
                    <span className="text-sm text-[#67767F]">
                      출하일: {request.factory_shipment_date ? formatDate(request.factory_shipment_date) : '-'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewDetail(request)}
                      className="flex-1 px-3 py-2 text-sm bg-[#A2B2C8] text-white rounded hover:bg-[#8A9BB1] transition-colors"
                    >
                      상세보기
                    </button>
                    {(isReviewer || isAdmin) && (
                      <>
                        <button
                          onClick={() => {
                            if (ownRequest) return;
                            setAllPendingDialogOpen(false);
                            handleApprove(request.id);
                          }}
                          className={cn(
                            'flex-1 px-3 py-2 text-sm text-white rounded transition-colors',
                            ownRequest
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-[#4A9B8E] hover:bg-[#3A7B6E]'
                          )}
                          disabled={ownRequest}
                        >
                          승인
                        </button>
                        <button
                          onClick={() => {
                            if (ownRequest) return;
                            setAllPendingDialogOpen(false);
                            handleReject(request.id);
                          }}
                          className={cn(
                            'flex-1 px-3 py-2 text-sm text-white rounded transition-colors',
                            ownRequest
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-[#971B2F] hover:bg-[#7A1626]'
                          )}
                          disabled={ownRequest}
                        >
                          반려
                        </button>
                      </>
                    )}
                  </div>
                  {ownRequest && (
                    <p className="mt-2 text-xs font-medium text-[#971B2F]">
                      본인 요청 건으로 검토할 수 없습니다.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllPendingDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 상세보기 Dialog (전체 대기 내역에서 열림) */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>요청 상세 정보</DialogTitle>
            <DialogDescription>
              검토 대기 중인 요청의 상세 정보입니다.
            </DialogDescription>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-[#67767F]">고객</p>
                  <p className="text-[#101820]">{detailRequest.customer}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">SO번호</p>
                  <p className="text-[#101820]">{detailRequest.so_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청부서</p>
                  <p className="text-[#101820]">{detailRequest.requesting_dept}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청자</p>
                  <p className="text-[#101820]">{detailRequest.requester_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">출하일</p>
                  <p className="text-[#101820]">{detailRequest.factory_shipment_date ? formatDate(detailRequest.factory_shipment_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청구분</p>
                  <p className="text-[#101820]">{detailRequest.category_of_request}</p>
                </div>
                {needsProductCategory(detailRequest.category_of_request) && (
                  <div>
                    <p className="text-sm font-medium text-[#67767F]">품목구분</p>
                    <div className="mt-1">
                      {renderProductCategoryBadges(detailRequest.product_category, 'md') ?? (
                        <p className="text-[#B2B4B8]">-</p>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-[#67767F]">품목코드</p>
                  <p className="text-[#101820]">{detailRequest.erp_code || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">품목명</p>
                  <p className="text-[#101820]">{detailRequest.item_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">수량</p>
                  <p className="text-[#101820]">{detailRequest.quantity || 0}</p>
                </div>
                {isItemAdditionCategory(detailRequest.category_of_request) &&
                  detailRequest.confirmed_quantity !== null &&
                  detailRequest.confirmed_quantity !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-[#67767F]">확정 수량</p>
                      <p
                        className={cn(
                          'font-semibold',
                          (detailRequest.confirmed_quantity || 0) < (detailRequest.quantity || 0)
                            ? 'text-orange-600'
                            : 'text-green-600'
                        )}
                      >
                        {(detailRequest.confirmed_quantity || 0).toLocaleString()}
                      </p>
                      {(detailRequest.confirmed_quantity || 0) < (detailRequest.quantity || 0) && (
                        <p className="mt-1 text-xs text-orange-600">
                          요청 수량보다 {(detailRequest.quantity || 0) - (detailRequest.confirmed_quantity || 0)}개 적습니다
                        </p>
                      )}
                    </div>
                  )}
                <div>
                  <p className="text-sm font-medium text-[#67767F]">우선순위</p>
                  <p className="text-[#101820]">{detailRequest.priority || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">요청사유</p>
                  <p className="text-[#101820]">{detailRequest.reason_for_request}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#67767F]">상태</p>
                  <Badge
                    variant="secondary"
                    className={
                      detailRequest.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                      detailRequest.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                      detailRequest.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                      'bg-gray-100 text-gray-500 border-gray-200'
                    }
                  >
                    {detailRequest.status === 'pending' ? '검토대기' : detailRequest.status === 'approved' ? '승인' : detailRequest.status === 'rejected' ? '반려' : detailRequest.status === 'in_review' ? '검토중' : detailRequest.status === 'completed' ? '완료' : '-'}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-[#67767F]">요청상세</p>
                  <p className="text-[#101820] whitespace-pre-wrap">{detailRequest.request_details || '-'}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleCloseDetail} className="bg-[#971B2F] hover:bg-[#7A1626] text-white">
              확인
            </Button>
            <Button variant="outline" onClick={handleCloseDetail}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 통계 카드 클릭 Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="w-[95vw] max-w-none max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {statsDialogType === 'total' && '전체 요청'}
              {statsDialogType === 'pending' && '검토 대기 요청'}
              {statsDialogType === 'approved' && '승인된 요청'}
              {statsDialogType === 'rejected' && '반려된 요청'}
            </DialogTitle>
            <DialogDescription>
              총 {statsDialogRequests.length}건의 요청이 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
            <AdminTable className="min-w-[1800px]">
              <AdminTableHeader className="sticky top-0 bg-white z-10">
                <AdminTableRow>
                  <AdminTableHead className="bg-white">요청일</AdminTableHead>
                  <AdminTableHead className="bg-white">SO번호</AdminTableHead>
                  <AdminTableHead className="bg-white">고객</AdminTableHead>
                  <AdminTableHead className="bg-white">요청부서</AdminTableHead>
                  <AdminTableHead className="bg-white">요청자</AdminTableHead>
                  <AdminTableHead className="bg-white">출하일</AdminTableHead>
                  <AdminTableHead className="bg-white">요청구분</AdminTableHead>
                  <AdminTableHead className="bg-white">품목코드</AdminTableHead>
                  <AdminTableHead className="bg-white">품목명</AdminTableHead>
                  <AdminTableHead className="bg-white">수량</AdminTableHead>
                  <AdminTableHead className="bg-white">확정 수량</AdminTableHead>
                  <AdminTableHead className="bg-white">요청사유</AdminTableHead>
                  <AdminTableHead className="bg-white">상태</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {statsDialogRequests.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={13} className="text-center py-8 text-[#67767F]">
                      해당하는 요청이 없습니다.
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  statsDialogRequests.map((request) => (
                    <AdminTableRow key={request.id}>
                      <AdminTableCell className="text-[#4B4F5A]">{request.request_date ? formatDate(request.request_date) : '-'}</AdminTableCell>
                      <AdminTableCell className="font-medium text-[#101820]">{request.so_number || '-'}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.customer}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.requesting_dept}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.requester_name}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.factory_shipment_date ? formatDate(request.factory_shipment_date) : '-'}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.category_of_request}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.erp_code || '-'}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.item_name || '-'}</AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.quantity || 0}</AdminTableCell>
                      <AdminTableCell className="text-right">
                        {isItemAdditionCategory(request.category_of_request) &&
                        request.confirmed_quantity !== null &&
                        request.confirmed_quantity !== undefined ? (
                          <span
                            className={cn(
                              'font-semibold',
                              request.confirmed_quantity < (request.quantity || 0) ? 'text-orange-600' : 'text-green-600'
                            )}
                          >
                            {request.confirmed_quantity.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-[#B2B4B8]">-</span>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-[#4B4F5A]">{request.reason_for_request}</AdminTableCell>
                      <AdminTableCell>
                        <Badge
                          variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'rejected' ? 'destructive' :
                            'secondary'
                          }
                          className={
                            request.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                            request.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                            request.status === 'in_review' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            request.status === 'completed' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            'bg-gray-100 text-gray-500 border-gray-200'
                          }
                        >
                          {getStatusLabel(request.status)}
                        </Badge>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatsDialog(false)}>
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
