/**
 * PO Tracker 데이터 업로드 Supabase API
 *
 * 처리 순서: start_po_upload → Storage 원본 저장 → apply_so_snapshot
 *           또는 stage_po_upload_chunk(나눠 보내기) → apply_do_snapshot
 * 비교·저장은 DB 함수가 한 트랜잭션으로 처리하므로 실패하면 반쯤 반영되는 일이 없습니다.
 */
import { createClient } from '@/lib/supabase/client';
import { asApiError, getReadableErrorMessage } from '@/lib/request-helpers';
import { translateNow as tn } from '@/lib/i18n';
import type {
  DoSnapshotSummary,
  ParsedDoFile,
  ParsedSalesOrderFile,
  PoSourceUpload,
  PoUploadKind,
  SoSnapshotSummary,
} from '@/types/po-upload';

/** 원본 파일 보관 버킷 */
const UPLOAD_BUCKET = 'po-tracker-uploads';

/** DO 행 한 번에 보내는 개수 (요청 1건 약 0.9MB) */
const DO_CHUNK_SIZE = 3000;


/**
 * Supabase 오류를 사용자용 한글 메시지로 변환 (DB 함수가 던진 한글 메시지는 그대로 사용)
 */
const formatUploadError = (error: unknown): string => {
  const err = asApiError(error);
  if (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202') {
    return tn(
      'PO Tracker 테이블이 없습니다. Supabase에서 migrations/add_po_tracker_do_tracking.sql을 실행해주세요.',
      'PO Tracker tables are missing. Run migrations/add_po_tracker_do_tracking.sql in Supabase.'
    );
  }
  if (err.code === '42501') {
    return tn('업로드 권한이 없습니다. 관리자에게 문의해주세요.', 'You do not have permission to upload. Please contact an administrator.');
  }
  return getReadableErrorMessage(error) || tn('업로드를 처리하지 못했습니다.', 'The upload could not be processed.');
};

const mapUploadRow = (row: Record<string, unknown>): PoSourceUpload => ({
  id: row.id as string,
  kind: row.kind as PoUploadKind,
  snapshot_date: row.snapshot_date as string,
  file_name: row.file_name as string,
  storage_path: (row.storage_path as string | null) ?? null,
  row_count: (row.row_count as number | null) ?? null,
  status: row.status as PoSourceUpload['status'],
  is_baseline: Boolean(row.is_baseline),
  summary: (row.summary as PoSourceUpload['summary']) ?? null,
  error_message: (row.error_message as string | null) ?? null,
  uploaded_at: row.uploaded_at as string,
  completed_at: (row.completed_at as string | null) ?? null,
});

/**
 * 최근 업로드 이력 조회
 */
export const fetchRecentUploads = async (limit = 20): Promise<PoSourceUpload[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_source_uploads')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(formatUploadError(error));
  return (data ?? []).map((row) => mapUploadRow(row as Record<string, unknown>));
};

/**
 * 종류별 마지막으로 처리 완료한 기준일
 */
export const fetchLatestCompletedDates = async (): Promise<Record<PoUploadKind, string | null>> => {
  const supabase = createClient();
  const latest = async (kind: PoUploadKind): Promise<string | null> => {
    const { data, error } = await supabase
      .from('po_source_uploads')
      .select('snapshot_date')
      .eq('kind', kind)
      .eq('status', 'completed')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(formatUploadError(error));
    return (data?.snapshot_date as string | undefined) ?? null;
  };

  const [salesOrder, doDate] = await Promise.all([latest('sales_order'), latest('do')]);
  return { sales_order: salesOrder, do: doDate };
};

/**
 * 처리 실패 기록 (기록 실패는 무시하고 원래 오류를 보여줌)
 */
export const failUpload = async (uploadId: string, message: string): Promise<void> => {
  try {
    const supabase = createClient();
    await supabase.rpc('fail_po_upload', { p_upload_id: uploadId, p_message: message.slice(0, 1000) });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('업로드 실패 기록 오류:', error);
    }
  }
};

