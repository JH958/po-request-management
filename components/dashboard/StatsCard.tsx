/**
 * 대시보드 통계 카드 컴포넌트
 */
'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface StatsCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: string | ReactNode;
  themeColor: string;
  onClick?: () => void;
}

export const StatsCard = ({ title, value, subtitle, icon, themeColor, onClick }: StatsCardProps) => {
  const { t } = useLanguage();
  return (
    <Card 
      className={cn(
        "hover:shadow-lg hover:-translate-y-1 transition-all duration-200",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[#5A6778]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-bold text-[#172132]">{t(`${value}건`, `${value}`)}</div>
            <div className="text-sm" style={{ color: themeColor }}>
              {subtitle}
            </div>
          </div>
          <div className="text-2xl">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};
