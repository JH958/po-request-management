/**
 * 화면 언어(한국어/영어) 공통 타입과 번역 헬퍼
 *
 * 문구는 키 대신 `t('한국어', 'English')`처럼 두 언어를 나란히 적어 사용합니다.
 * React 밖(lib 함수)에서는 호출하는 컴포넌트가 `t`를 인자로 넘겨줍니다.
 */
import type { Locale } from 'date-fns';
import { enUS, ko } from 'date-fns/locale';

/** 지원 언어 */
export type Language = 'ko' | 'en';

/** 번역 함수: 현재 언어에 맞는 문구를 돌려줌 */
export type Translate = (ko: string, en: string) => string;

/** 선택 언어 저장 키 (기존 localStorage 키 이름 규칙 유지) */
export const LANGUAGE_STORAGE_KEY = 'purchaseOnLanguage';

export const DEFAULT_LANGUAGE: Language = 'ko';

/**
 * 언어에 맞는 번역 함수 생성
 */
export const createTranslate = (lang: Language): Translate => (koText, enText) =>
  lang === 'en' ? enText : koText;

/**
 * 저장된 화면 언어 읽기 (서버·저장소 접근 불가 시 기본 언어)
 */
export const readStoredLanguage = (): Language => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

/**
 * 호출 시점의 언어로 번역 — 토스트·오류 메시지처럼 렌더링 밖에서 쓰는 문구용
 * (화면에 그리는 문구는 useLanguage().t 를 사용해야 언어 전환 시 다시 그려짐)
 */
export const translateNow: Translate = (koText, enText) =>
  readStoredLanguage() === 'en' ? enText : koText;

/** 번역 함수를 넘기지 않았을 때 쓰는 한국어 고정 번역 */
export const koreanOnly: Translate = (koText) => koText;

/** date-fns 로케일 */
export const getDateLocale = (lang: Language): Locale => (lang === 'en' ? enUS : ko);

/** 숫자·날짜 Intl 로케일 */
export const getIntlLocale = (lang: Language): string => (lang === 'en' ? 'en-US' : 'ko-KR');
