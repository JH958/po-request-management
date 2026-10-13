/**
 * 판매주문조회·DO등록현황조회 업로드 패널 — 파일 선택, 기준일 확인, 처리 진행·결과 표시
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SourceFileSlot } from '@/components/po-upload/SourceFileSlot';
import { UploadResultSummary } from '@/components/po-upload/UploadResultSummary';
import { uploadDoFile, uploadSalesOrderFile } from '@/lib/po-upload-api';
import { getUploadKindLabels } from '@/lib/po-tracker-labels';
import { translateNow as tn, type Translate } from '@/lib/i18n';
import { useLanguage } from '@/context/LanguageContext';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type {
  DoSnapshotSummary,
  PoUploadKind,
  PreparedSourceFile,
  SoSnapshotSummary,
} from '@/types/po-upload';

interface PoUploadPanelProps {
  latestDates: Record<PoUploadKind, string | null>;
  /** 처리 후 이력·마지막 기준일 다시 조회 */
  onProcessed: () => Promise<void>;
}

/** unselected: 이번 처리에서 선택하지 않은 파일 (진행 목록에 표시 안 함) */
type StepStatus = 'waiting' | 'running' | 'done' | 'error' | 'skipped' | 'unselected';

interface StepState {
  status: StepStatus;
  message: string;
  percent?: number;
}

/** 처리 순서: 판매주문조회 먼저 (DO 비교 시 재등록 대기·신규 라인 판정에 사용) */
const KINDS: PoUploadKind[] = ['sales_order', 'do'];

/** message가 비어 있으면 상태별 기본 문구(대기·완료)를 화면에서 표시 */
const IDLE_STEPS: Record<PoUploadKind, StepState> = {
  sales_order: { status: 'waiting', message: '' },
  do: { status: 'waiting', message: '' },
};

/**
 * 기준일 검사 — 비어 있거나 마지막 처리일 이전이면 오류 문구
 */
