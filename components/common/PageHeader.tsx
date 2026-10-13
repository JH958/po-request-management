/**
 * 페이지 제목부 (큰 제목 + 설명 + 하단 구분선)
 */
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 제목 오른쪽 영역 (버튼 등) */
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DCE3EB] pb-6">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-[#172132]">{title}</h1>
      {description ? <p className="mt-2 text-sm text-[#5A6778]">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);
