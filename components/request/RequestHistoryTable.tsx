/**
 * 요청 접수 내역 테이블 (공통)
 */
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, Calendar as CalendarIcon } from 'lucide-react';
import { format as formatDateRange } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import type { PORequest } from '@/types/request';
import { formatDate } from '@/lib/dashboard-utils';
import {
  getStatusLabel,
  isItemAdditionCategory,
  needsProductCategory,
} from '@/lib/request-helpers';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { ProductCategoryBadges } from '@/components/common/ProductCategoryBadges';
import { FrozenStatusBadge } from '@/components/request/FrozenStatusBadge';
import { cn } from '@/lib/utils';

interface RequestHistoryTableProps {
  requests: PORequest[];
  loading?: boolean;
  showExcelExport?: boolean;
  title?: string;
}

export const RequestHistoryTable = ({
  requests,
  loading = false,
  showExcelExport = false,
  title = '요청 접수 내역',
}: RequestHistoryTableProps) => {
  const { categoryFilterOptions } = useRequestConfig();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [sortOrder, setSortOrder] = useState('request-date-desc');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollbarRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollbarInnerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef(false);

  const customerOptions = useMemo(
    () =>
      Array.from(new Set(requests.map((r) => r.customer).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ko')
      ),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    let result = [...requests];
    const term = searchTerm.trim().toLowerCase();

    if (term) {
      result = result.filter(
        (r) =>
          (r.so_number || '').toLowerCase().includes(term) ||
          (r.customer || '').toLowerCase().includes(term) ||
          (r.item_name || '').toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') result = result.filter((r) => r.status === filterStatus);
    if (filterCategory !== 'all')
      result = result.filter((r) => r.category_of_request === filterCategory);
    if (filterCustomer !== 'all') result = result.filter((r) => r.customer === filterCustomer);

    if (dateRange?.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((r) => {
        const d = new Date(r.request_date);
        return d >= fromDate && d <= toDate;
      });
    }

    const priorityWeight: Record<string, number> = { 긴급: 3, 일반: 2, 보통: 1 };
    return result.sort((a, b) => {
      switch (sortOrder) {
        case 'request-date-asc':
          return new Date(a.request_date).getTime() - new Date(b.request_date).getTime();
        case 'shipment-date-asc':
          return new Date(a.factory_shipment_date || 0).getTime() - new Date(b.factory_shipment_date || 0).getTime();
        case 'shipment-date-desc':
          return new Date(b.factory_shipment_date || 0).getTime() - new Date(a.factory_shipment_date || 0).getTime();
        case 'priority-desc':
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return new Date(b.request_date || 0).getTime() - new Date(a.request_date || 0).getTime();
      }
    });
  }, [requests, searchTerm, filterStatus, filterCategory, filterCustomer, sortOrder, dateRange]);

  useEffect(() => {
    const sync = () => {
      if (tableScrollRef.current && bottomScrollbarInnerRef.current) {
        bottomScrollbarInnerRef.current.style.width = `${tableScrollRef.current.scrollWidth}px`;
      }
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [filteredRequests]);

  const handleTableScroll = () => {
    if (!tableScrollRef.current || !bottomScrollbarRef.current || isSyncingScrollRef.current) return;
    isSyncingScrollRef.current = true;
    bottomScrollbarRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    isSyncingScrollRef.current = false;
  };

  const handleBottomScroll = () => {
    if (!tableScrollRef.current || !bottomScrollbarRef.current || isSyncingScrollRef.current) return;
    isSyncingScrollRef.current = true;
    tableScrollRef.current.scrollLeft = bottomScrollbarRef.current.scrollLeft;
    isSyncingScrollRef.current = false;
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = filteredRequests.map((r) => ({
        요청일: r.request_date || '',
        'SO 번호': r.so_number || '',
        고객: r.customer || '',
        요청부서: r.requesting_dept || '',
        요청자: r.requester_name || '',
        출하일: r.factory_shipment_date || '',
        요청구분: r.category_of_request || '',
        품목코드: r.erp_code || '',
        품목명: r.item_name || '',
        수량: r.quantity || 0,
        요청사유: r.reason_for_request || '',
        '검토 상세': r.review_details || '-',
        '프로즌 여부': r.frozen_status === 'before' ? '프로즌 이전' : r.frozen_status === 'after' ? '프로즌 이후' : '미설정',
        상태: getStatusLabel(r.status),
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '요청 내역');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `PO변경요청_내역_${today}.xlsx`);
    } catch {
      /* toast는 상위에서 처리 가능 */
    }
  };

  return (
    <Card className="border-[#E5E7EB]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-[#101820]">{title}</CardTitle>
            <p className="mt-1 text-sm text-[#67767F]">총 {filteredRequests.length}건의 요청</p>
          </div>
          {showExcelExport && (
            <Button
              onClick={() => void handleExportExcel()}
              className="bg-[#971B2F] text-white hover:bg-[#7A1626]"
              aria-label="Excel 파일 다운로드"
            >
              <Download className="mr-2 h-4 w-4" />
              Excel 다운로드
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67767F]" />
            <Input
              placeholder="SO 번호, 고객명, 품목명으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              aria-label="요청 검색"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
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
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder="요청구분" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 구분</SelectItem>
              {categoryFilterOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="고객" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 고객</SelectItem>
              {customerOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal md:w-[240px]',
                  !dateRange && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {formatDateRange(dateRange.from, 'yyyy-MM-dd', { locale: ko })} -{' '}
                      {formatDateRange(dateRange.to, 'yyyy-MM-dd', { locale: ko })}
                    </>
                  ) : (
                    formatDateRange(dateRange.from, 'yyyy-MM-dd', { locale: ko })
                  )
                ) : (
                  <span>날짜 범위</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ko}
              />
              <div className="border-t p-3">
                <Button variant="ghost" className="w-full" onClick={() => setDateRange(undefined)}>
                  초기화
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-full md:w-[170px]">
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="request-date-desc">요청일 최신순</SelectItem>
              <SelectItem value="request-date-asc">요청일 오래된순</SelectItem>
              <SelectItem value="shipment-date-asc">출하일 빠른순</SelectItem>
              <SelectItem value="shipment-date-desc">출하일 늦은순</SelectItem>
              <SelectItem value="priority-desc">우선순위 높은순</SelectItem>
              <SelectItem value="newest">등록 최신순</SelectItem>
              <SelectItem value="oldest">등록 오래된순</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div
              ref={tableScrollRef}
              className="max-h-[500px] overflow-x-auto overflow-y-auto rounded-lg border"
              onScroll={handleTableScroll}
            >
              <Table className="min-w-[1700px]">
                <TableHeader className="sticky top-0 z-20 bg-white shadow-sm">
                  <TableRow>
                    {['요청일', 'SO 번호', '고객', '요청부서', '요청자', '출하일', '요청구분', '품목구분', '품목코드', '품목명', '수량', '확정 수량', '요청사유', '검토 상세', '프로즌 여부', '상태'].map(
                      (h) => (
                        <TableHead key={h} className="sticky top-0 z-20 bg-white">
                          {h}
                        </TableHead>
                      )
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="py-8 text-center text-[#67767F]">
                        요청 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.request_date ? formatDate(r.request_date) : '-'}</TableCell>
                        <TableCell className="font-medium">{r.so_number || '-'}</TableCell>
                        <TableCell>{r.customer}</TableCell>
                        <TableCell>{r.requesting_dept}</TableCell>
                        <TableCell>{r.requester_name}</TableCell>
                        <TableCell>{r.factory_shipment_date ? formatDate(r.factory_shipment_date) : '-'}</TableCell>
                        <TableCell>{r.category_of_request}</TableCell>
                        <TableCell>
                          {needsProductCategory(r.category_of_request) && r.product_category ? (
                            <ProductCategoryBadges category={r.product_category} />
                          ) : (
                            <span className="text-[#B2B4B8]">-</span>
                          )}
                        </TableCell>
                        <TableCell>{r.erp_code || '-'}</TableCell>
                        <TableCell>{r.item_name || '-'}</TableCell>
                        <TableCell>{r.quantity || 0}</TableCell>
                        <TableCell className="text-right">
                          {isItemAdditionCategory(r.category_of_request) &&
                          r.confirmed_quantity != null ? (
                            <span
                              className={cn(
                                'font-semibold',
                                r.confirmed_quantity < (r.quantity || 0) ? 'text-orange-600' : 'text-green-600'
                              )}
                            >
                              {r.confirmed_quantity.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[#B2B4B8]">-</span>
                          )}
                        </TableCell>
                        <TableCell>{r.reason_for_request}</TableCell>
                        <TableCell className="max-w-xs truncate" title={r.review_details || '-'}>
                          {r.review_details || '-'}
                        </TableCell>
                        <TableCell>
                          <FrozenStatusBadge status={r.frozen_status} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              r.status === 'approved' && 'bg-green-100 text-green-700',
                              r.status === 'rejected' && 'bg-red-100 text-red-700',
                              r.status === 'pending' && 'bg-yellow-100 text-yellow-700'
                            )}
                          >
                            {getStatusLabel(r.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div
              ref={bottomScrollbarRef}
              className="mt-2 h-4 overflow-x-auto overflow-y-hidden rounded border bg-white"
              onScroll={handleBottomScroll}
              aria-label="요청 내역 하단 가로 스크롤바"
            >
              <div ref={bottomScrollbarInnerRef} className="h-px" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
