/**
 * driver.js 기반 Product Tour 실행 훅
 */
'use client';

import { useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { tourStepsMap, type TourKey } from './tourSteps';

/**
 * 지정 선택자의 DOM 요소가 나타날 때까지 대기합니다.
 */
const waitForElement = (selector: string, timeout = 3000): Promise<Element | null> => {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
};

interface StartTourOptions {
  onComplete?: () => void;
}

export const useProductTour = () => {
  const startTour = useCallback(async (key: TourKey, options?: StartTourOptions) => {
    const steps = tourStepsMap[key];
    if (!steps.length) return;

    const firstElement = await waitForElement(steps[0].target);
    if (!firstElement) {
      console.warn(`[ProductTour] 대상 요소를 찾을 수 없어 투어를 시작하지 않습니다: ${steps[0].target}`);
      return;
    }

    const driverObj = driver({
      showProgress: true,
      nextBtnText: '다음',
      prevBtnText: '이전',
      doneBtnText: '완료',
      steps: steps.map((step) => ({
        element: step.target,
        popover: {
          title: step.title,
          description: step.description,
        },
      })),
      onDestroyed: () => {
        options?.onComplete?.();
      },
    });

    driverObj.drive();
  }, []);

  return { startTour };
};
