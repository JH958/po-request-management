/**
 * 데이터 업로드 페이지 (판매주문조회·DO등록현황조회, 관리자 전용)
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/context/LanguageContext';
import { usePoUploads } from '@/hooks/use-po-uploads';
import { canAccessAdminSettings } from '@/lib/dashboard-scope';
import { Button } from '@/components/ui/button';
import { PoUploadPanel } from '@/components/po-upload/PoUploadPanel';
import { UploadHistoryTable } from '@/components/po-upload/UploadHistoryTable';
import { PageHeader } from '@/components/common/PageHeader';

export default function PoUploadPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { t } = useLanguage();
  const { uploads, latestDates, loading: uploadsLoading, error, refresh } = usePoUploads();

  const hasAccess = profile && canAccessAdminSettings(profile.department, profile.role);

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

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('데이터 업로드', 'Data Upload')}
        description={t(
          '영업일마다 판매주문조회와 DO등록현황조회 파일을 올리면 직전 파일과 비교해 PO 변경을 찾아냅니다.',
          'Upload the sales order and delivery order (DO) reports every business day to detect PO changes against the previous files.'
        )}
      />

      <PoUploadPanel latestDates={latestDates} onProcessed={refresh} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#172132]">{t('업로드 이력', 'Upload History')}</h2>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={uploadsLoading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${uploadsLoading ? 'animate-spin' : ''}`} />
            {t('새로고침', 'Refresh')}
          </Button>
        </div>
        <UploadHistoryTable uploads={uploads} loading={uploadsLoading} error={error} />
      </section>
    </div>
  );
}
