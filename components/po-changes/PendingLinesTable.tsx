/**
 * 재등록 대기 탭 — DO에서 사라졌지만 판매주문에는 미출고로 남아 있는 라인
 */
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/context/LanguageContext';
import type { PendingReRegistrationLine } from '@/types/po-changes';

interface PendingLinesTableProps {
  lines: PendingReRegistrationLine[];
}

/** 대기 확정까지의 업로드 수 (DB 함수 c_wait_uploads와 같음) */
const WAIT_UPLOADS = 5;
const numberFormat = new Intl.NumberFormat('ko-KR');

export const PendingLinesTable = ({ lines }: PendingLinesTableProps) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#5A6778]">
        {t(
          `DO에서 사라졌지만 판매주문조회에는 미출고로 남아 있는 라인입니다. ${WAIT_UPLOADS}영업일(업로드 ${WAIT_UPLOADS}회) 안에 다시 나타나지 않으면 삭제로 확정됩니다.`,
          `Lines missing from the DO but still open in the sales order list. They are confirmed as removed if they do not reappear within ${WAIT_UPLOADS} business days (${WAIT_UPLOADS} uploads).`
        )}
      </p>

      {lines.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('재등록 대기 중인 라인이 없습니다.', 'No lines are pending re-registration.')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('고객처', 'Customer'),
                  t('주문 · 라인', 'Order · Line'),
                  t('품목', 'Item'),
                  t('수량', 'Qty'),
                  t('요청 배송일', 'Requested date'),
                  t('대기 시작', 'Pending since'),
                  t('경과', 'Progress'),
                ].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                // 대기 시작 업로드 이후 지난 업로드 수 — 5번째 업로드에서 삭제 확정
                const elapsed = line.pending_count;
                const remaining = WAIT_UPLOADS - elapsed;
                return (
                  <TableRow key={`${line.order_no}-${line.line_no}`}>
                    <TableCell>{line.customer_name ?? <span className="text-[#8E98A8]">{t('미확인', 'Unknown')}</span>}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {line.order_no} <span className="font-normal text-[#5A6778]">L{line.line_no}</span>
                    </TableCell>
                    <TableCell>
                      {line.item_no} <span className="text-[#5A6778]">{line.item_name}</span>
                    </TableCell>
                    <TableCell>{numberFormat.format(line.confirmed_qty)}</TableCell>
                    <TableCell className="whitespace-nowrap">{line.requested_dates.join(', ') || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{line.pending_since_date ?? '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {t(`${elapsed}/${WAIT_UPLOADS}영업일`, `${elapsed}/${WAIT_UPLOADS} days`)}
                      <span className="ml-1 text-xs text-[#8E98A8]">
                        {remaining > 1
                          ? t(`· 업로드 ${remaining}회 뒤 확정`, `· confirmed after ${remaining} more uploads`)
                          : t('· 다음 업로드에 확정', '· confirmed at next upload')}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
