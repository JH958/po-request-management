/**
 * 페이지 이동 후 Product Tour 시작을 위한 sessionStorage 유틸
 */
import type { TourKey } from './tourSteps';

const PENDING_TOUR_KEY = 'purchaseOnPendingTour';

/**
 * 이동 완료 후 시작할 투어 키를 저장합니다.
 */
export const setPendingTour = (key: TourKey): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_TOUR_KEY, key);
  } catch {
    /* sessionStorage 불가 시 무시 */
  }
};

const parsePendingTour = (value: string | null): TourKey | null => {
  if (value === 'po-status' || value === 'request' || value === 'review') {
    return value;
  }
  return null;
};

/**
 * 저장된 투어 키를 읽기만 합니다 (제거하지 않음).
 */
export const peekPendingTour = (): TourKey | null => {
  if (typeof window === 'undefined') return null;
  try {
    return parsePendingTour(sessionStorage.getItem(PENDING_TOUR_KEY));
  } catch {
    return null;
  }
};

/**
 * 저장된 투어 키를 제거합니다.
 */
export const clearPendingTour = (): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_TOUR_KEY);
  } catch {
    /* sessionStorage 불가 시 무시 */
  }
};

/**
 * 저장된 투어 키를 읽고 제거합니다.
 */
export const consumePendingTour = (): TourKey | null => {
  const pending = peekPendingTour();
  if (pending) {
    clearPendingTour();
  }
  return pending;
};
