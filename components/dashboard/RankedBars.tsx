/**
 * 가로 막대 순위 카드 — 마우스를 올리면 나눠 보기(출처·꼬리표·상태별 건수와 비중), 누르면 상세 화면으로
 */
'use client';

import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { RankedItem } from '@/types/po-dashboard';

interface RankedBarsProps {
  title: string;
  /** 제목 옆 작은 설명 */
  hint?: string;
  items: RankedItem[];
  emptyText: string;
  /** 막대를 눌렀을 때 (없으면 누를 수 없음) */
  onSelect?: (item: RankedItem) => void;
  /** 카드 아래 범례·안내 */
  footer?: ReactNode;
  /** 제품 투어 대상 */
  tourId?: string;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/**
 * 나눠 보기 툴팁 내용
 */
const BreakdownTip = ({ item }: { item: RankedItem }) => {
  const { t } = useLanguage();
  return (
    <div className="min-w-48 space-y-1.5 py-0.5">
      <p className="font-semibold">
        {item.label} · {t(`${numberFormat.format(item.value)}건`, numberFormat.format(item.value))}
      </p>
      {item.breakdown.map((b) => (
        <div key={b.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: b.color }} />
            {b.label}
          </span>
          <span className="tabular-nums">
            {numberFormat.format(b.value)} ({Math.round((b.value / item.value) * 100)}%)
          </span>
        </div>
      ))}
    </div>
  );
};

export const RankedBars = ({ title, hint, items, emptyText, onSelect, footer, tourId }: RankedBarsProps) => {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <section className="rounded-lg border bg-white p-5" data-tour={tourId}>
      <h3 className="text-sm font-semibold text-[#172132]">
        {title}
        {hint ? <span className="ml-2 text-xs font-normal text-[#8E98A8]">{hint}</span> : null}
      </h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#8E98A8]">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const row = (
              <div
                className={cn(
                  'grid w-full grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded px-1 py-0.5 text-left text-sm',
                  onSelect && 'cursor-pointer hover:bg-[#F8FAFC]'
                )}
              >
                <span className="truncate text-[#5A6778]" title={item.label}>{item.label}</span>
                <span className="h-3 overflow-hidden rounded-r bg-[#F1F4F8]">
                  <span
                    className="block h-full rounded-r"
                    style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, background: item.color }}
                  />
                </span>
                <span className="text-right font-semibold tabular-nums text-[#172132]">{numberFormat.format(item.value)}</span>
              </div>
            );
            const trigger = onSelect ? (
              <button type="button" className="block w-full" onClick={() => onSelect(item)}>
                {row}
              </button>
            ) : (
              <div tabIndex={item.breakdown.length ? 0 : undefined}>{row}</div>
            );
            return (
              <li key={item.key}>
                {item.breakdown.length ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                    <TooltipContent side="top" align="start" className="bg-[#172132] text-xs">
                      <BreakdownTip item={item} />
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  trigger
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footer ? <div className="mt-4 text-xs text-[#8E98A8]">{footer}</div> : null}
    </section>
  );
};
