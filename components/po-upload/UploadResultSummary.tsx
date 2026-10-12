/**
 * 업로드 처리 결과 요약 (판매주문조회·DO등록현황조회)
 */
'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DO_CHANGE_TYPE_LABELS } from '@/lib/po-tracker-labels';
import type { DoChangeType, DoSnapshotSummary, SoSnapshotSummary } from '@/types/po-upload';

interface UploadResultSummaryProps {
  soSummary: SoSnapshotSummary | null;
  doSummary: DoSnapshotSummary | null;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

const Stat = ({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) => (
  <div className="rounded-md border bg-white px-4 py-3">
    <p className="text-xs text-[#67767F]">{label}</p>
    <p className={`mt-1 text-xl font-semibold ${emphasize && value > 0 ? 'text-[#971B2F]' : 'text-[#101820]'}`}>
      {numberFormat.format(value)}
    </p>
  </div>
);

/**
 * DO 변경 이벤트 합계
 */
export const countDoEvents = (summary: DoSnapshotSummary): number =>
  Object.values(summary.events ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);

export const UploadResultSummary = ({ soSummary, doSummary }: UploadResultSummaryProps) => {
  if (!soSummary && !doSummary) return null;

  return (
    <div className="space-y-5">
      {soSummary ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold text-[#101820]">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> 판매주문조회 반영 완료
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="판매주문" value={soSummary.orders} />
            <Stat label="품목" value={soSummary.items} />
            <Stat label="미출고 SO 라인" value={soSummary.open_so_lines} />
            <Stat label="미분류 품목" value={soSummary.unclassified_items} emphasize />
          </div>
          {soSummary.unclassified_items > 0 ? (
            <p className="text-sm text-[#67767F]">
              세부분류 매핑에 없는 카테고리의 품목이 있습니다. 관리자 설정에서 구분을 지정하면 통계에 반영됩니다.
            </p>
          ) : null}
        </section>
      ) : null}

      {doSummary ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold text-[#101820]">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> DO등록현황조회 비교 완료
          </h3>

          {doSummary.baseline ? (
            <Alert>
              <AlertTitle>첫 업로드 — 기준선으로 저장했습니다</AlertTitle>
              <AlertDescription>
                판매주문 라인 {numberFormat.format(doSummary.order_lines ?? 0)}개(미종료{' '}
                {numberFormat.format(doSummary.open_order_lines ?? 0)}개)의 현재 상태를 저장했습니다. 다음 업로드부터
                이 상태와 비교해 변경을 찾습니다.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="변경 이벤트" value={countDoEvents(doSummary)} emphasize />
                <Stat label="신규 주문" value={doSummary.new_orders ?? 0} />
                <Stat label="DO 재등록 대기 라인" value={doSummary.pending_lines ?? 0} />
                <Stat label="품목코드 변경 후보" value={doSummary.item_change_candidates ?? 0} />
              </div>

              <div className="flex flex-wrap gap-2">
                {(Object.keys(DO_CHANGE_TYPE_LABELS) as DoChangeType[]).map((type) => {
                  const count = doSummary.events?.[type] ?? 0;
                  return (
                    <span
                      key={type}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        count > 0 ? 'border-[#971B2F]/30 bg-[#971B2F]/5 text-[#101820]' : 'text-[#67767F]'
                      }`}
                    >
                      {DO_CHANGE_TYPE_LABELS[type]} {numberFormat.format(count)}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {doSummary.so_snapshot_stale ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>같은 날짜의 판매주문조회가 없습니다</AlertTitle>
              <AlertDescription>
                {doSummary.so_snapshot_date
                  ? `${doSummary.so_snapshot_date} 판매주문조회 기준으로 DO 재등록 대기·삭제를 판정했습니다.`
                  : '판매주문조회가 한 번도 반영되지 않아 사라진 라인은 바로 삭제로 판정했습니다.'}{' '}
                판정을 정확하게 하려면 같은 날짜의 판매주문조회를 함께 올려주세요.
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
