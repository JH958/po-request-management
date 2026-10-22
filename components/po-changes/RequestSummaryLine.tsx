/**
 * 요청 한 줄 요약 — 요청일·요청자·부서·요청구분·품목·수량·상태 (반려된 요청은 "반려됐는데 변경됨" 경고)
 */
'use client';

import { useLanguage } from '@/context/LanguageContext';
import { getStatusLabel } from '@/lib/request-helpers';
import { cn } from '@/lib/utils';
import type { LinkedRequestSummary } from '@/types/po-changes';

const numberFormat = new Intl.NumberFormat('ko-KR');

export const RequestSummaryLine = ({ request, compact = false }: { request: LinkedRequestSummary; compact?: boolean }) => {
  const { t } = useLanguage();
  const rejected = request.request_status === 'rejected';
  return (
    <div className={cn('min-w-0 text-sm', compact && 'text-xs')}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="font-medium text-[#172132]">{request.request_date}</span>
        <span className="text-[#5A6778]">
          {request.requester_name} · {request.requesting_dept}
        </span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs',
            rejected ? 'bg-red-100 text-red-700' : request.request_status === 'approved' || request.request_status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
          )}
        >
          {getStatusLabel(request.request_status, t)}
        </span>
        {rejected ? (
          <span className="text-xs font-medium text-red-700">{t('반려됐는데 변경됨', 'Rejected but changed')}</span>
        ) : null}
      </p>
      <p className="truncate text-[#5A6778]" title={request.reason_for_request}>
        {request.category_of_request}
        {request.item_key ? ` · ${request.item_name ?? request.item_key}` : ''}
        {request.request_qty !== null ? ` · ${numberFormat.format(request.request_qty)}` : ''}
        {` · ${request.reason_for_request}`}
      </p>
    </div>
  );
};
