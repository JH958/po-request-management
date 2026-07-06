/**
 * 요청접수 페이지
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRequests } from '@/hooks/use-requests';
import { RequestTypeGrid } from '@/components/request/RequestTypeGrid';
import { RequestFormModal } from '@/components/request/RequestFormModal';
import { RequestHistoryTable } from '@/components/request/RequestHistoryTable';
import type { RequestTypeCard } from '@/lib/request-constants';

export default function RequestPage() {
  const { user, profile, isAdmin } = useAuth();
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
        <h1 className="mb-2 text-2xl font-bold text-[#101820]">요청접수</h1>
        <p className="mb-6 text-[#67767F]">요청구분을 선택하여 PO 변경 요청을 접수하세요.</p>
        <RequestTypeGrid onSelect={handleSelectType} />
      </section>

      <section>
        <RequestHistoryTable requests={requests} loading={loading} title="요청 접수 내역" tourPrefix="request" />
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
