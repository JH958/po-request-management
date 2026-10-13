/**
 * 우선순위 액션 섹션 컴포넌트
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dashboard-utils';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
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
  const { t } = useLanguage();

  const getUrgencyConfig = (daysLeft: number) => {
    if (daysLeft <= 5) {
      return {
        icon: '🔴',
        label: t('긴급', 'Urgent'),
        badgeClass: 'bg-[#8B1538]/10 text-[#8B1538] border-[#8B1538]/30',
      };
    }
    if (daysLeft <= 10) {
      return {
        icon: '🟡',
        label: t('일반', 'Normal'),
        badgeClass: 'bg-[#5A6778]/10 text-[#5A6778] border-[#5A6778]/30',
      };
    }
    return {
      icon: '⚪',
      label: t('보통', 'Low'),
      badgeClass: 'bg-[#8E98A8]/10 text-[#8E98A8] border-[#8E98A8]/30',
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
        <CardTitle className="text-xl font-semibold text-[#253143]">{t('검토 대기', 'Pending Review')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.length === 0 ? (
          <div className="text-center py-8 text-[#5A6778]">{t('처리할 요청이 없습니다.', 'Nothing to process.')}</div>
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
                    <span className="font-semibold text-[#172132]">{request.so_number}</span>
                    <span className="text-[#5A6778]">- {request.customer}</span>
                  </div>
                  <div className="text-sm text-[#253143]">
                    {t('요청구분', 'Request type')}: {request.category_of_request}
                  </div>
                  <div className="text-sm text-[#253143]">
                    {t('출하일', 'Ship date')}: {formatDate(request.factory_shipment_date)} (
                    {t(`${daysLeft}일 남음`, `${daysLeft} days left`)})
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(request.id)}
                      className="border-[#5A6778] text-[#5A6778] hover:bg-[#5A6778]/10"
                    >
                      {t('상세보기', 'Details')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onApprove(request.id)}
                      className="bg-[#A2B2C8] hover:bg-[#8BA0B8] text-[#172132]"
                    >
                      {t('승인', 'Approve')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReject(request.id)}
                      className="border-[#8B1538] text-[#8B1538] hover:bg-[#8B1538]/10"
                    >
                      {t('거절', 'Reject')}
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
