/**
 * PO 현황 페이지 (로그인 후 기본 홈) — 영업관리팀·관리자만, 그 밖의 계정은 요청접수로
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isSalesTeamProfile } from '@/lib/dashboard-scope';
import { PoDashboard } from '@/components/dashboard/PoDashboard';

export default function HomePage() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const hasAccess = Boolean(profile && isSalesTeamProfile(profile));

  useEffect(() => {
    if (!loading && profile && !hasAccess) {
      router.replace('/request');
    }
  }, [loading, profile, hasAccess, router]);

  if (loading || !profile || !hasAccess) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#8B1538]" />
      </div>
    );
  }

  return <PoDashboard />;
}
