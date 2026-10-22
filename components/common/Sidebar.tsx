/**
 * 사이드바 네비게이션 컴포넌트 (섹션별 메뉴 + 하단 사용자 정보)
 */
'use client';

import { Fragment, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
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
  Upload,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

const SIDEBAR_STORAGE_KEY = 'purchaseOnSidebarCollapsed';

interface SidebarProps {
  userName: string;
  department?: string;
  onOpenTour?: () => void;
  /** 관리자 메뉴 (데이터 업로드·관리자 설정) */
  showAdminSettings?: boolean;
  /** 영업관리팀 메뉴 (PO 변경) */
  showSalesTeamMenus?: boolean;
}

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

/**
 * 메뉴 아이콘 상자 — 활성 메뉴는 크림슨 배경, 나머지는 흰 배경에 테두리
 */
const IconBox = ({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) => (
  <span
    className={cn(
      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
      active ? 'border-[#8B1538] bg-[#8B1538] text-white' : 'border-[#DEE4EC] bg-white text-[#8B1538]'
    )}
  >
    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
  </span>
);

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] transition-colors',
    collapsed && 'justify-center px-0',
    active
      ? 'border-[#E4E9EF] bg-white font-semibold text-[#253143] shadow-[0_1px_3px_rgba(23,33,50,0.08)]'
      : 'border-transparent text-[#687487] hover:bg-white/70 hover:text-[#253143]'
  );

export const Sidebar = ({
  userName,
  department,
  onOpenTour,
  showAdminSettings = false,
  showSalesTeamMenus = false,
}: SidebarProps) => {
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
  const { t } = useLanguage();

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      /* 저장 실패 시 UI 토글만 반영 */
    }
  };

  const sections: MenuSection[] = [
    // PO 현황은 영업관리팀(관리자 포함)만
    ...(showSalesTeamMenus
      ? [{ title: t('현황', 'Overview'), items: [{ href: '/', label: t('PO 현황', 'PO Status'), icon: LayoutDashboard }] }]
      : []),
    {
      title: t('요청', 'Requests'),
      items: [
        { href: '/request', label: t('요청접수', 'Submit Request'), icon: FileEdit },
        { href: '/review', label: t('검토대기', 'Pending Review'), icon: CheckSquare },
      ],
    },
    ...(showAdminSettings || showSalesTeamMenus
      ? [
          {
            title: t('관리', 'Admin'),
            // 데이터 업로드·관리자 설정은 관리자, PO 변경은 영업관리팀(관리자 포함)
            items: [
              ...(showAdminSettings ? [{ href: '/po-upload', label: t('데이터 업로드', 'Data Upload'), icon: Upload }] : []),
              { href: '/po-changes', label: t('PO 변경', 'PO Changes'), icon: ListChecks },
              ...(showAdminSettings ? [{ href: '/admin-settings', label: t('관리자 설정', 'Admin Settings'), icon: Settings }] : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-[#D6DDE7] bg-brand-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 pt-2 pb-4">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'mb-1 flex h-7 items-center rounded-md text-[#8E98A8] hover:text-[#253143]',
            collapsed ? 'justify-center' : 'justify-end px-1'
          )}
          aria-label={t('사이드바 접기/펼치기', 'Collapse or expand sidebar')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {sections.map((section, index) => (
          <Fragment key={section.title}>
            {index > 0 ? <div className="mx-1 my-2 border-t border-[#DEE4EC]" /> : null}
            {!collapsed ? (
              <p className="px-1.5 pb-1 text-[11px] font-medium text-[#8E98A8]">{section.title}</p>
            ) : null}
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={itemClass(active, collapsed)}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <IconBox icon={item.icon} active={active} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </Fragment>
        ))}

        {onOpenTour ? (
          <>
            <div className="mx-1 my-2 hidden border-t border-[#DEE4EC] md:block" />
            {!collapsed ? (
              <p className="hidden px-1.5 pb-1 text-[11px] font-medium text-[#8E98A8] md:block">{t('도움말', 'Help')}</p>
            ) : null}
            <button
              type="button"
              onClick={onOpenTour}
              className={cn(itemClass(false, collapsed), 'hidden md:flex')}
              title={collapsed ? t('사용자가이드', 'User guide') : undefined}
            >
              <IconBox icon={BookOpen} active={false} />
              {!collapsed && <span>{t('사용자가이드', 'User guide')}</span>}
            </button>
          </>
        ) : null}
      </nav>

      {!collapsed ? (
        <div className="mx-2.5 border-t border-[#DEE4EC] px-1.5 py-3">
          <p className="truncate text-sm font-semibold text-[#253143]">{userName}</p>
          {department ? <p className="truncate text-xs text-[#8E98A8]">{department}</p> : null}
        </div>
      ) : null}
    </aside>
  );
};