/** 처리 단계 진행 콜백 */
export type UploadProgressHandler = (message: string, percent?: number) => void;

/**
 * 업로드 기록 생성 → 원본 저장 (공통 앞단계)
 */
const startAndStoreFile = async (
  kind: PoUploadKind,
  snapshotDate: string,
  file: File,
  fileHash: string,
  onProgress: UploadProgressHandler
): Promise<PoSourceUpload> => {
  const supabase = createClient();

  onProgress(tn('업로드 기록 생성 중', 'Creating upload record'));
  const { data, error } = await supabase.rpc('start_po_upload', {
    p_kind: kind,
    p_snapshot_date: snapshotDate,
    p_file_name: file.name,
    p_file_hash: fileHash,
  });
  if (error) throw new Error(formatUploadError(error));
  const upload = mapUploadRow(data as Record<string, unknown>);

  try {
    onProgress(tn('원본 파일 보관 중', 'Storing the original file'));
    const { error: storageError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(upload.storage_path as string, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });
    if (storageError) {
      throw new Error(`${tn('원본 파일을 보관하지 못했습니다', 'Could not store the original file')}: ${storageError.message}`);
    }
  } catch (error) {
    await failUpload(upload.id, getReadableErrorMessage(error));
    throw error;
  }

  return upload;
};

/**
 * 판매주문조회 업로드·반영
 */
export const uploadSalesOrderFile = async (
  file: File,
  fileHash: string,
  snapshotDate: string,
  parsed: ParsedSalesOrderFile,
  onProgress: UploadProgressHandler
): Promise<SoSnapshotSummary> => {
  const upload = await startAndStoreFile('sales_order', snapshotDate, file, fileHash, onProgress);

  try {
    onProgress(tn('고객처·품목 매핑 반영 중', 'Updating customer and item mappings'));
    const supabase = createClient();
    const { data, error } = await supabase.rpc('apply_so_snapshot', {
      p_upload_id: upload.id,
      p_orders: parsed.orders,
      p_items: parsed.items,
      p_lines: parsed.lines,
      p_row_count: parsed.rowCount,
    });
    if (error) throw new Error(formatUploadError(error));
    return data as SoSnapshotSummary;
  } catch (error) {
    await failUpload(upload.id, getReadableErrorMessage(error));
    throw error;
  }
};

/**
 * DO등록현황조회 업로드·비교
 */
export const uploadDoFile = async (
  file: File,
  fileHash: string,
  snapshotDate: string,
  parsed: ParsedDoFile,
  onProgress: UploadProgressHandler
): Promise<DoSnapshotSummary> => {
  const upload = await startAndStoreFile('do', snapshotDate, file, fileHash, onProgress);
  const supabase = createClient();

  try {
    const chunkCount = Math.ceil(parsed.rows.length / DO_CHUNK_SIZE);
    for (let i = 0; i < chunkCount; i++) {
      onProgress(
        `${tn('DO 행 전송 중', 'Sending DO rows')} (${i + 1}/${chunkCount})`,
        Math.round(((i + 1) / chunkCount) * 100)
      );
      const { error } = await supabase.rpc('stage_po_upload_chunk', {
        p_upload_id: upload.id,
        p_chunk_no: i,
        p_rows: parsed.rows.slice(i * DO_CHUNK_SIZE, (i + 1) * DO_CHUNK_SIZE),
      });
      if (error) throw new Error(formatUploadError(error));
    }

    onProgress(tn('직전 파일과 비교 중', 'Comparing with the previous file'));
    const { data, error } = await supabase.rpc('apply_do_snapshot', {
      p_upload_id: upload.id,
      p_row_count: parsed.rowCount,
    });
    if (error) throw new Error(formatUploadError(error));
    return data as DoSnapshotSummary;
  } catch (error) {
    await failUpload(upload.id, getReadableErrorMessage(error));
    throw error;
  }
};
