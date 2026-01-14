/**
 * 대시보드 통계 카드 컴포넌트
 */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  themeColor: string;
}

export const StatsCard = ({ title, value, subtitle, icon, themeColor }: StatsCardProps) => {
  return (
    <Card className="hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[#67767F]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-bold text-[#101820]">{value}건</div>
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
