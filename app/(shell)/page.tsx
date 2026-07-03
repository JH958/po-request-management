/**
 * PO 현황 페이지 (로그인 후 기본 홈)
 */
'use client';

import { useAuth } from '@/hooks/use-auth';
import { getDashboardScope, isAdminDashboard } from '@/lib/dashboard-scope';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { UserDashboard } from '@/components/dashboard/UserDashboard';

export default function HomePage() {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#971B2F]" />
      </div>
    );
  }

  const scope = getDashboardScope(profile.department ?? '', profile.role ?? '');

  if (scope.scope === 'all' || isAdminDashboard(scope)) {
    return <AdminDashboard department={profile.department} role={profile.role} />;
  }

  return <UserDashboard department={scope.department} />;
}
