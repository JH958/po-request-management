/**
 * 업로드 파일 한 종류(판매주문조회 또는 DO등록현황조회)를 선택·검사하는 칸
 */
'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prepareSourceFile } from '@/lib/po-upload-parser';
import { getUploadKindLabels } from '@/lib/po-tracker-labels';
import { getIntlLocale } from '@/lib/i18n';
import { useLanguage } from '@/context/LanguageContext';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { cn } from '@/lib/utils';
import type { PoUploadKind, PreparedSourceFile } from '@/types/po-upload';

interface SourceFileSlotProps {
  kind: PoUploadKind;
  /** 이 종류로 마지막 처리 완료한 기준일 */
  latestDate: string | null;
  prepared: PreparedSourceFile | null;
  snapshotDate: string;
  /** 기준일 검사 오류 (상위에서 계산) */
  dateError: string | null;
  disabled: boolean;
  onPrepared: (prepared: PreparedSourceFile | null) => void;
  onDateChange: (date: string) => void;
}

/** 파일명 예시 (ERP에서 내려받는 실제 파일명) */
const FILE_EXAMPLES: Record<PoUploadKind, string> = {
  sales_order: '판매주문조회_2601_2612_261008.xlsx',
  do: 'DO등록현황조회_2601_2712_261008.xlsx',
};

export const SourceFileSlot = ({
  kind,
  latestDate,
  prepared,
  snapshotDate,
  dateError,
  disabled,
  onPrepared,
  onDateChange,
}: SourceFileSlotProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputId = `po-upload-${kind}`;
  const { t, lang } = useLanguage();
  const kindLabel = getUploadKindLabels(t)[kind];
  const numberFormat = new Intl.NumberFormat(getIntlLocale(lang));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    setParsing(true);
    onPrepared(null);
    try {
      // 큰 파일을 읽는 동안 "읽는 중" 표시가 먼저 그려지도록 한 박자 양보
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = await prepareSourceFile(file, kind);
      onPrepared(result);
      onDateChange(result.detectedDate ?? '');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`${kind} 파일 읽기 실패:`, error);
      }
      setParseError(getReadableErrorMessage(error));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = () => {
    onPrepared(null);
    onDateChange('');
    setParseError(null);
  };

  const parsed = prepared?.parsed;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[#172132]">{kindLabel}</h3>
          <p className="mt-0.5 text-xs text-[#5A6778]">
            {t('마지막 처리 기준일', 'Last processed')}: {latestDate ?? t('없음 (첫 업로드)', 'None (first upload)')}
          </p>
        </div>
        {prepared && !disabled ? (
          <Button variant="ghost" size="icon" onClick={clear} aria-label={t(`${kindLabel} 파일 선택 취소`, `Remove the selected ${kindLabel} file`)}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && !parsing && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !parsing) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && !parsing) void handleFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors',
          dragOver ? 'border-[#8B1538] bg-[#8B1538]/5' : 'border-gray-200 hover:border-gray-300',
          disabled && 'cursor-not-allowed opacity-60',
          parseError && 'border-red-300'
        )}
      >
        {parsing ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-[#8B1538]" />
            <p className="text-sm text-[#5A6778]">{t('파일을 읽는 중입니다…', 'Reading the file…')}</p>
          </>
        ) : prepared && parsed ? (
          <>
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <p className="break-all text-sm font-medium text-[#172132]">{prepared.file.name}</p>
            <p className="text-xs text-[#5A6778]">
              {t(`${numberFormat.format(parsed.rowCount)}행`, `${numberFormat.format(parsed.rowCount)} rows`)}
              {parsed.kind === 'do'
                ? t(
                    ` · 미종료 ${numberFormat.format(parsed.openRowCount)}행`,
                    ` · ${numberFormat.format(parsed.openRowCount)} open`
                  )
                : t(
                    ` · 주문 ${numberFormat.format(parsed.orders.length)}건 · 미출고 라인 ${numberFormat.format(parsed.lines.length)}개`,
                    ` · ${numberFormat.format(parsed.orders.length)} orders · ${numberFormat.format(parsed.lines.length)} open SO lines`
                  )}
            </p>
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-6 w-6 text-[#5A6778]" />
            <p className="text-sm text-[#172132]">{t('클릭하거나 파일을 끌어다 놓으세요', 'Click or drag a file here')}</p>
            <p className="text-xs text-[#5A6778]">
              {t('예', 'e.g.')}: {FILE_EXAMPLES[kind]}
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {parseError ? <p className="text-sm text-red-600">{parseError}</p> : null}

      {prepared ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${inputId}-date`}>{t('기준일', 'Snapshot date')}</Label>
          <Input
            id={`${inputId}-date`}
            type="date"
            value={snapshotDate}
            disabled={disabled}
            onChange={(e) => onDateChange(e.target.value)}
            aria-invalid={Boolean(dateError)}
          />
          {dateError ? (
            <p className="text-sm text-red-600">{dateError}</p>
          ) : (
            <p className="text-xs text-[#5A6778]">
              {prepared.detectedDate
                ? t('파일명에서 읽은 날짜입니다. 다르면 고쳐주세요.', 'Read from the file name. Correct it if needed.')
                : t('파일명에서 날짜를 찾지 못했습니다. 직접 입력해주세요.', 'No date found in the file name. Please enter it.')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
