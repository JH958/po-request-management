/**
 * 판매주문조회·DO등록현황조회 엑셀 파싱 유틸리티 (브라우저에서 실행)
 */
import type {
  DoRowPayload,
  ParsedDoFile,
  ParsedSalesOrderFile,
  PoUploadKind,
  PreparedSourceFile,
  SoItemPayload,
  SoLinePayload,
  SoOrderPayload,
} from '@/types/po-upload';

type SheetRow = Record<string, unknown>;

/** 판매주문조회 필수 열 */
export const SALES_ORDER_REQUIRED_COLUMNS = [
  '판매주문',
  '계정 번호',
  '이름',
  'H_Status',
  '라인번호',
  '품목유형',
  '품목번호',
  '품목명',
  '카테고리 모델',
  '입고예정',
  '출고 완료',
  '잔여 배송',
  '상태_라인',
] as const;

/** DO등록현황조회 필수 열 */
export const DO_REQUIRED_COLUMNS = [
  '참조',
  '주문 번호',
  '납품 모드',
  'H_Status',
  '출고 창고',
  '입고창고',
  '선적 일자',
  '입고 일자',
  '라인번호',
  '품목번호',
  '품목명',
  '이전 수량',
  '등록 수량',
  '선적된 수량',
  'L_Status',
  '배송오더 번호',
  '요청받은 배송 일자',
  '영업 확정',
  '물류 확정',
  '종료',
] as const;

export const UPLOAD_KIND_LABELS: Record<PoUploadKind, string> = {
  sales_order: '판매주문조회',
  do: 'DO등록현황조회',
};

/**
 * 파일명 끝 6자리(YYMMDD)에서 기준일 추출
 *
 * @example parseSnapshotDateFromFileName('DO등록현황조회_2601_2712_261008.xlsx') // '2026-10-08'
 */
