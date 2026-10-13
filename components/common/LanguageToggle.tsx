/**
 * KOR / ENG 언어 전환 토글 (회색 바탕 안에 선택된 언어만 흰색 칸으로 표시)
 */
'use client';

import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { Language } from '@/lib/i18n';

const OPTIONS: { value: Language; label: string; ariaLabel: string }[] = [
  { value: 'ko', label: 'KOR', ariaLabel: '한국어' },
  { value: 'en', label: 'ENG', ariaLabel: 'English' },
];

export const LanguageToggle = ({ className }: { className?: string }) => {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t('화면 언어', 'Display language')}
      className={cn(
        'flex h-9 items-center gap-0.5 rounded-lg border border-[#D6DDE7] bg-[#F3F5F8] p-[3px]',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            onClick={() => setLang(option.value)}
            className={cn(
              'h-full min-w-11 rounded-md px-2.5 text-[11px] font-bold tracking-wide transition-colors',
              active
                ? 'bg-white text-[#253143] shadow-[0_1px_2px_rgba(23,33,50,0.12)]'
                : 'text-[#8E98A8] hover:text-[#5A6778]'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
