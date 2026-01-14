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
import type { PORequest } from '@/types/request';

interface RecentRequestsTableProps {
  requests: PORequest[];
  onViewDetails: (id: string) => void;
}

export const RecentRequestsTable = ({ requests, onViewDetails }: RecentRequestsTableProps) => {
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
        <CardTitle className="text-xl font-semibold text-[#4B4F5A]">최근 요청</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">요청일</TableHead>
              <TableHead className="w-[120px]">SO 번호</TableHead>
              <TableHead className="w-[150px]">고객</TableHead>
              <TableHead className="w-[120px]">요청구분</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead className="w-[80px] text-right">수량</TableHead>
              <TableHead className="w-[100px]">상태</TableHead>
              <TableHead className="w-[100px]">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-[#67767F]">
                  요청 데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow
                  key={request.id}
                  className="cursor-pointer hover:bg-[#B2B4B8]/10"
                  onClick={() => handleRowClick(request.id)}
                >
                  <TableCell className="text-[#4B4F5A]">
                    {formatDate(request.request_date)}
                  </TableCell>
                  <TableCell className="font-medium text-[#101820]">{request.so_number}</TableCell>
                  <TableCell className="text-[#4B4F5A]">{request.customer}</TableCell>
                  <TableCell className="text-[#4B4F5A]">{request.category_of_request}</TableCell>
                  <TableCell className="text-[#4B4F5A]">{request.item_name}</TableCell>
                  <TableCell className="text-right text-[#4B4F5A]">
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
                      className="text-[#971B2F] hover:bg-[#971B2F]/10"
                    >
                      상세보기
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
          className="w-full text-[#971B2F] hover:bg-[#971B2F]/10"
          onClick={() => onViewDetails('all')}
        >
          전체 요청 보기
        </Button>
      </CardFooter>
    </Card>
  );
};
