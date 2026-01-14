/**
 * 요청 정보를 카드 형태로 표시하는 컴포넌트
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RequestStatusBadge } from './RequestStatusBadge';
import { formatDate, calculateDaysLeft, getUrgencyConfig, getUrgencyLevel } from '@/lib/request-utils';
import { cn } from '@/lib/utils';
import type { PORequest } from '@/types/request';
import { useRouter } from 'next/navigation';

interface RequestCardProps {
  request: PORequest;
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export const RequestCard = ({ request, showActions = false, onApprove, onReject }: RequestCardProps) => {
  const router = useRouter();
  const daysLeft = calculateDaysLeft(request.factory_shipment_date);
  const urgencyLevel = getUrgencyLevel(daysLeft);
  const urgencyConfig = getUrgencyConfig(urgencyLevel);

  const handleViewDetails = () => {
    router.push(`/requests/${request.id}`);
  };

  const handleApprove = () => {
    if (onApprove) {
      onApprove(request.id);
    } else {
      console.log('Approve request:', request.id);
    }
  };

  const handleReject = () => {
    if (onReject) {
      onReject(request.id);
    } else {
      console.log('Reject request:', request.id);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-[#101820] mb-2">
              <span className={urgencyConfig.color}>{urgencyConfig.icon}</span>
              <span className="ml-2">{request.so_number}</span>
              <span className="ml-2 text-[#67767F] font-normal">- {request.customer}</span>
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <RequestStatusBadge status={request.status} />
              <Badge className={cn(urgencyConfig.bgColor, urgencyConfig.color, 'border-0')}>
                {urgencyConfig.label}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-[#4B4F5A]">
          <div>
            <span className="font-medium">요청구분:</span> {request.category_of_request}
          </div>
          <div>
            <span className="font-medium">출하일:</span> {formatDate(request.factory_shipment_date)} ({daysLeft}일 남음)
          </div>
          <div>
            <span className="font-medium">품목명:</span> {request.item_name}
          </div>
          <div>
            <span className="font-medium">수량:</span> {request.quantity.toLocaleString()}
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewDetails}
              className="flex-1 border-[#67767F] text-[#67767F] hover:bg-[#67767F]/10"
            >
              상세보기
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              className="flex-1 bg-[#A2B2C8] hover:bg-[#8BA0B8] text-[#101820]"
            >
              승인
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              className="flex-1 border-[#971B2F] text-[#971B2F] hover:bg-[#971B2F]/10"
            >
              거절
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
