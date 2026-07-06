/**
 * 페이지 이동 후 대기 중인 Product Tour를 시작하는 호스트 컴포넌트
 */
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { clearPendingTour, peekPendingTour } from '@/lib/tours/tour-pending';
import { tourRouteMap } from '@/lib/tours/tourSteps';
import { useProductTour } from '@/lib/tours/useProductTour';

interface TourHostProps {
  onTourComplete: () => void;
}

export const TourHost = ({ onTourComplete }: TourHostProps) => {
  const pathname = usePathname();
  const { startTour } = useProductTour();
  const onCompleteRef = useRef(onTourComplete);

  useEffect(() => {
    onCompleteRef.current = onTourComplete;
  }, [onTourComplete]);

  useEffect(() => {
    const pending = peekPendingTour();
    if (!pending) return;

    const targetRoute = tourRouteMap[pending];
    if (pathname !== targetRoute) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;

      const stillPending = peekPendingTour();
      if (stillPending !== pending) return;

      clearPendingTour();
      void startTour(pending, {
        onComplete: () => onCompleteRef.current(),
      });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, startTour]);

  return null;
};
