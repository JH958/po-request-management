/**
 * 검토대기 페이지
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { RequestMenuClosed } from '@/components/common/RequestMenuClosed';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { isSalesTeam } from '@/lib/dashboard-scope';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests, usePendingRequests } from '@/hooks/use-requests';
import { ReviewGrid } from '@/components/review/ReviewGrid';
import { ReviewFormModal } from '@/components/review/ReviewFormModal';
import { RequestHistoryTable } from '@/components/request/RequestHistoryTable';
import type { PORequest } from '@/types/request';
import { PageHeader } from '@/components/common/PageHeader';

export default function ReviewPage() {
  const { user, profile, isAdmin, isReviewer } = useAuth();
  const { t } = useLanguage();
  const { requestMenuEnabled } = useRequestConfig();
  const { requests, loading: historyLoading, fetchRequests } = useRequests({
    userId: user?.id,
    department: profile?.department,
    role: profile?.role,
    filterMode: 'review-history',
  });
  const { pendingRequests, loading: pendingLoading, fetchPending } = usePendingRequests({
    userId: user?.id,
    department: profile?.department,
    role: profile?.role,
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

  // 관리자 설정에서 요청 메뉴가 꺼져 있으면 관리자 외에는 준비 중 안내
  if (user && profile && !isAdmin && !requestMenuEnabled) {
    return <RequestMenuClosed showPoChangesLink={isSalesTeam(profile.department, profile.role)} />;
  }

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('검토대기', 'Pending Review')}
        description={t('검토를 기다리는 요청을 확인하고 가능 여부를 회신하세요.', 'Review pending requests and reply with whether they are feasible.')}
      />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[#172132]">{t('검토 대기 목록', 'Awaiting Review')}</h2>
        <ReviewGrid
          items={pendingRequests}
          loading={pendingLoading}
          onCardClick={handleCardClick}
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[#172132]">{t('전체 검토 이력', 'Review History')}</h2>
        <RequestHistoryTable
          requests={requests}
          loading={historyLoading}
          title={t('전체 검토 이력', 'Review History')}
          tourPrefix="review"
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
