/**
 * 검토대기 페이지
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRequests, usePendingRequests } from '@/hooks/use-requests';
import { ReviewGrid } from '@/components/review/ReviewGrid';
import { ReviewFormModal } from '@/components/review/ReviewFormModal';
import { RequestHistoryTable } from '@/components/request/RequestHistoryTable';
import type { PORequest } from '@/types/request';

export default function ReviewPage() {
  const { user, profile, isAdmin, isRequester, isReviewer } = useAuth();
  const { requests, loading: historyLoading, fetchRequests } = useRequests({
    userId: user?.id,
    department: profile?.department,
    isAdmin,
    isRequester,
    isReviewer,
  });
  const { pendingRequests, loading: pendingLoading, fetchPending } = usePendingRequests({
    userId: user?.id,
    department: profile?.department,
    isAdmin,
  });

  const [selectedRequest, setSelectedRequest] = useState<PORequest | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const handleCardClick = (request: PORequest) => {
    setSelectedRequest(request);
    setReviewOpen(true);
  };

  const handleReviewSuccess = () => {
    void fetchRequests();
    void fetchPending();
  };

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#971B2F]" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[#101820]">검토 대기 목록</h2>
        <ReviewGrid
          items={pendingRequests}
          loading={pendingLoading}
          currentUserId={user.id}
          onCardClick={handleCardClick}
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[#101820]">전체 검토 이력</h2>
        <RequestHistoryTable
          requests={requests}
          loading={historyLoading}
          title="전체 검토 이력"
        />
      </section>

      <ReviewFormModal
        request={selectedRequest}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        userId={user.id}
        profile={{ full_name: profile.full_name, department: profile.department }}
        isReviewer={isReviewer}
        isAdmin={isAdmin}
        onSuccess={handleReviewSuccess}
      />
    </div>
  );
}
