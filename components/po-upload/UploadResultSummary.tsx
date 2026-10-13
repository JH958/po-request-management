/**
 * 업로드 처리 결과 요약 (판매주문조회·DO등록현황조회)
 */
'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DO_CHANGE_TYPES, getDoChangeTypeLabels } from '@/lib/po-tracker-labels';
import { useLanguage } from '@/context/LanguageContext';
import type { DoSnapshotSummary, SoSnapshotSummary } from '@/types/po-upload';

interface UploadResultSummaryProps {
  soSummary: SoSnapshotSummary | null;
  doSummary: DoSnapshotSummary | null;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

const Stat = ({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) => (
  <div className="rounded-md border bg-white px-4 py-3">
    <p className="text-xs text-[#5A6778]">{label}</p>
    <p className={`mt-1 text-xl font-semibold ${emphasize && value > 0 ? 'text-[#8B1538]' : 'text-[#172132]'}`}>
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
  const { t } = useLanguage();
  if (!soSummary && !doSummary) return null;
  const changeTypeLabels = getDoChangeTypeLabels(t);

  return (
    <div className="space-y-5">
      {soSummary ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold text-[#172132]">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> {t('판매주문조회 반영 완료', 'Sales order list processed')}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('판매주문', 'Sales orders')} value={soSummary.orders} />
            <Stat label={t('품목', 'Items')} value={soSummary.items} />
            <Stat label={t('미출고 SO 라인', 'Open SO lines')} value={soSummary.open_so_lines} />
            <Stat label={t('미분류 품목', 'Unclassified items')} value={soSummary.unclassified_items} emphasize />
          </div>
          {soSummary.unclassified_items > 0 ? (
            <p className="text-sm text-[#5A6778]">
              {t(
                '세부분류 매핑에 없는 카테고리의 품목이 있습니다. 관리자 설정에서 구분을 지정하면 통계에 반영됩니다.',
                'Some items belong to categories missing from the subcategory mapping. Assign them in Admin Settings to include them in statistics.'
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      {doSummary ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold text-[#172132]">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> {t('DO등록현황조회 비교 완료', 'DO registration status compared')}
          </h3>

          {doSummary.baseline ? (
            <Alert>
              <AlertTitle>{t('첫 업로드 — 기준선으로 저장했습니다', 'First upload — saved as the baseline')}</AlertTitle>
              <AlertDescription>
                {t(
                  `판매주문 라인 ${numberFormat.format(doSummary.order_lines ?? 0)}개(미종료 ${numberFormat.format(doSummary.open_order_lines ?? 0)}개)의 현재 상태를 저장했습니다. 다음 업로드부터 이 상태와 비교해 변경을 찾습니다.`,
                  `Saved the current state of ${numberFormat.format(doSummary.order_lines ?? 0)} sales order lines (${numberFormat.format(doSummary.open_order_lines ?? 0)} open). Changes will be detected against this state from the next upload.`
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Stat label={t('변경 이벤트', 'Change events')} value={countDoEvents(doSummary)} emphasize />
                <Stat label={t('신규 주문', 'New orders')} value={doSummary.new_orders ?? 0} />
                <Stat label={t('DO 재등록 대기 라인', 'Lines pending DO re-registration')} value={doSummary.pending_lines ?? 0} />
                <Stat label={t('분할/합배송 후보', 'Split shipment candidates')} value={doSummary.split_candidates ?? 0} emphasize />
                <Stat label={t('품목코드 변경 후보', 'Item code change candidates')} value={doSummary.item_change_candidates ?? 0} />
              </div>

              <div className="flex flex-wrap gap-2">
                {DO_CHANGE_TYPES.map((type) => {
                  const count = doSummary.events?.[type] ?? 0;
                  return (
                    <span
                      key={type}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        count > 0 ? 'border-[#8B1538]/30 bg-[#8B1538]/5 text-[#172132]' : 'text-[#5A6778]'
                      }`}
                    >
                      {changeTypeLabels[type]} {numberFormat.format(count)}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {doSummary.so_snapshot_stale ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('같은 날짜의 판매주문조회가 없습니다', 'No sales order list for the same date')}</AlertTitle>
              <AlertDescription>
                {doSummary.so_snapshot_date
                  ? t(
                      `${doSummary.so_snapshot_date} 판매주문조회 기준으로 DO 재등록 대기·삭제를 판정했습니다.`,
                      `Pending re-registration and removals were judged using the ${doSummary.so_snapshot_date} sales order list.`
                    )
                  : t(
                      '판매주문조회가 한 번도 반영되지 않아 사라진 라인은 바로 삭제로 판정했습니다.',
                      'No sales order list has been processed yet, so missing lines were treated as removed.'
                    )}{' '}
                {t(
                  '판정을 정확하게 하려면 같은 날짜의 판매주문조회를 함께 올려주세요.',
                  'For accurate results, upload the sales order list from the same date.'
                )}
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
