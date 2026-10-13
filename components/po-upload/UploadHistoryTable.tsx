/**
 * 데이터 업로드 이력 테이블
 */
'use client';

import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { countDoEvents } from '@/components/po-upload/UploadResultSummary';
import { getUploadKindLabels, getUploadStatusLabels } from '@/lib/po-tracker-labels';
import type { Translate } from '@/lib/i18n';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { DoSnapshotSummary, PoSourceUpload, SoSnapshotSummary } from '@/types/po-upload';

interface UploadHistoryTableProps {
  uploads: PoSourceUpload[];
  loading: boolean;
  error: string | null;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

const STATUS_CLASS: Record<PoSourceUpload['status'], string> = {
  completed: 'border-green-200 bg-green-50 text-green-700',
  processing: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

/**
 * 이력 한 줄 결과 요약 문구
 */
const describeResult = (upload: PoSourceUpload, t: Translate): string => {
  if (upload.status === 'failed') return upload.error_message ?? t('처리 실패', 'Failed');
  if (upload.status === 'processing' || !upload.summary) return '-';

  if (upload.kind === 'sales_order') {
    const s = upload.summary as SoSnapshotSummary;
    return t(
      `주문 ${numberFormat.format(s.orders)} · 미출고 라인 ${numberFormat.format(s.open_so_lines)} · 미분류 품목 ${numberFormat.format(s.unclassified_items)}`,
      `${numberFormat.format(s.orders)} orders · ${numberFormat.format(s.open_so_lines)} open SO lines · ${numberFormat.format(s.unclassified_items)} unclassified items`
    );
  }

  const s = upload.summary as DoSnapshotSummary;
  if (s.baseline) {
    return t(
      `기준선 저장 (라인 ${numberFormat.format(s.order_lines ?? 0)})`,
      `Baseline saved (${numberFormat.format(s.order_lines ?? 0)} lines)`
    );
  }
  return t(
    `변경 ${numberFormat.format(countDoEvents(s))} · 신규 주문 ${numberFormat.format(s.new_orders ?? 0)} · 재등록 대기 ${numberFormat.format(s.pending_lines ?? 0)}`,
    `${numberFormat.format(countDoEvents(s))} changes · ${numberFormat.format(s.new_orders ?? 0)} new orders · ${numberFormat.format(s.pending_lines ?? 0)} pending re-registration`
  );
};

export const UploadHistoryTable = ({ uploads, loading, error }: UploadHistoryTableProps) => {
  const { t } = useLanguage();
  const kindLabels = getUploadKindLabels(t);
  const statusLabels = getUploadStatusLabels(t);

  if (loading && uploads.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  }

  if (uploads.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[#5A6778]">
        {t('아직 업로드한 파일이 없습니다.', 'No files uploaded yet.')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">{t('기준일', 'Snapshot date')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('종류', 'Type')}</TableHead>
            <TableHead>{t('파일명', 'File name')}</TableHead>
            <TableHead className="whitespace-nowrap text-right">{t('행 수', 'Rows')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('상태', 'Status')}</TableHead>
            <TableHead>{t('결과', 'Result')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('업로드 시각', 'Uploaded at')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((upload) => (
            <TableRow key={upload.id}>
              <TableCell className="whitespace-nowrap font-medium">{upload.snapshot_date}</TableCell>
              <TableCell className="whitespace-nowrap">{kindLabels[upload.kind]}</TableCell>
              <TableCell className="max-w-56 truncate" title={upload.file_name}>
                {upload.file_name}
              </TableCell>
              <TableCell className="text-right">
                {upload.row_count !== null ? numberFormat.format(upload.row_count) : '-'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn(STATUS_CLASS[upload.status])}>
                  {statusLabels[upload.status]}
                </Badge>
              </TableCell>
              <TableCell
                className={cn('min-w-56 whitespace-normal text-sm', upload.status === 'failed' && 'text-red-600')}
              >
                {describeResult(upload, t)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-[#5A6778]">
                {format(new Date(upload.uploaded_at), 'yyyy-MM-dd HH:mm')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
