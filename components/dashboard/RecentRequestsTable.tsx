/**
 * 최근 요청 테이블 컴포넌트
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RequestStatusBadge } from '@/components/request/RequestStatusBadge';
import { formatDate } from '@/lib/dashboard-utils';
import { useLanguage } from '@/context/LanguageContext';
import type { PORequest } from '@/types/request';

interface RecentRequestsTableProps {
  requests: PORequest[];
  onViewDetails: (id: string) => void;
}

export const RecentRequestsTable = ({ requests, onViewDetails }: RecentRequestsTableProps) => {
  const { t } = useLanguage();
  const handleRowClick = (requestId: string) => {
    onViewDetails(requestId);
  };

  const handleViewDetails = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    onViewDetails(requestId);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-[#253143]">{t('최근 요청', 'Recent Requests')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">{t('요청일', 'Requested')}</TableHead>
              <TableHead className="w-[120px]">{t('SO 번호', 'SO No.')}</TableHead>
              <TableHead className="w-[150px]">{t('고객', 'Customer')}</TableHead>
              <TableHead className="w-[120px]">{t('요청구분', 'Request type')}</TableHead>
              <TableHead>{t('품목명', 'Item')}</TableHead>
              <TableHead className="w-[80px] text-right">{t('수량', 'Qty')}</TableHead>
              <TableHead className="w-[100px]">{t('상태', 'Status')}</TableHead>
              <TableHead className="w-[100px]">{t('액션', 'Action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-[#5A6778]">
                  {t('요청 데이터가 없습니다.', 'No requests.')}
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow
                  key={request.id}
                  className="cursor-pointer hover:bg-[#8E98A8]/10"
                  onClick={() => handleRowClick(request.id)}
                >
                  <TableCell className="text-[#253143]">
                    {formatDate(request.request_date)}
                  </TableCell>
                  <TableCell className="font-medium text-[#172132]">{request.so_number}</TableCell>
                  <TableCell className="text-[#253143]">{request.customer}</TableCell>
                  <TableCell className="text-[#253143]">{request.category_of_request}</TableCell>
                  <TableCell className="text-[#253143]">{request.item_name}</TableCell>
                  <TableCell className="text-right text-[#253143]">
                    {request.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <RequestStatusBadge status={request.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleViewDetails(e, request.id)}
                      className="text-[#8B1538] hover:bg-[#8B1538]/10"
                    >
                      {t('상세보기', 'Details')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <Button
          variant="ghost"
          className="w-full text-[#8B1538] hover:bg-[#8B1538]/10"
          onClick={() => onViewDetails('all')}
        >
          {t('전체 요청 보기', 'View all requests')}
        </Button>
      </CardFooter>
    </Card>
  );
};