const validateDate = (date: string, latest: string | null, t: Translate): string | null => {
  if (!date) return t('기준일을 입력해주세요.', 'Enter the snapshot date.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return t('날짜 형식이 올바르지 않습니다.', 'The date format is invalid.');
  if (latest && date <= latest) {
    return t(`마지막 처리 기준일(${latest}) 이후 날짜여야 합니다.`, `The date must be after the last processed date (${latest}).`);
  }
  return null;
};

const StepIcon = ({ status }: { status: StepStatus }) => {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-[#8B1538]" />;
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-600" />;
  return <Circle className="h-4 w-4 text-gray-300" />;
};

export const PoUploadPanel = ({ latestDates, onProcessed }: PoUploadPanelProps) => {
  const { t } = useLanguage();
  const kindLabels = getUploadKindLabels(t);
  const [files, setFiles] = useState<Record<PoUploadKind, PreparedSourceFile | null>>({
    sales_order: null,
    do: null,
  });
  const [dates, setDates] = useState<Record<PoUploadKind, string>>({ sales_order: '', do: '' });
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<PoUploadKind, StepState>>(IDLE_STEPS);
  const [soSummary, setSoSummary] = useState<SoSnapshotSummary | null>(null);
  const [doSummary, setDoSummary] = useState<DoSnapshotSummary | null>(null);

  // 처리 중 페이지를 떠나면 업로드가 중단되므로 경고
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  const dateErrors = useMemo(
    () => ({
      sales_order: files.sales_order ? validateDate(dates.sales_order, latestDates.sales_order, t) : null,
      do: files.do ? validateDate(dates.do, latestDates.do, t) : null,
    }),
    [files, dates, latestDates, t]
  );

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (files.do && !files.sales_order) {
      list.push(
        t(
          '판매주문조회 없이 DO만 올리면 마지막으로 반영한 판매주문조회 기준으로 DO 재등록 대기·삭제를 판정합니다.',
          'Uploading only the DO file uses the last processed sales order list to decide pending re-registration and removals.'
        )
      );
    }
    if (files.do && files.sales_order && dates.do && dates.sales_order && dates.do !== dates.sales_order) {
      list.push(
        t(
          `두 파일의 기준일이 다릅니다 (판매주문조회 ${dates.sales_order}, DO ${dates.do}). 같은 날 받은 파일인지 확인해주세요.`,
          `The two files have different dates (sales orders ${dates.sales_order}, DO ${dates.do}). Check that they were exported on the same day.`
        )
      );
    }
    return list;
  }, [files, dates, t]);

  const selectedKinds = KINDS.filter((kind) => files[kind]);
  const canStart =
    !running && selectedKinds.length > 0 && selectedKinds.every((kind) => !dateErrors[kind]);

  const updateStep = (kind: PoUploadKind, next: StepState) =>
    setSteps((prev) => ({ ...prev, [kind]: next }));

  const handlePrepared = (kind: PoUploadKind) => (prepared: PreparedSourceFile | null) => {
    setFiles((prev) => ({ ...prev, [kind]: prepared }));
    setSteps(IDLE_STEPS);
  };

  const handleStart = async () => {
    if (!canStart) return;
    setRunning(true);
    setSoSummary(null);
    setDoSummary(null);
    setSteps({
      sales_order: files.sales_order ? IDLE_STEPS.sales_order : { status: 'unselected', message: '' },
      do: files.do ? IDLE_STEPS.do : { status: 'unselected', message: '' },
    });

    const processed: PoUploadKind[] = [];
    try {
      for (const kind of KINDS) {
        const prepared = files[kind];
        if (!prepared) continue;

        const onProgress = (message: string, percent?: number) =>
          updateStep(kind, { status: 'running', message, percent });

        try {
          if (prepared.parsed.kind === 'sales_order') {
            const summary = await uploadSalesOrderFile(
              prepared.file, prepared.fileHash, dates.sales_order, prepared.parsed, onProgress
            );
            setSoSummary(summary);
          } else {
            const summary = await uploadDoFile(prepared.file, prepared.fileHash, dates.do, prepared.parsed, onProgress);
            setDoSummary(summary);
          }
          updateStep(kind, { status: 'done', message: '' });
          processed.push(kind);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`${kind} 처리 실패:`, error);
          }
          const message = getReadableErrorMessage(error);
          updateStep(kind, { status: 'error', message });
          // 판매주문조회가 실패하면 DO는 진행하지 않음 (판정 기준이 어긋나므로)
          if (kind === 'sales_order' && files.do) {
            updateStep('do', {
              status: 'skipped',
              message: tn('판매주문조회 실패로 진행하지 않음', 'Skipped because the sales order upload failed'),
            });
          }
          toast.error(
            tn(`${getUploadKindLabels(tn)[kind]} 처리에 실패했습니다.`, `${getUploadKindLabels(tn)[kind]} upload failed.`),
            { description: message }
          );
          break;
        }
      }

      if (processed.length > 0) {
        const names = processed.map((k) => getUploadKindLabels(tn)[k]).join(', ');
        toast.success(tn(`${names} 처리를 완료했습니다.`, `${names} processed.`));
        setFiles((prev) => {
          const next = { ...prev };
          processed.forEach((k) => {
            next[k] = null;
          });
          return next;
        });
        setDates((prev) => {
          const next = { ...prev };
          processed.forEach((k) => {
            next[k] = '';
          });
          return next;
        });
      }
    } finally {
      setRunning(false);
      await onProcessed();
    }
  };

  const showSteps = KINDS.some((kind) => steps[kind].status !== 'waiting');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {KINDS.map((kind) => (
          <SourceFileSlot
            key={kind}
            kind={kind}
            latestDate={latestDates[kind]}
            prepared={files[kind]}
            snapshotDate={dates[kind]}
            dateError={dateErrors[kind]}
            disabled={running}
            onPrepared={handlePrepared(kind)}
            onDateChange={(date) => setDates((prev) => ({ ...prev, [kind]: date }))}
          />
        ))}
      </div>

      {warnings.map((warning) => (
        <Alert key={warning}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5A6778]">
          {t(
            '판매주문조회 → DO등록현황조회 순서로 처리합니다. 처리 중에는 페이지를 닫지 마세요.',
            'Files are processed in order: sales orders, then DO. Keep this page open while processing.'
          )}
        </p>
        <Button
          onClick={() => void handleStart()}
          disabled={!canStart}
          className="bg-[#8B1538] hover:bg-[#74112F]"
        >
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {running ? t('처리 중…', 'Processing…') : t('업로드 시작', 'Start upload')}
        </Button>
      </div>

      {showSteps ? (
        <div className="space-y-3 rounded-lg border bg-white p-5">
          {KINDS.filter((kind) => steps[kind].status !== 'unselected').map((kind) => {
            const step = steps[kind];
            return (
              <div key={kind} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <StepIcon status={step.status} />
                  <span className="font-medium text-[#172132]">{kindLabels[kind]}</span>
                  <span className={step.status === 'error' ? 'text-red-600' : 'text-[#5A6778]'}>
                    {step.message ||
                      (step.status === 'done' ? t('완료', 'Done') : t('대기', 'Waiting'))}
                  </span>
                </div>
                {step.status === 'running' && step.percent !== undefined ? (
                  <Progress value={step.percent} className="h-1.5" />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <UploadResultSummary soSummary={soSummary} doSummary={doSummary} />
    </div>
  );
};
