/**
 * 상단 헤더 컴포넌트
 */
'use client';

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
import { LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  userName?: string;
  userEmail?: string;
}

export const Header = ({ userName, userEmail }: HeaderProps) => {
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
        // 로그아웃 오류가 발생해도 세션이 없을 수 있으므로 로그인 페이지로 이동
      }
      
      // 로그인 페이지로 이동
      router.push('/login');
      router.refresh(); // 세션 정보 갱신
    } catch (error) {
      console.error('로그아웃 중 오류 발생:', error);
      // 오류가 발생해도 로그인 페이지로 이동
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
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        {/* 서비스 로고/이름 */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#971B2F]">Purchase On - PO 변경 요청 관리 시스템</h1>
        </div>

        {/* 사용자 정보 및 로그아웃 */}
        <div className="flex items-center gap-4">
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
