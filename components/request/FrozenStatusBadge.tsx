/**
 * 프로즌 여부 배지 컴포넌트
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { getFrozenStatusLabels } from '@/lib/frozen-date-labels';
import { useLanguage } from '@/context/LanguageContext';
import type { FrozenStatus } from '@/types/frozen-date';
import { cn } from '@/lib/utils';

interface FrozenStatusBadgeProps {
  status?: FrozenStatus | null;
  className?: string;
}

export const FrozenStatusBadge = ({ status = 'unset', className }: FrozenStatusBadgeProps) => {
  const { t } = useLanguage();
  const value: FrozenStatus = status ?? 'unset';

  return (
    <Badge
      className={cn(
        value === 'before' && 'bg-gray-100 text-gray-700',
        value === 'after' && 'bg-red-100 text-red-700',
        value === 'unset' && 'bg-slate-50 text-slate-500',
        className
      )}
    >
      {getFrozenStatusLabels(t)[value]}
    </Badge>
  );
};
