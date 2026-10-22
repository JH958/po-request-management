/**
 * 핵심 지표 카드 — 제목, 큰 숫자, 보조 문구 (PO 변경 요약 카드와 같은 모양)
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** 숫자를 크림슨으로 강조 */
  emphasize?: boolean;
  /** 숫자 아래 추가 영역 (미터 등) */
  children?: ReactNode;
}

export const KpiCard = ({ label, value, hint, emphasize, children }: KpiCardProps) => (
  <div className="rounded-lg border bg-white px-5 py-4">
    <p className="text-sm text-[#5A6778]">{label}</p>
    <div className={cn('mt-1 text-2xl font-bold tabular-nums', emphasize ? 'text-[#8B1538]' : 'text-[#172132]')}>{value}</div>
    {children}
    {hint ? <p className="mt-1 text-xs text-[#8E98A8]">{hint}</p> : null}
  </div>
);

/**
 * 비율 미터 (여러 조각을 한 줄 막대로)
 */
export const RatioMeter = ({ parts, label }: { parts: { value: number; color: string; label: string }[]; label: string }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#F1F4F8]" role="img" aria-label={label}>
      {total > 0
        ? parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span key={p.label} title={`${p.label} ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
            ))
        : null}
    </div>
  );
};
