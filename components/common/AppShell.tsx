/**
 * 인증된 페이지 공통 레이아웃 셸 (사이드바 + 헤더 + 알림)
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/context/LanguageContext';
import { useNotifications } from '@/hooks/use-notifications';
import { Header, HEADER_ICON_BUTTON_CLASS } from '@/components/common/Header';
import { Sidebar } from '@/components/common/Sidebar';
import { TourLauncher } from '@/components/tour/TourLauncher';
import { TourHost } from '@/components/tour/TourHost';
import { EXTERNAL_LINKS } from '@/lib/request-constants';
import { canAccessAdminSettings, getDashboardScope, isSalesTeam } from '@/lib/dashboard-scope';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ProductCategoryBadges } from '@/components/common/ProductCategoryBadges';
import { Bell, CheckCircle2, XCircle, Database, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequestConfigProvider } from '@/context/RequestConfigContext';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { t, lang } = useLanguage();
  const [tourLauncherOpen, setTourLauncherOpen] = useState(false);
  const [tourAfterComplete, setTourAfterComplete] = useState(false);

  const showProductTour = useMemo(() => {
    if (!profile) return false;
    return getDashboardScope(profile.department, profile.role).scope === 'own';
  }, [profile]);

  const {
    notifications,
    unreadCount,
    showNotifications,
    setShowNotifications,
    showNotificationDetail,
    setShowNotificationDetail,
    selectedNotification,
    handleMarkAllAsRead,
    handleNotificationClick,
    formatNotificationTime,
  } = useNotifications(user?.id, lang);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openTourLauncher = () => {
    setTourAfterComplete(false);
    setTourLauncherOpen(true);
  };

  const handleTourComplete = useCallback(() => {
    setTourAfterComplete(true);
    setTourLauncherOpen(true);
  }, []);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F4F8]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#8B1538]" />
          <p className="mt-4 text-[#5A6778]">{t('로딩 중...', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  return (
    <RequestConfigProvider>
    <div className="flex h-screen flex-col bg-[#F1F4F8]">
      <Header
        onOpenTour={showProductTour ? openTourLauncher : undefined}
        toolbarStart={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className={HEADER_ICON_BUTTON_CLASS}
                  onClick={() => handleExternalLink(EXTERNAL_LINKS.D365)}
                  aria-label={t('D365 ERP 시스템을 새 탭에서 열기', 'Open D365 ERP in a new tab')}
                >
                  <Database className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>D365</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className={HEADER_ICON_BUTTON_CLASS}
                  onClick={() => handleExternalLink(EXTERNAL_LINKS.GM)}
                  aria-label={t('GM 해외 발주 사이트를 새 탭에서 열기', 'Open the GM overseas ordering site in a new tab')}
                >
                  <Globe className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>GM</TooltipContent>
            </Tooltip>
          </>
        }
        toolbarEnd={
          <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={HEADER_ICON_BUTTON_CLASS}
                aria-label={t('알림 열기', 'Open notifications')}
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
                {unreadCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#8B1538] px-1 text-[10px] font-semibold leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="flex items-center justify-between border-b p-4">
                <h3 className="text-lg font-semibold text-[#172132]">{t('알림', 'Notifications')}</h3>
                {unreadCount > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleMarkAllAsRead()}
                    className="text-xs text-[#5A6778] hover:text-[#172132]"
                  >
                    {t('모두 읽음', 'Mark all as read')}
                  </Button>
                ) : null}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5A6778]">{t('알림이 없습니다.', 'No notifications.')}</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={cn(
                        'w-full cursor-pointer border-b p-4 text-left transition-colors hover:bg-gray-50',
                        !notification.is_read && 'bg-blue-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-1 flex h-8 w-8 items-center justify-center rounded-full',
                            notification.type === 'approved'
                              ? 'bg-green-100'
                              : notification.type === 'new_request'
                                ? 'bg-blue-100'
                                : 'bg-red-100'
                          )}
                        >
                          {notification.type === 'approved' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : notification.type === 'new_request' ? (
                            <Bell className="h-4 w-4 text-blue-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p
                              className={cn(
                                'text-sm font-medium',
                                !notification.is_read ? 'text-[#172132]' : 'text-[#5A6778]'
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.is_read ? (
                              <span className="h-2 w-2 rounded-full bg-[#8B1538]" />
                            ) : null}
                          </div>
                          {notification.requests?.product_category && (
                            <ProductCategoryBadges category={notification.requests.product_category} />
                          )}
                          <p className="text-xs text-[#5A6778]">
                            {t('SO 번호', 'SO No.')}: {notification.requests?.so_number || '-'}
                          </p>
                          <p className="text-xs text-[#5A6778]">
                            {formatNotificationTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          userName={profile?.full_name || user.email?.split('@')[0] || t('사용자', 'User')}
          department={profile?.department}
          onOpenTour={showProductTour ? openTourLauncher : undefined}
          showAdminSettings={
            profile ? canAccessAdminSettings(profile.department, profile.role) : false
          }
          showSalesTeamMenus={profile ? isSalesTeam(profile.department, profile.role) : false}
        />
        <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>

      {showProductTour && (
        <>
          <TourLauncher
            open={tourLauncherOpen}
            onOpenChange={setTourLauncherOpen}
            afterTour={tourAfterComplete}
          />
          <TourHost onTourComplete={handleTourComplete} />
        </>
      )}

      <Dialog open={showNotificationDetail} onOpenChange={setShowNotificationDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedNotification?.title ?? t('알림 상세', 'Notification details')}</DialogTitle>
            <DialogDescription className="sr-only">{t('알림 상세 내용을 확인합니다.', 'View notification details.')}</DialogDescription>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-3 text-sm">
              <p className="text-[#5A6778]">{selectedNotification.message}</p>
              {selectedNotification.requests && (
                <div className="space-y-1 rounded-lg border p-3">
                  <p>SO: {selectedNotification.requests.so_number || '-'}</p>
                  <p>{t('고객', 'Customer')}: {selectedNotification.requests.customer || '-'}</p>
                  <p>{t('상태', 'Status')}: {selectedNotification.requests.status || '-'}</p>
                  {selectedNotification.requests.review_details && (
                    <p>{t('검토 상세', 'Review details')}: {selectedNotification.requests.review_details}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </RequestConfigProvider>
  );
};
