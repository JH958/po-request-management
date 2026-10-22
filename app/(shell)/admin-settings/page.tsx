/**
 * 관리자 설정 페이지
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/context/LanguageContext';
import { canAccessAdminSettings } from '@/lib/dashboard-scope';
import { FrozenDateSettings } from '@/components/admin/FrozenDateSettings';
import { RequestReasonSettings } from '@/components/admin/RequestReasonSettings';
import { PoChangeTypeSettings } from '@/components/admin/PoChangeTypeSettings';
import { ItemClassOverrideSettings } from '@/components/admin/ItemClassOverrideSettings';
import { CustomerManagerSettings } from '@/components/admin/CustomerManagerSettings';
import { RequestOriginSettings } from '@/components/admin/RequestOriginSettings';
import { CustomerAccountSettings } from '@/components/admin/CustomerAccountSettings';
import { ViewGrantSettings } from '@/components/admin/ViewGrantSettings';
import { DestinationSettings } from '@/components/admin/DestinationSettings';
import { MatchSettings } from '@/components/admin/MatchSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';

type AdminTab =
  | 'frozen'
  | 'po-change-types'
  | 'request-reasons'
  | 'request-origins'
  | 'customer-accounts'
  | 'view-grants'
  | 'item-class'
  | 'customer-managers'
  | 'destinations'
  | 'matching';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { t } = useLanguage();
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
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
      </div>
    );
  }

  if (!hasAccess) return null;

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'frozen', label: t('프로즌 데이트 관리', 'Frozen Date') },
    { id: 'po-change-types', label: t('PO 변경 유형', 'PO Change Types') },
    { id: 'request-reasons', label: t('PO 변경 사유', 'PO Change Reasons') },
    { id: 'request-origins', label: t('요청 부서', 'Requesting Departments') },
    { id: 'customer-accounts', label: t('고객처 계정', 'Customer Accounts') },
    { id: 'view-grants', label: t('조회 권한', 'View Access') },
    { id: 'item-class', label: t('품목 구분 예외', 'Item Category Exceptions') },
    { id: 'customer-managers', label: t('고객처 담당자', 'Customer Owners') },
    { id: 'destinations', label: t('경유 고객처·도착지', 'Via Customers & Destinations') },
    { id: 'matching', label: t('요청 연결 기준', 'Request Matching') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('관리자 설정', 'Admin Settings')} description={t('시스템 운영 기준을 관리합니다.', 'Manage the rules the system runs on.')} />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <Button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            variant="outline"
            className={cn(
              'h-10 rounded-xl border-[#D6DDE7] bg-white px-5 font-semibold text-[#5A6778] shadow-none hover:bg-[#F8FAFC] hover:text-[#253143]',
              tab === t.id && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white'
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'frozen' && <FrozenDateSettings userId={user.id} />}
      {tab === 'po-change-types' && <PoChangeTypeSettings userId={user.id} />}
      {tab === 'request-reasons' && <RequestReasonSettings userId={user.id} />}
      {tab === 'request-origins' && <RequestOriginSettings userId={user.id} />}
      {tab === 'customer-accounts' && <CustomerAccountSettings userId={user.id} />}
      {tab === 'view-grants' && <ViewGrantSettings />}
      {tab === 'item-class' && <ItemClassOverrideSettings userId={user.id} />}
      {tab === 'customer-managers' && <CustomerManagerSettings userId={user.id} />}
      {tab === 'destinations' && <DestinationSettings userId={user.id} />}
      {tab === 'matching' && <MatchSettings userId={user.id} />}
    </div>
  );
}
