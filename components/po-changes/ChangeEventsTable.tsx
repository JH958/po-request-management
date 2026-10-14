/**
 * 변경 이벤트 탭 — 필터 결과 표 + Excel 다운로드
 */
'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/context/LanguageContext';
import {
  getDoChangeTypeLabels,
  getChangeGroupStatusLabels,
  getChangeGroupTypeLabels,
  getEventTypeName,
  getProductClassLabels,
} from '@/lib/po-tracker-labels';
import { cn } from '@/lib/utils';
import type { PoChangeEvent, PoChangeTypeSetting } from '@/types/po-changes';

interface ChangeEventsTableProps {
  events: PoChangeEvent[];
  changeTypes: PoChangeTypeSetting[];
  statCount: number;
  from: string;
  to: string;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/** 전 → 후 문구 (둘 다 없으면 -) */
const beforeAfter = (before: string | number | null, after: string | number | null): string =>
  before === null && after === null ? '-' : `${before ?? '-'} → ${after ?? '-'}`;

export const ChangeEventsTable = ({ events, changeTypes, statCount, from, to }: ChangeEventsTableProps) => {
  const { t, lang } = useLanguage();
  const classLabels = getProductClassLabels(t);
  const typeLabels = getDoChangeTypeLabels(t);
  const groupTypeLabels = getChangeGroupTypeLabels(t);
  const groupStatusLabels = getChangeGroupStatusLabels(t);

  const detailText = (e: PoChangeEvent): string => {
    if (e.direction === 'date') return beforeAfter(e.date_before, e.date_after);
    if (e.direction === 'mode') return beforeAfter(e.mode_before, e.mode_after);
    if (e.direction === 'item') return beforeAfter(e.item_before, e.item_after);
    return '-';
  };

  const handleExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = events.map((e) => ({
        [t('기준일', 'Date')]: e.detected_on,
        [t('고객처', 'Customer')]: e.customer_name ?? '',
        [t('주문번호', 'Order No.')]: e.order_no,
        [t('라인', 'Line')]: e.line_no,
        DO: e.do_no ?? '',
        [t('품목번호', 'Item code')]: e.item_no ?? '',
        [t('품목명', 'Item name')]: e.item_name ?? '',
        [t('구분', 'Category')]: classLabels[e.product_class],
        [t('변경 유형', 'Change type')]: getEventTypeName(e, changeTypes, lang),
        [t('세부 유형', 'Detail type')]: typeLabels[e.change_type],
        [t('수량', 'Qty')]: e.qty,
        [t('수량 전', 'Qty before')]: e.qty_before ?? '',
        [t('수량 후', 'Qty after')]: e.qty_after ?? '',
        [t('상세 (전 → 후)', 'Detail (before → after)')]: detailText(e),
        [t('후보 묶음', 'Candidate group')]: e.group_type ? groupTypeLabels[e.group_type] : '',
        [t('묶음 상태', 'Group status')]: e.group_status ? groupStatusLabels[e.group_status] : '',
        [t('추적 제외', 'Excluded')]: e.is_excluded ? 'Y' : '',
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, t('PO 변경', 'PO Changes'));
      XLSX.writeFile(book, t(`PO변경_${from}_${to}.xlsx`, `PO_changes_${from}_${to}.xlsx`));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Excel 다운로드 실패:', error);
      }
      toast.error(t('Excel 파일을 만들지 못했습니다.', 'Could not create the Excel file.'));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5A6778]">
          {t(
            `이벤트 ${numberFormat.format(events.length)}건 · 통계 ${numberFormat.format(statCount)}건`,
            `${numberFormat.format(events.length)} events · ${numberFormat.format(statCount)} counted`
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExport()}
          disabled={events.length === 0}
          className="border-[#D6DDE7] shadow-none"
        >
          <Download className="h-4 w-4" />
          {t('Excel 다운로드', 'Download Excel')}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('조건에 맞는 변경 이벤트가 없습니다.', 'No change events match the filters.')}
        </p>
      ) : (
        <div className="max-h-[640px] overflow-auto rounded-lg border bg-white">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                {[
                  t('기준일', 'Date'),
                  t('고객처', 'Customer'),
                  t('주문 · 라인', 'Order · Line'),
                  'DO',
                  t('품목', 'Item'),
                  t('구분', 'Category'),
                  t('변경 유형', 'Change type'),
                  t('수량 (전 → 후)', 'Qty (before → after)'),
                  t('상세 (전 → 후)', 'Detail (before → after)'),
                  t('후보 묶음', 'Candidate'),
                ].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap bg-white">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id} className={cn(e.is_excluded && 'opacity-60')}>
                  <TableCell className="whitespace-nowrap">{e.detected_on}</TableCell>
                  <TableCell className="max-w-48 truncate" title={e.customer_name ?? ''}>
                    {e.customer_name ?? <span className="text-[#8E98A8]">{t('미확인', 'Unknown')}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {e.order_no} <span className="font-normal text-[#5A6778]">L{e.line_no}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[#5A6778]">{e.do_no ?? '-'}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate" title={`${e.item_no ?? ''} ${e.item_name ?? ''}`}>
                      {e.item_no} <span className="text-[#5A6778]">{e.item_name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {classLabels[e.product_class]}
                    {e.is_class_overridden ? (
                      <span
                        className="ml-1 text-xs text-[#8E98A8]"
                        title={t('관리자 설정의 품목 구분 예외로 지정된 품목입니다.', 'Set by an item category exception in admin settings.')}
                      >
                        · {t('예외', 'exception')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={cn(e.direction === 'delete' ? 'text-[#8B1538]' : e.direction === 'add' ? 'text-[#1E40AF]' : 'text-[#253143]')}>
                      {getEventTypeName(e, changeTypes, lang)}
                    </span>
                    {e.change_type === 'shipment_shortfall' ? (
                      <span className="ml-1 text-xs text-[#8E98A8]">· {t('출하 부족', 'Short shipment')}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-semibold">{numberFormat.format(e.qty)}</span>
                    {e.qty_before !== null && e.qty_after !== null ? (
                      <span className="ml-1 text-xs text-[#8E98A8]">
                        ({numberFormat.format(e.qty_before)} → {numberFormat.format(e.qty_after)})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[#5A6778]">{detailText(e)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {e.group_type ? (
                      <Badge variant="outline" className="border-[#8B1538]/30 text-[#8B1538]">
                        {groupTypeLabels[e.group_type]}
                        {e.group_status ? ` · ${groupStatusLabels[e.group_status]}` : ''}
                      </Badge>
                    ) : (
                      <span className="text-[#8E98A8]">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
