/**
 * 요청접수 페이지
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { RequestMenuClosed } from '@/components/common/RequestMenuClosed';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { isSalesTeam } from '@/lib/dashboard-scope';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/hooks/use-requests';
import { RequestTypeGrid } from '@/components/request/RequestTypeGrid';
import { RequestFormModal } from '@/components/request/RequestFormModal';
import { RequestHistoryTable } from '@/components/request/RequestHistoryTable';
import type { RequestTypeCard } from '@/lib/request-constants';
import { PageHeader } from '@/components/common/PageHeader';

export default function RequestPage() {
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { requestMenuEnabled } = useRequestConfig();
  const { requests, loading, fetchRequests } = useRequests({
    userId: user?.id,
    department: profile?.department,
    filterMode: 'request-intake',
  });

  const [selectedType, setSelectedType] = useState<RequestTypeCard | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleSelectType = (type: RequestTypeCard) => {
    setSelectedType(type);
    setFormOpen(true);
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
        title={t('요청접수', 'Submit Request')}
        description={t('요청구분을 선택하여 PO 변경 요청을 접수하세요.', 'Choose a request type to submit a PO change request.')}
      />

      <section>
        <RequestTypeGrid onSelect={handleSelectType} />
      </section>

      <section>
        <RequestHistoryTable requests={requests} loading={loading} title={t('요청 접수 내역', 'Submitted Requests')} tourPrefix="request" />
      </section>

      <RequestFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        requestType={selectedType}
        userId={user.id}
        profile={{
          id: profile.id,
          full_name: profile.full_name,
          department: profile.department,
          role: profile.role,
        }}
        isAdmin={isAdmin}
        onSuccess={() => void fetchRequests()}
      />
    </div>
  );
}
