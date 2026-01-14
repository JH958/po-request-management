/**
 * 우선순위 액션 섹션 컴포넌트
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dashboard-utils';
import { cn } from '@/lib/utils';
import type { PORequest } from '@/types/request';

interface PriorityActionsProps {
  requests: PORequest[];
  onViewDetails: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const PriorityActions = ({
  requests,
  onViewDetails,
  onApprove,
  onReject,
}: PriorityActionsProps) => {
  const getUrgencyConfig = (daysLeft: number) => {
    if (daysLeft <= 5) {
      return {
        icon: '🔴',
        label: '긴급',
        badgeClass: 'bg-[#971B2F]/10 text-[#971B2F] border-[#971B2F]/30',
      };
    }
    if (daysLeft <= 10) {
      return {
        icon: '🟡',
        label: '일반',
        badgeClass: 'bg-[#67767F]/10 text-[#67767F] border-[#67767F]/30',
      };
    }
    return {
      icon: '⚪',
      label: '보통',
      badgeClass: 'bg-[#B2B4B8]/10 text-[#B2B4B8] border-[#B2B4B8]/30',
    };
  };

  const calculateDaysLeft = (shipmentDate: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shipment = new Date(shipmentDate);
    shipment.setHours(0, 0, 0, 0);
    const diff = shipment.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-[#4B4F5A]">검토 대기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.length === 0 ? (
          <div className="text-center py-8 text-[#67767F]">처리할 요청이 없습니다.</div>
        ) : (
          requests.map((request) => {
            const daysLeft = calculateDaysLeft(request.factory_shipment_date);
            const urgencyConfig = getUrgencyConfig(daysLeft);

            return (
              <Card key={request.id} className="border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span>{urgencyConfig.icon}</span>
                    <Badge className={cn(urgencyConfig.badgeClass, 'border')}>
                      {urgencyConfig.label}
                    </Badge>
                    <span className="font-semibold text-[#101820]">{request.so_number}</span>
                    <span className="text-[#67767F]">- {request.customer}</span>
                  </div>
                  <div className="text-sm text-[#4B4F5A]">
                    요청구분: {request.category_of_request}
                  </div>
                  <div className="text-sm text-[#4B4F5A]">
                    출하일: {formatDate(request.factory_shipment_date)} ({daysLeft}일 남음)
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(request.id)}
                      className="border-[#67767F] text-[#67767F] hover:bg-[#67767F]/10"
                    >
                      상세보기
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onApprove(request.id)}
                      className="bg-[#A2B2C8] hover:bg-[#8BA0B8] text-[#101820]"
                    >
                      승인
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReject(request.id)}
                      className="border-[#971B2F] text-[#971B2F] hover:bg-[#971B2F]/10"
                    >
                      거절
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
