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
import type { DateRange } from 'react-day-picker';
import type { PORequest } from '@/types/request';
import { formatDate } from '@/lib/dashboard-utils';
import {
  getStatusLabel,
  isItemAdditionCategory,
} from '@/lib/request-helpers';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { FrozenStatusBadge } from '@/components/request/FrozenStatusBadge';
import { DoReflectionBadge, getDoReflectionText } from '@/components/request/DoReflectionBadge';
import { useRequestReflections } from '@/hooks/use-request-reflections';
import { cn } from '@/lib/utils';
import { getDateLocale } from '@/lib/i18n';
import { useLanguage } from '@/context/LanguageContext';

interface RequestHistoryTableProps {
  requests: PORequest[];
  loading?: boolean;
  showExcelExport?: boolean;
  title?: string;
  /** Product Tour data-tour 접두사 (request | review) */
  tourPrefix?: 'request' | 'review';
}

export const RequestHistoryTable = ({
  requests,
  loading = false,
  showExcelExport = false,
  title,
  tourPrefix,
}: RequestHistoryTableProps) => {
  const { categoryFilterOptions } = useRequestConfig();
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [sortOrder, setSortOrder] = useState('request-date-desc');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // 요청별 DO 반영 상태 (3단계 요청 ↔ DO 변경 연결)
  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const reflections = useRequestReflections(requestIds);

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
        [t('요청일', 'Request date')]: r.request_date || '',
        [t('SO 번호', 'SO No.')]: r.so_number || '',
        [t('고객', 'Customer')]: r.customer || '',
        [t('요청부서', 'Requesting dept')]: r.requesting_dept || '',
        [t('요청자', 'Requester')]: r.requester_name || '',
        [t('출하일', 'Ship date')]: r.factory_shipment_date || '',
        [t('요청구분', 'Request type')]: r.category_of_request || '',
        [t('품목코드', 'Item code')]: r.erp_code || '',
        [t('품목명', 'Item name')]: r.item_name || '',
        [t('수량', 'Qty')]: r.quantity || 0,
        [t('요청사유', 'Request reason')]: r.reason_for_request || '',
        [t('검토 상세', 'Review details')]: r.review_details || '-',
        [t('프로즌 여부', 'Frozen')]:
          r.frozen_status === 'before'
            ? t('프로즌 이전', 'Before frozen')
            : r.frozen_status === 'after'
              ? t('프로즌 이후', 'After frozen')
              : t('미설정', 'Not set'),
        [t('상태', 'Status')]: getStatusLabel(r.status, t),
        [t('DO 반영', 'DO reflected')]: getDoReflectionText(r, reflections.get(r.id), t),
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, t('요청 내역', 'Requests'));
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, t(`PO변경요청_내역_${today}.xlsx`, `PO_change_requests_${today}.xlsx`));
    } catch {
      /* toast는 상위에서 처리 가능 */
    }
  };

  return (
    <Card className="border-[#DEE4EC]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-[#172132]">{title ?? t('요청 접수 내역', 'Submitted Requests')}</CardTitle>
            <p className="mt-1 text-sm text-[#5A6778]">
              {t(`총 ${filteredRequests.length}건의 요청`, `${filteredRequests.length} requests`)}
            </p>
          </div>
          {showExcelExport && (
            <Button
              onClick={() => void handleExportExcel()}
              className="bg-[#8B1538] text-white hover:bg-[#74112F]"
              aria-label={t('Excel 파일 다운로드', 'Download Excel file')}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('Excel 다운로드', 'Download Excel')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1" data-tour={tourPrefix ? `${tourPrefix}-history-search` : undefined}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
            <Input
              placeholder={t('SO 번호, 고객명, 품목명으로 검색...', 'Search by SO number, customer or item...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              aria-label={t('요청 검색', 'Search requests')}
            />
          </div>
          <div
            className="flex flex-col gap-3 md:flex-row md:flex-wrap"
            data-tour={tourPrefix ? `${tourPrefix}-history-filters` : undefined}
          >
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full md:w-[140px]">
              <SelectValue placeholder={t('상태', 'Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 상태', 'All statuses')}</SelectItem>
              <SelectItem value="pending">{t('검토대기', 'Pending')}</SelectItem>
              <SelectItem value="approved">{t('승인', 'Approved')}</SelectItem>
              <SelectItem value="rejected">{t('반려', 'Rejected')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder={t('요청구분', 'Request type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 구분', 'All types')}</SelectItem>
              {categoryFilterOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder={t('고객', 'Customer')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('전체 고객', 'All customers')}</SelectItem>
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
                      {formatDateRange(dateRange.from, 'yyyy-MM-dd', { locale: dateLocale })} -{' '}
                      {formatDateRange(dateRange.to, 'yyyy-MM-dd', { locale: dateLocale })}
                    </>
                  ) : (
                    formatDateRange(dateRange.from, 'yyyy-MM-dd', { locale: dateLocale })
                  )
                ) : (
                  <span>{t('날짜 범위', 'Date range')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={dateLocale}
              />
              <div className="border-t p-3">
                <Button variant="ghost" className="w-full" onClick={() => setDateRange(undefined)}>
                  {t('초기화', 'Reset')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          </div>
          <div data-tour={tourPrefix ? `${tourPrefix}-history-sort` : undefined}>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-full md:w-[170px]">
              <SelectValue placeholder={t('정렬', 'Sort')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="request-date-desc">{t('요청일 최신순', 'Request date (newest)')}</SelectItem>
              <SelectItem value="request-date-asc">{t('요청일 오래된순', 'Request date (oldest)')}</SelectItem>
              <SelectItem value="shipment-date-asc">{t('출하일 빠른순', 'Ship date (earliest)')}</SelectItem>
              <SelectItem value="shipment-date-desc">{t('출하일 늦은순', 'Ship date (latest)')}</SelectItem>
              <SelectItem value="priority-desc">{t('우선순위 높은순', 'Priority (highest)')}</SelectItem>
              <SelectItem value="newest">{t('등록 최신순', 'Created (newest)')}</SelectItem>
              <SelectItem value="oldest">{t('등록 오래된순', 'Created (oldest)')}</SelectItem>
            </SelectContent>
          </Select>
          </div>
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
              <Table className="min-w-[1820px]">
                <TableHeader
                  className="sticky top-0 z-20 bg-white shadow-sm"
                  data-tour={tourPrefix ? `${tourPrefix}-history-table-header` : undefined}
                >
                  <TableRow>
                    {[
                      t('요청일', 'Request date'),
                      t('SO 번호', 'SO No.'),
                      t('고객', 'Customer'),
                      t('요청부서', 'Requesting dept'),
                      t('요청자', 'Requester'),
                      t('출하일', 'Ship date'),
                      t('요청구분', 'Request type'),
                      t('품목코드', 'Item code'),
                      t('품목명', 'Item name'),
                      t('수량', 'Qty'),
                      t('확정 수량', 'Confirmed qty'),
                      t('요청사유', 'Request reason'),
                      t('검토 상세', 'Review details'),
                      t('프로즌 여부', 'Frozen'),
                      t('상태', 'Status'),
                      t('DO 반영', 'DO reflected'),
                    ].map(
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
                      <TableCell colSpan={16} className="py-8 text-center text-[#5A6778]">
                        {t('요청 데이터가 없습니다.', 'No requests.')}
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
                            <span className="text-[#8E98A8]">-</span>
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
                            {getStatusLabel(r.status, t)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DoReflectionBadge request={r} reflection={reflections.get(r.id)} />
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
              aria-label={t('요청 내역 하단 가로 스크롤바', 'Horizontal scrollbar for the request list')}
            >
              <div ref={bottomScrollbarInnerRef} className="h-px" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
