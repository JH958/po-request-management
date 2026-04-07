/**
 * 상단 헤더 컴포넌트 (도구 아이콘은 toolbarStart / 매뉴얼 / toolbarEnd 순으로 배치)
 */
'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LogOut, User, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  /** D365·GM 등 매뉴얼 왼쪽에 올 도구 영역 */
  toolbarStart?: ReactNode;
  /** true일 때 D365/GM과 알림 사이에 매뉴얼 버튼 표시 */
  onOpenManual?: () => void;
  /** 알림 등 매뉴얼 오른쪽 도구 영역 */
  toolbarEnd?: ReactNode;
}

export const Header = ({
  userName,
  userEmail,
  toolbarStart,
  onOpenManual,
  toolbarEnd,
}: HeaderProps) => {
  const router = useRouter();

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

  const displayName = userName || '사용자';
  const displayEmail = userEmail || '';

  const userInitials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="flex h-16 w-full items-center justify-between px-8 lg:px-14 xl:px-20">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#971B2F]">
            Purchase On - PO 변경 요청 관리 시스템
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <div className="flex items-center gap-1">
              {toolbarStart}
              {onOpenManual ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex h-9 items-center gap-2 rounded-md px-2 py-2 hover:bg-gray-100 lg:px-3"
                      onClick={onOpenManual}
                      aria-label="Purchase On 사용 가이드 열기"
                    >
                      <BookOpen className="h-5 w-5 shrink-0 text-[#101820]" strokeWidth={2} />
                      <span className="hidden text-sm font-medium text-[#101820] lg:inline">
                        매뉴얼
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>매뉴얼</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </TooltipProvider>
          {toolbarEnd}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#971B2F] text-white">
                    {userInitials || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden flex-col items-start text-left sm:flex">
                  <span className="text-sm font-medium text-[#101820]">{displayName}</span>
                  {displayEmail && (
                    <span className="text-xs text-[#67767F]">{displayEmail}</span>
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>프로필</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="flex items-center gap-2 text-[#971B2F]"
              >
                <LogOut className="h-4 w-4" />
                <span>로그아웃</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
