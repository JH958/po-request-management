/**
 * 화면 언어 전역 컨텍스트 — 선택 언어를 localStorage에 저장하고 t(한국어, 영어)를 제공
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  createTranslate,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  type Language,
  type Translate,
} from '@/lib/i18n';

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** 같은 탭 안에서 언어가 바뀌었음을 알리는 이벤트 */
const LANGUAGE_CHANGE_EVENT = 'po-tracker-language-change';

const subscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  };
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  // 서버 렌더링·하이드레이션 중에는 기본 언어(한국어), 이후 저장된 언어로 전환
  const lang = useSyncExternalStore(subscribe, readStoredLanguage, () => DEFAULT_LANGUAGE);

  const setLang = useCallback((next: Language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* 저장 실패(사생활 보호 모드 등) 시에도 이벤트로 화면은 갱신 시도 */
    }
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: createTranslate(lang) }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

/**
 * 현재 언어·번역 함수 사용 훅
 */
export const useLanguage = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage는 LanguageProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
};