export const parseSnapshotDateFromFileName = (fileName: string): string | null => {
  const match = fileName.match(/(\d{2})(\d{2})(\d{2})\.xlsx?$/i);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  const iso = `20${yy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

/** 빈 값은 null, 나머지는 앞뒤 공백 제거한 문자열 */
const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

/** 숫자로 변환 (빈 값·숫자 아님은 0) */
const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 수량은 정수로 */
const toInt = (value: unknown): number => Math.round(toNumber(value));

/** 엑셀 날짜(일련번호·문자열·Date)를 YYYY-MM-DD로 */
const toIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

const isYes = (value: unknown): boolean => toText(value) === '예';

/** 헤더로 파일 종류 판별 */
export const detectUploadKind = (headers: string[]): PoUploadKind | null => {
  if (headers.includes('배송오더 번호') && headers.includes('이전 수량')) return 'do';
  if (headers.includes('판매주문') && headers.includes('카테고리 모델')) return 'sales_order';
  return null;
};

/**
 * 첫 시트를 행 객체 배열로 읽기 (xlsx는 필요할 때만 불러옴)
 */
const readFirstSheet = async (buffer: ArrayBuffer): Promise<{ headers: string[]; rows: SheetRow[] }> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: true })[0] ?? []) as unknown[];
  const headers = headerRow.map((h) => String(h ?? '').trim());
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: true });
  return { headers, rows };
};

/**
 * 판매주문조회 → 고객처 매핑·품목 카테고리·미출고 SO 라인
 */
export const parseSalesOrderRows = (rows: SheetRow[]): ParsedSalesOrderFile => {
  const orders = new Map<string, SoOrderPayload>();
  const items = new Map<string, SoItemPayload>();
  const lines: SoLinePayload[] = [];

  for (const row of rows) {
    const ord = toText(row['판매주문']);
    const item = toText(row['품목번호']);
    if (!ord) continue;

    orders.set(ord, { ord, acct: toText(row['계정 번호']), name: toText(row['이름']) });

    if (item) {
      const category = toText(row['카테고리 모델']);
      // 같은 품목이 여러 행이면 카테고리가 있는 값을 우선
      if (!items.has(item) || (category && !items.get(item)?.cat)) {
        items.set(item, { item, nm: toText(row['품목명']), cat: category, typ: toText(row['품목유형']) });
      }
    }

    const lineStatus = toText(row['상태_라인']);
    const remaining = toInt(row['잔여 배송']);
    if (item && (lineStatus !== 'INVOICED' || remaining > 0)) {
      lines.push({
        ord,
        ln: toInt(row['라인번호']),
        item,
        nm: toText(row['품목명']),
        q_ord: toInt(row['입고예정']),
        q_shp: toInt(row['출고 완료']),
        q_rem: remaining,
        ls: lineStatus,
        hs: toText(row['H_Status']),
      });
    }
  }

  return {
    kind: 'sales_order',
    rowCount: rows.length,
    orders: [...orders.values()],
    items: [...items.values()],
    lines,
  };
};

/**
 * DO등록현황조회 → apply_do_snapshot 입력 행 (중복 키 합산은 DB에서 처리)
 */
export const parseDoRows = (rows: SheetRow[]): ParsedDoFile => {
  const payload: DoRowPayload[] = [];

  for (const row of rows) {
    const ord = toText(row['주문 번호']);
    const dn = toText(row['배송오더 번호']);
    const item = toText(row['품목번호']);
    const lineNo = row['라인번호'];
    if (!ord || !dn || !item || lineNo === null || lineNo === undefined || lineNo === '') continue;

    payload.push({
      ord,
      ln: toNumber(lineNo),
      dn,
      tr: toText(row['참조']) !== '판매주문',
      mode: toText(row['납품 모드']),
      hs: toText(row['H_Status']),
      ls: toText(row['L_Status']),
      wo: toText(row['출고 창고']),
      wi: toText(row['입고창고']),
      sd: toIsoDate(row['선적 일자']),
      rd: toIsoDate(row['입고 일자']),
      qd: toIsoDate(row['요청받은 배송 일자']),
      item,
      nm: toText(row['품목명']),
      q_ord: toInt(row['이전 수량']),
      q_reg: toInt(row['등록 수량']),
      q_shp: toInt(row['선적된 수량']),
      scf: isYes(row['영업 확정']),
      lcf: isYes(row['물류 확정']),
      closed: isYes(row['종료']),
    });
  }

  return {
    kind: 'do',
    rowCount: rows.length,
    rows: payload,
    openRowCount: payload.filter((r) => !r.closed).length,
  };
};

/** 파일 내용 SHA-256 (같은 파일 중복 업로드 방지) */
const computeFileHash = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * 선택한 파일을 읽고 형식 검사 후 업로드 준비
 *
 * @param file - 선택한 xlsx 파일
 * @param expectedKind - 이 칸에 올려야 하는 파일 종류
 * @throws 다른 종류의 파일이거나 필수 열이 없으면 한글 메시지로 오류
 */
export const prepareSourceFile = async (
  file: File,
  expectedKind: PoUploadKind
): Promise<PreparedSourceFile> => {
  if (!/\.xlsx?$/i.test(file.name)) {
    throw new Error('엑셀 파일(.xlsx)만 올릴 수 있습니다.');
  }

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await readFirstSheet(buffer);

  const kind = detectUploadKind(headers);
  if (kind && kind !== expectedKind) {
    throw new Error(
      `${UPLOAD_KIND_LABELS[kind]} 파일입니다. ${UPLOAD_KIND_LABELS[expectedKind]} 칸에 맞는 파일을 선택해주세요.`
    );
  }

  const required = expectedKind === 'do' ? DO_REQUIRED_COLUMNS : SALES_ORDER_REQUIRED_COLUMNS;
  const missing = required.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(`필수 열이 없습니다: ${missing.join(', ')}`);
  }

  if (rows.length === 0) {
    throw new Error('데이터 행이 없습니다.');
  }

  const parsed = expectedKind === 'do' ? parseDoRows(rows) : parseSalesOrderRows(rows);

  return {
    file,
    fileHash: await computeFileHash(buffer),
    detectedDate: parseSnapshotDateFromFileName(file.name),
    parsed,
  };
};
