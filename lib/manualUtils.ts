/**
 * Purchase On 사용 매뉴얼: localStorage 및 사용자 유형 판별 유틸
 */

export const MANUAL_VERSION = '1.0';

export const MANUAL_STORAGE_KEY = 'purchaseOnManualSettings';

export type ManualType = 'admin' | 'hq' | 'customer';

export interface ManualSettings {
  hideUntil: number | null;
  lastViewedVersion: string;
}

/**
 * 저장된 매뉴얼 설정을 읽습니다. 실패 시 기본값을 반환합니다.
 */
export const getManualSettings = (): ManualSettings => {
  if (typeof window === 'undefined') {
    return { hideUntil: null, lastViewedVersion: '' };
  }
  try {
    const raw = localStorage.getItem(MANUAL_STORAGE_KEY);
    if (!raw) {
      return { hideUntil: null, lastViewedVersion: '' };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hideUntil =
      typeof parsed.hideUntil === 'number' || parsed.hideUntil === null
        ? (parsed.hideUntil as number | null)
        : null;
    const lastViewedVersion =
      typeof parsed.lastViewedVersion === 'string' ? parsed.lastViewedVersion : '';
    return { hideUntil, lastViewedVersion };
  } catch {
    return { hideUntil: null, lastViewedVersion: '' };
  }
};

/**
 * 자동 팝업을 띄울지 여부 (버전 갱신 시 숨김 무시)
 */
export const shouldShowManual = (): boolean => {
  try {
    const settings = getManualSettings();
    if (settings.lastViewedVersion !== MANUAL_VERSION) {
      return true;
    }
    if (!settings.hideUntil) {
      return true;
    }
    return Date.now() > settings.hideUntil;
  } catch {
    return true;
  }
};

/**
 * 매뉴얼 닫기 시 localStorage에 반영합니다.
 * @param hideToday - true면 다음날 0시까지 자동 팝업 숨김
 */
export const persistManualClose = (hideToday: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const settings: ManualSettings = {
      hideUntil: hideToday ? tomorrow.getTime() : null,
      lastViewedVersion: MANUAL_VERSION,
    };
    localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage 불가 시 무시 */
  }
};

/**
 * 부서·역할로 매뉴얼 탭(관리자 전용 탭 노출) 여부를 판별합니다.
 * @param department - user_profiles.department
 * @param role - user_profiles.role (콤마 구분 가능)
 */
export const getManualType = (
  department: string | null | undefined,
  role: string | null | undefined
): ManualType => {
  const dept = (department ?? '').trim();
  const roleStr = (role ?? '').trim();
  const roles = roleStr.split(',').map((r) => r.trim()).filter(Boolean);
  if (dept.includes('영업관리') || roles.includes('admin')) {
    return 'admin';
  }
  if (dept.endsWith('팀')) {
    return 'hq';
  }
  return 'customer';
};
