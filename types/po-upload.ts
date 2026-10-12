/**
 * PO Tracker 데이터 업로드(판매주문조회·DO등록현황조회) 타입 정의
 */

/** 업로드 파일 종류 */
export type PoUploadKind = 'sales_order' | 'do';

/** 업로드 처리 상태 */
export type PoUploadStatus = 'processing' | 'completed' | 'failed';

/** DO 변경 이벤트 유형 */
export type DoChangeType =
  | 'line_added'
  | 'line_removed'
  | 'qty_increased'
  | 'qty_decreased'
  | 'shipment_shortfall'
  | 'delivery_date_changed'
  | 'delivery_mode_changed'
  | 'item_changed';

/** 판매주문조회 처리 결과 요약 */
export interface SoSnapshotSummary {
  orders: number;
  items: number;
  open_so_lines: number;
  unclassified_items: number;
}

/** DO등록현황조회 처리 결과 요약 */
export interface DoSnapshotSummary {
  baseline: boolean;
  so_snapshot_date: string | null;
  /** 기준선 업로드에만 있음 */
  order_lines?: number;
  open_order_lines?: number;
  /** 비교 업로드에만 있음 */
  events?: Partial<Record<DoChangeType, number>>;
  new_orders?: number;
  pending_lines?: number;
  item_change_candidates?: number;
  so_snapshot_stale?: boolean;
}

/** 업로드 이력 (po_source_uploads) */
export interface PoSourceUpload {
  id: string;
  kind: PoUploadKind;
  snapshot_date: string;
  file_name: string;
  storage_path: string | null;
  row_count: number | null;
  status: PoUploadStatus;
  is_baseline: boolean;
  summary: SoSnapshotSummary | DoSnapshotSummary | null;
  error_message: string | null;
  uploaded_at: string;
  completed_at: string | null;
}

/** 판매주문 → 고객처 */
export interface SoOrderPayload {
  ord: string;
  acct: string | null;
  name: string | null;
}

/** 품목 → 카테고리 모델 */
export interface SoItemPayload {
  item: string;
  nm: string | null;
  cat: string | null;
  typ: string | null;
}

/** 미출고 SO 라인 */
export interface SoLinePayload {
  ord: string;
  ln: number;
  item: string;
  nm: string | null;
  q_ord: number;
  q_shp: number;
  q_rem: number;
  ls: string | null;
  hs: string | null;
}

/** DO등록현황조회 행 (apply_do_snapshot 입력 형식) */
export interface DoRowPayload {
  ord: string;
  ln: number;
  dn: string;
  tr: boolean;
  mode: string | null;
  hs: string | null;
  ls: string | null;
  wo: string | null;
  wi: string | null;
  sd: string | null;
  rd: string | null;
  qd: string | null;
  item: string;
  nm: string | null;
  q_ord: number;
  q_reg: number;
  q_shp: number;
  scf: boolean;
  lcf: boolean;
  closed: boolean;
}

/** 판매주문조회 파싱 결과 */
export interface ParsedSalesOrderFile {
  kind: 'sales_order';
  rowCount: number;
  orders: SoOrderPayload[];
  items: SoItemPayload[];
  lines: SoLinePayload[];
}

/** DO등록현황조회 파싱 결과 */
export interface ParsedDoFile {
  kind: 'do';
  rowCount: number;
  rows: DoRowPayload[];
  openRowCount: number;
}

/** 업로드 대기 중인 파일 (선택 후 파싱 완료 상태) */
export interface PreparedSourceFile {
  file: File;
  fileHash: string;
  /** 파일명에서 읽은 기준일 (YYYY-MM-DD), 못 읽으면 null */
  detectedDate: string | null;
  parsed: ParsedSalesOrderFile | ParsedDoFile;
}
