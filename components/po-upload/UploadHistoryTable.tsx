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
import { UPLOAD_KIND_LABELS } from '@/lib/po-upload-parser';
import { UPLOAD_STATUS_LABELS } from '@/lib/po-tracker-labels';
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
const describeResult = (upload: PoSourceUpload): string => {
  if (upload.status === 'failed') return upload.error_message ?? '처리 실패';
  if (upload.status === 'processing' || !upload.summary) return '-';

  if (upload.kind === 'sales_order') {
    const s = upload.summary as SoSnapshotSummary;
    return `주문 ${numberFormat.format(s.orders)} · 미출고 라인 ${numberFormat.format(s.open_so_lines)} · 미분류 품목 ${numberFormat.format(s.unclassified_items)}`;
  }

  const s = upload.summary as DoSnapshotSummary;
  if (s.baseline) return `기준선 저장 (라인 ${numberFormat.format(s.order_lines ?? 0)})`;
  return `변경 ${numberFormat.format(countDoEvents(s))} · 신규 주문 ${numberFormat.format(s.new_orders ?? 0)} · 재등록 대기 ${numberFormat.format(s.pending_lines ?? 0)}`;
};

export const UploadHistoryTable = ({ uploads, loading, error }: UploadHistoryTableProps) => {
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
    return <p className="py-10 text-center text-sm text-[#67767F]">아직 업로드한 파일이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">기준일</TableHead>
            <TableHead className="whitespace-nowrap">종류</TableHead>
            <TableHead>파일명</TableHead>
            <TableHead className="whitespace-nowrap text-right">행 수</TableHead>
            <TableHead className="whitespace-nowrap">상태</TableHead>
            <TableHead>결과</TableHead>
            <TableHead className="whitespace-nowrap">업로드 시각</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((upload) => (
            <TableRow key={upload.id}>
              <TableCell className="whitespace-nowrap font-medium">{upload.snapshot_date}</TableCell>
              <TableCell className="whitespace-nowrap">{UPLOAD_KIND_LABELS[upload.kind]}</TableCell>
              <TableCell className="max-w-56 truncate" title={upload.file_name}>
                {upload.file_name}
              </TableCell>
              <TableCell className="text-right">
                {upload.row_count !== null ? numberFormat.format(upload.row_count) : '-'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn(STATUS_CLASS[upload.status])}>
                  {UPLOAD_STATUS_LABELS[upload.status]}
                </Badge>
              </TableCell>
              <TableCell
                className={cn('min-w-56 whitespace-normal text-sm', upload.status === 'failed' && 'text-red-600')}
              >
                {describeResult(upload)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-[#67767F]">
                {format(new Date(upload.uploaded_at), 'yyyy-MM-dd HH:mm')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
