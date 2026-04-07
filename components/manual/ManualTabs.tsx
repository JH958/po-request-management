/**
 * 매뉴얼 탭: PC는 Tabs, 모바일은 Select
 */
'use client';

import { useState } from 'react';
import {
  LayoutGrid,
  Plus,
  CheckCircle2,
  Bell,
  Search,
  BarChart3,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ManualType } from '@/lib/manualUtils';
import { MainPageSection } from '@/components/manual/sections/MainPageSection';
import { RequestSection } from '@/components/manual/sections/RequestSection';
import { ReviewSection } from '@/components/manual/sections/ReviewSection';
import { NotificationSection } from '@/components/manual/sections/NotificationSection';
import { SearchSection } from '@/components/manual/sections/SearchSection';
import { DashboardSection } from '@/components/manual/sections/DashboardSection';
import { ExcelSection } from '@/components/manual/sections/ExcelSection';

interface ManualTabsProps {
  manualType: ManualType;
}

type TabDef = { value: string; label: string; icon: LucideIcon };

const COMMON_TABS: TabDef[] = [
  { value: 'main', label: '메인 페이지', icon: LayoutGrid },
  { value: 'request', label: '요청 기능', icon: Plus },
  { value: 'review', label: '검토 기능', icon: CheckCircle2 },
  { value: 'notification', label: '알림', icon: Bell },
  { value: 'search', label: '검색/필터', icon: Search },
];

const ADMIN_TABS: TabDef[] = [
  { value: 'dashboard', label: '대시보드 📊', icon: BarChart3 },
  { value: 'excel', label: 'Excel 다운로드', icon: Download },
];

const renderPanel = (value: string, showAdmin: boolean) => {
  switch (value) {
    case 'main':
      return <MainPageSection />;
    case 'request':
      return <RequestSection />;
    case 'review':
      return <ReviewSection />;
    case 'notification':
      return <NotificationSection />;
    case 'search':
      return <SearchSection />;
    case 'dashboard':
      return showAdmin ? <DashboardSection /> : null;
    case 'excel':
      return showAdmin ? <ExcelSection /> : null;
    default:
      return null;
  }
};

export const ManualTabs = ({ manualType }: ManualTabsProps) => {
  const showAdmin = manualType === 'admin';
  const allTabs = showAdmin ? [...COMMON_TABS, ...ADMIN_TABS] : COMMON_TABS;
  const [activeTab, setActiveTab] = useState('main');

  return (
    <>
      <div className="hidden md:block">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className="flex h-auto w-full flex-wrap justify-start gap-1 bg-[#F3F4F6] p-1"
            aria-label="매뉴얼 섹션"
          >
            {allTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="shrink-0 gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#971B2F]"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap text-xs sm:text-sm">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {allTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4 outline-none">
              {renderPanel(tab.value, showAdmin)}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="md:hidden">
        <label htmlFor="manual-section-select" className="sr-only">
          매뉴얼 섹션 선택
        </label>
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger id="manual-section-select" className="w-full border-[#E5E7EB]">
            <SelectValue placeholder="섹션 선택" />
          </SelectTrigger>
          <SelectContent>
            {allTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <SelectItem key={tab.value} value={tab.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {tab.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="mt-4">{renderPanel(activeTab, showAdmin)}</div>
      </div>
    </>
  );
};
