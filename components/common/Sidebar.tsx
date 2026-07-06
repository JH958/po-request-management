/**
 * 사이드바 네비게이션 컴포넌트
 */
'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  FileEdit,
  CheckSquare,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';

const SIDEBAR_STORAGE_KEY = 'purchaseOnSidebarCollapsed';

interface SidebarProps {
  onOpenTour?: () => void;
  showAdminSettings?: boolean;
}

export const Sidebar = ({ onOpenTour, showAdminSettings = false }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const pathname = usePathname();

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      /* 저장 실패 시 UI 토글만 반영 */
    }
  };

  const menuItems = [
    { href: '/', label: 'PO 현황', icon: LayoutDashboard },
    { href: '/request', label: '요청접수', icon: FileEdit },
    { href: '/review', label: '검토대기', icon: CheckSquare },
    ...(showAdminSettings
      ? [{ href: '/admin-settings', label: '관리자 설정', icon: Settings }]
      : []),
  ];

  return (
    <aside
      className={`shrink-0 border-r bg-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full justify-end p-3"
        aria-label="사이드바 접기/펼치기"
      >
        {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>

      <nav className="flex flex-col gap-1 px-2 pb-4">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              pathname === item.href
                ? 'bg-[#971B2F] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {onOpenTour ? (
          <button
            type="button"
            onClick={onOpenTour}
            className="hidden items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 md:flex"
          >
            <BookOpen className="h-5 w-5 shrink-0" />
            {!collapsed && <span>사용자가이드</span>}
          </button>
        ) : null}
      </nav>
    </aside>
  );
};
