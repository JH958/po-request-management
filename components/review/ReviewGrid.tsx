/**
 * 검토대기 3x3 카드 그리드 + 더보기
 */
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, calculateDaysLeft } from '@/lib/dashboard-utils';
import type { PORequest } from '@/types/request';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 9;

interface ReviewGridProps {
  items: PORequest[];
  loading: boolean;
  currentUserId?: string;
  onCardClick: (request: PORequest) => void;
}

export const ReviewGrid = ({ items, loading, currentUserId, onCardClick }: ReviewGridProps) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-white py-12 text-center">
        <p className="text-[#67767F]">검토 대기 중인 요청이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((request) => {
          const daysLeft = calculateDaysLeft(request.factory_shipment_date);
          const isOwn = currentUserId ? request.requester_id === currentUserId : false;

          return (
            <button
              key={request.id}
              type="button"
              disabled={isOwn}
              onClick={() => !isOwn && onCardClick(request)}
              className={cn(
                'rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition-shadow',
                isOwn ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:shadow-md'
              )}
            >
              <div className="mb-1 flex items-start justify-between">
                <span className="text-lg font-semibold text-[#101820]">
                  {request.so_number ? `SO: ${request.so_number}` : '신규'}
                </span>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    daysLeft <= 5 ? 'bg-red-100 text-red-700' :
                    daysLeft <= 10 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  )}
                >
                  D-{daysLeft}일
                </span>
              </div>
              <p className="mb-1 text-sm text-[#67767F]">{request.customer}</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{request.category_of_request}</Badge>
                <span className="text-sm text-[#67767F]">
                  출하일: {request.factory_shipment_date ? formatDate(request.factory_shipment_date) : '-'}
                </span>
              </div>
              {isOwn && (
                <p className="mt-2 text-xs font-medium text-[#971B2F]">
                  본인 요청 건으로 검토할 수 없습니다.
                </p>
              )}
            </button>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
            더보기 ({items.length - visibleCount}건 남음)
          </Button>
        </div>
      )}
    </>
  );
};
