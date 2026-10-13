/**
 * 상단 헤더 컴포넌트 (로고·서비스명 / 도구 버튼·사용자가이드·로그아웃)
 */
'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createClient } from '@/lib/supabase/client';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { useLanguage } from '@/context/LanguageContext';

interface HeaderProps {
  /** D365·GM 등 사용자가이드 왼쪽에 올 도구 영역 */
  toolbarStart?: ReactNode;
  /** 있으면 사용자가이드 버튼 표시 (PC 전용) */
  onOpenTour?: () => void;
  /** 알림 등 사용자가이드 오른쪽 도구 영역 */
  toolbarEnd?: ReactNode;
}

/** 헤더 아이콘 버튼 공통 스타일 (AppShell의 D365·GM·알림 버튼에서 사용) */
export const HEADER_ICON_BUTTON_CLASS =
  'relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#D6DDE7] bg-white p-0 text-[#253143] shadow-none hover:bg-[#F1F4F8]';

export const Header = ({ toolbarStart, onOpenTour, toolbarEnd }: HeaderProps) => {
  const router = useRouter();
  const { t } = useLanguage();

  /**
   * 로그아웃 핸들러
   */
  const handleLogout = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('로그아웃 오류:', error);
      }

      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('로그아웃 중 오류 발생:', error);
      router.push('/login');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#DAE0E9] bg-white">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="shrink-0 text-[26px] font-bold leading-none tracking-tight text-brand-logo">
            PO Tracker
          </span>
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8E98A8]">
              PO Change Tracker
            </span>
            <span className="truncate text-sm font-bold text-[#253143]">{t('PO 변경 추적 관리', 'PO Change Tracking')}</span>
          </div>
        </div>

        <TooltipProvider delayDuration={0}>
          <div className="flex shrink-0 items-center gap-2">
            {toolbarStart}
            {toolbarEnd}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg border-[#D6DDE7] bg-[#F6F8FB] px-3 text-xs font-medium text-[#687B8F] shadow-none hover:bg-[#EEF2F6] hover:text-[#253143]"
                  onClick={() => void handleLogout()}
                >
                  <LogOut className="h-3.5 w-3.5 sm:hidden" />
                  <span className="hidden sm:inline">{t('로그아웃', 'Log out')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">{t('로그아웃', 'Log out')}</TooltipContent>
            </Tooltip>

            <LanguageToggle />

            {onOpenTour ? (
              <Button
                type="button"
                variant="outline"
                className="hidden h-9 rounded-full border-[#E1C2CB] bg-white px-4 text-sm font-semibold text-[#8B1538] shadow-none hover:bg-[#8B1538]/5 hover:text-[#8B1538] md:inline-flex"
                onClick={onOpenTour}
                aria-label={t('PO Tracker 사용자 가이드 열기', 'Open the PO Tracker user guide')}
              >
                <BookOpen className="h-4 w-4" strokeWidth={2} />
                {t('사용자가이드', 'User guide')}
              </Button>
            ) : null}
          </div>
        </TooltipProvider>
      </div>
    </header>
  );
};
