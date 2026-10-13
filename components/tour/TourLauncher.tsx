/**
 * Product Tour 가이드 선택/종료 모달
 */
'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getTourLabels, TOUR_KEYS, tourRouteMap, type TourKey } from '@/lib/tours/tourSteps';
import { useLanguage } from '@/context/LanguageContext';
import { setPendingTour } from '@/lib/tours/tour-pending';
import { useProductTour } from '@/lib/tours/useProductTour';

interface TourLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 투어 완료 후 재진입 시 제목 변경 */
  afterTour?: boolean;
}

export const TourLauncher = ({ open, onOpenChange, afterTour = false }: TourLauncherProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { startTour } = useProductTour();
  const [starting, setStarting] = useState(false);
  const { t } = useLanguage();
  const tourLabels = getTourLabels(t);

  const handleSelect = async (key: TourKey) => {
    if (starting) return;
    setStarting(true);
    onOpenChange(false);

    const targetRoute = tourRouteMap[key];
    const onComplete = () => onOpenChange(true);

    try {
      if (pathname !== targetRoute) {
        setPendingTour(key);
        router.push(targetRoute);
      } else {
        await startTour(key, { onComplete });
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {afterTour
              ? t('다른 메뉴 가이드도 볼까요?', 'Want to see a guide for another menu?')
              : t('어떤 가이드를 보시겠어요?', 'Which guide would you like to see?')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {TOUR_KEYS.map((key) => (
            <Button
              key={key}
              variant="outline"
              className="justify-start"
              disabled={starting}
              onClick={() => void handleSelect(key)}
            >
              {afterTour ? t(`${tourLabels[key]} 보기`, `View ${tourLabels[key]}`) : tourLabels[key]}
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          className="mt-2 text-gray-500"
          onClick={() => onOpenChange(false)}
        >
          {t('가이드 종료', 'Close guide')}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
