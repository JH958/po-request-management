/**
 * 관리자 설정 페이지
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { canAccessAdminSettings } from '@/lib/dashboard-scope';
import { FrozenDateSettings } from '@/components/admin/FrozenDateSettings';
import { RequestTypeSettings } from '@/components/admin/RequestTypeSettings';
import { RequestReasonSettings } from '@/components/admin/RequestReasonSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AdminTab = 'frozen' | 'request-types' | 'request-reasons';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>('frozen');

  const hasAccess =
    profile && canAccessAdminSettings(profile.department, profile.role);

  useEffect(() => {
    if (!loading && profile && !hasAccess) {
      router.replace('/');
    }
  }, [loading, profile, hasAccess, router]);

  if (loading || !user || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#971B2F]" />
      </div>
    );
  }

  if (!hasAccess) return null;

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'frozen', label: '프로즌 데이트 관리' },
    { id: 'request-types', label: '요청구분 리스트' },
    { id: 'request-reasons', label: '요청사유 리스트' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#101820]">관리자 설정</h1>
        <p className="mt-1 text-[#67767F]">시스템 운영 기준을 관리합니다.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'default' : 'ghost'}
            className={cn(tab === t.id && 'bg-[#971B2F] hover:bg-[#7A1626]')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'frozen' && <FrozenDateSettings userId={user.id} />}
      {tab === 'request-types' && <RequestTypeSettings userId={user.id} />}
      {tab === 'request-reasons' && <RequestReasonSettings userId={user.id} />}
    </div>
  );
}
