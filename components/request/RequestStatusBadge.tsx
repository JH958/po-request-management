/**
 * 요청 상태를 표시하는 Badge 컴포넌트
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getStatusBadgeClasses, getStatusLabel } from '@/lib/request-utils';
import type { RequestStatus } from '@/types/request';
import { useLanguage } from '@/context/LanguageContext';

interface RequestStatusBadgeProps {
  status: RequestStatus;
  className?: string;
}

export const RequestStatusBadge = ({ status, className }: RequestStatusBadgeProps) => {
  const { t } = useLanguage();
  const label = getStatusLabel(status, t);
  const badgeClasses = getStatusBadgeClasses(status);

  return (
    <Badge
      className={cn(badgeClasses, 'px-2 py-1 text-xs font-medium', className)}
      variant="outline"
    >
      {label}
    </Badge>
  );
};
