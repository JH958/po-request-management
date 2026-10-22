/**
 * PO 현황 대시보드 집계 유틸리티 — 기간·추이 단위·고객처 묶기·요청 출처 비중
 */
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  format,
  getQuarter,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subDays,
} from 'date-fns';
import type { Translate } from '@/lib/i18n';
import { koreanOnly } from '@/lib/i18n';
import { PRODUCTION_FUNCTION } from '@/lib/po-changes-utils';
import type {
  DashboardChangeRow,
  DashboardFilters,
  DashboardRequestRow,
  OriginBucket,
  PeriodPreset,
  RankedItem,
  TrendBucket,
  TrendUnit,
  TypeGroup,
} from '@/types/po-dashboard';

/** 브랜드 색 — 추가는 파랑, 삭제는 크림슨 (PO 변경 표와 같은 색) */
export const TYPE_GROUP_COLORS: Record<TypeGroup, string> = {
  add: '#1E40AF',
  delete: '#8B1538',
  shift: '#5A6778',
  group: '#B7791F',
  other: '#B8C1CE',
};

/** 요청 출처 색 — 고객처는 크림슨, 생산부는 파랑, 그 밖의 부서는 회색 */
export const ORIGIN_COLORS: Record<OriginBucket, string> = {
  customer: '#8B1538',
  production: '#1E40AF',
  department: '#8E98A8',
  missing: '#D6DDE7',
};

/** 기본 막대 색 (슬레이트) */
export const BAR_COLOR = '#5A6778';

/** 추이 막대 묶음 순서 */
export const TYPE_GROUP_ORDER: TypeGroup[] = ['add', 'delete', 'shift', 'group', 'other'];

/** 요청 출처 묶음 순서 */
export const ORIGIN_ORDER: OriginBucket[] = ['customer', 'production', 'department', 'missing'];

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * 기간 빠른 선택 → 시작·끝 날짜 (끝은 오늘)
 */
export const getPresetRange = (preset: Exclude<PeriodPreset, 'custom'>, today = new Date()): { from: string; to: string } => {
  const to = iso(today);
  if (preset === 'week') return { from: iso(startOfWeek(today, { weekStartsOn: 1 })), to };
  if (preset === '4weeks') return { from: iso(subDays(today, 27)), to };
  if (preset === 'month') return { from: iso(startOfMonth(today)), to };
  return { from: iso(startOfQuarter(today)), to };
};

/**
 * 비교용 직전 기간 (같은 길이로 바로 앞)
 */
export const getPreviousRange = (from: string, to: string): { from: string; to: string } => {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const prevTo = subDays(parseISO(from), 1);
  return { from: iso(subDays(prevTo, days - 1)), to: iso(prevTo) };
};

/**
 * 기간 길이에 맞는 기본 추이 단위 — 한 달 이내 일별, 넉 달 이내 주별, 1년 이내 월별, 3년 이내 분기별, 그 이상 연별
 */
export const getDefaultTrendUnit = (from: string, to: string): TrendUnit => {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 366) return 'month';
  if (days <= 1096) return 'quarter';
  return 'year';
};

/** 분기 키 (예: 2026-Q4) */
const quarterKey = (d: Date) => `${format(d, 'yyyy')}-Q${getQuarter(d)}`;

/**
 * 날짜가 속한 추이 칸 키 (주는 월요일 날짜, 분기는 2026-Q4)
 */
export const getBucketKey = (date: string, unit: TrendUnit): string => {
  const d = parseISO(date);
  if (unit === 'day') return date;
  if (unit === 'week') return iso(startOfWeek(d, { weekStartsOn: 1 }));
  if (unit === 'month') return format(d, 'yyyy-MM');
  if (unit === 'quarter') return quarterKey(d);
  return format(d, 'yyyy');
};

/**
 * 기간 안의 추이 칸 목록 (일별은 영업일만 — 주말은 업로드가 없음)
 */
export const getBuckets = (from: string, to: string, unit: TrendUnit, t: Translate = koreanOnly): { key: string; label: string }[] => {
  const interval = { start: parseISO(from), end: parseISO(to) };
  if (interval.start > interval.end) return [];
  if (unit === 'day') {
    return eachDayOfInterval(interval)
      .filter((d) => !isWeekend(d))
      .map((d) => ({ key: iso(d), label: format(d, 'MM/dd') }));
  }
  if (unit === 'week') {
    return eachWeekOfInterval(interval, { weekStartsOn: 1 }).map((d) => ({
      key: iso(d),
      label: t(`${format(d, 'MM/dd')}주`, `Wk ${format(d, 'MM/dd')}`),
    }));
  }
  if (unit === 'month') {
    return eachMonthOfInterval(interval).map((d) => ({ key: format(d, 'yyyy-MM'), label: format(d, 'yy.MM') }));
  }
  if (unit === 'quarter') {
    return eachQuarterOfInterval(interval).map((d) => ({
      key: quarterKey(d),
      label: t(`${format(d, 'yy')}년 ${getQuarter(d)}분기`, `Q${getQuarter(d)} '${format(d, 'yy')}`),
    }));
  }
  return eachYearOfInterval(interval).map((d) => ({ key: format(d, 'yyyy'), label: format(d, 'yyyy') }));
};

/**
 * 변경 유형 코드 → 추이 막대 묶음 (관리자가 새로 만든 유형은 그 밖)
 */
export const getTypeGroup = (code: string): TypeGroup => {
  if (code === 'product_add' || code === 'material_add') return 'add';
  if (code === 'product_delete' || code === 'material_delete') return 'delete';
  if (code === 'schedule_change' || code === 'mode_change') return 'shift';
  if (code === 'split' || code === 'item_change') return 'group';
  return 'other';
};

/** 추이 묶음 이름 */
export const getTypeGroupLabels = (t: Translate = koreanOnly): Record<TypeGroup, string> => ({
  add: t('추가', 'Added'),
  delete: t('삭제', 'Removed'),
  shift: t('일정·운송방법', 'Schedule/mode'),
  group: t('분할·품목코드', 'Split/item code'),
  other: t('기타', 'Other'),
});

/**
 * 요청 출처 묶음 — 사유를 입력하지 않았으면 미입력
 */
export const getOriginBucket = (row: Pick<DashboardChangeRow, 'reason' | 'reason_origin_type' | 'reason_origin_function'>): OriginBucket => {
  if (!row.reason || !row.reason_origin_type) return 'missing';
  if (row.reason_origin_type === 'customer') return 'customer';
  if (row.reason_origin_function === PRODUCTION_FUNCTION) return 'production';
  return 'department';
};

/** 요청 출처 묶음 이름 */
export const getOriginLabels = (t: Translate = koreanOnly): Record<OriginBucket, string> => ({
  customer: t('고객처', 'Customer'),
  production: t('생산부', 'Production'),
  department: t('본사·국내법인 기타 부서', 'Other HQ/affiliate departments'),
  missing: t('사유 미입력', 'No reason yet'),
});

/**
 * 고객처 묶음 이름 — 경유 고객처도 꼬리표("_미국(미국법인)") 없이 판매주문 고객처 이름으로
 */
export const getCustomerGroup = (row: Pick<DashboardChangeRow, 'customer_name'>, t: Translate = koreanOnly): string =>
  row.customer_name ?? t('고객처 미확인', 'Unknown customer');

/**
 * 고객처 꼬리표 — "주식회사 인바디헬스케어_미국(미국법인)" → "미국(미국법인)", 꼬리표가 없으면 null
 */
export const getCustomerTail = (row: Pick<DashboardChangeRow, 'customer_name' | 'display_customer_name'>): string | null => {
  const name = row.customer_name;
  const display = row.display_customer_name;
  if (!name || !display || display === name || !display.startsWith(`${name}_`)) return null;
  return display.slice(name.length + 1);
};

/** 화면 표시용 고객처 이름 — "주식회사 " 접두어는 줄임 */
export const shortCustomerName = (name: string): string => name.replace(/^주식회사\s+/, '');

/**
 * 필터 적용 (기간은 조회 단계에서 적용)
 */
export const filterChangeRows = (rows: DashboardChangeRow[], filters: DashboardFilters, t: Translate = koreanOnly): DashboardChangeRow[] =>
  rows.filter((r) => {
    if (filters.customer !== 'all' && getCustomerGroup(r, t) !== filters.customer) return false;
    if (filters.productClass !== 'all' && r.product_class !== filters.productClass) return false;
    if (filters.origin !== 'all' && getOriginBucket(r) !== filters.origin) return false;
    return true;
  });

/**
 * 출처별 나눠 보기 (고객처·생산부·기타 부서·미입력 순, 0건은 뺌)
 */
const originBreakdown = (rows: DashboardChangeRow[], t: Translate): RankedItem['breakdown'] => {
  const labels = getOriginLabels(t);
  return ORIGIN_ORDER.map((bucket) => ({
    label: labels[bucket],
    value: rows.filter((r) => getOriginBucket(r) === bucket).length,
    color: ORIGIN_COLORS[bucket],
  })).filter((b) => b.value > 0);
};

/**
 * 키별로 묶어 건수 많은 순으로 정렬
 */
const groupBy = <K extends string>(rows: DashboardChangeRow[], keyOf: (r: DashboardChangeRow) => K | null) => {
  const map = new Map<K, DashboardChangeRow[]>();
  rows.forEach((r) => {
    const key = keyOf(r);
    if (key === null) return;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  });
  return [...map].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

/**
 * 변경 유형별 건수 — 막대 색은 추이 묶음 색, 마우스를 올리면 출처 비중
 * @param typeName 유형 코드 → 표시 이름
 */
export const rankByType = (rows: DashboardChangeRow[], typeName: (code: string, label: string) => string, t: Translate = koreanOnly): RankedItem[] =>
  groupBy(rows, (r) => r.change_type_code).map(([code, list]) => ({
    key: code,
    label: typeName(code, list[0].change_type_label),
    value: list.length,
    color: TYPE_GROUP_COLORS[getTypeGroup(code)],
    breakdown: originBreakdown(list, t),
  }));

/**
 * 고객처별 건수 (상위 N) — 경유 고객처는 하나로 묶고, 마우스를 올리면 꼬리표(실제 도착지)별 건수
 */
export const rankByCustomer = (rows: DashboardChangeRow[], limit: number, t: Translate = koreanOnly): RankedItem[] =>
  groupBy(rows, (r) => getCustomerGroup(r, t))
    .slice(0, limit)
    .map(([name, list]) => {
      const tails = new Map<string, number>();
      list.forEach((r) => {
        const tail = getCustomerTail(r);
        if (tail) tails.set(tail, (tails.get(tail) ?? 0) + 1);
      });
      const tagged = [...tails.values()].reduce((s, v) => s + v, 0);
      const breakdown = [...tails]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, color: BAR_COLOR }));
      if (breakdown.length && tagged < list.length) {
        breakdown.push({ label: t('도착 정보 없음', 'No destination yet'), value: list.length - tagged, color: '#B8C1CE' });
      }
      return { key: name, label: shortCustomerName(name), value: list.length, color: BAR_COLOR, breakdown };
    });

/**
 * 변경 사유별 건수 (입력된 건만) — 마우스를 올리면 출처 비중
 */
export const rankByReason = (rows: DashboardChangeRow[], t: Translate = koreanOnly): RankedItem[] =>
  groupBy(rows, (r) => r.reason).map(([reason, list]) => ({
    key: reason,
    label: reason,
    value: list.length,
    color: BAR_COLOR,
    breakdown: originBreakdown(list, t),
  }));

/**
 * 요청 출처별 건수 (입력된 건만) — 고객처 한 줄 + 부서별, 색은 고객처·생산부·그 밖의 부서
 * 키: 고객처 = customer, 부서 = 요청 부서 코드
 */
export const rankByOrigin = (rows: DashboardChangeRow[], t: Translate = koreanOnly): RankedItem[] =>
  groupBy(rows, (r) => {
    const bucket = getOriginBucket(r);
    if (bucket === 'missing') return null;
    return bucket === 'customer' ? 'customer' : r.reason_origin_code ?? 'department';
  }).map(([key, list]) => {
    const bucket = getOriginBucket(list[0]);
    return {
      key,
      label: bucket === 'customer' ? getOriginLabels(t).customer : list[0].reason_origin_name ?? key,
      value: list.length,
      color: ORIGIN_COLORS[bucket],
      breakdown: [],
    };
  });

/**
 * 변경 추이 — 칸마다 추이 묶음별 건수
 */
export const buildChangeTrend = (rows: DashboardChangeRow[], from: string, to: string, unit: TrendUnit, t: Translate = koreanOnly): TrendBucket[] => {
  const buckets = getBuckets(from, to, unit, t).map((b) => ({ ...b, values: {} as Record<string, number>, total: 0 }));
  const index = new Map(buckets.map((b) => [b.key, b]));
  rows.forEach((r) => {
    const bucket = index.get(getBucketKey(r.detected_on, unit));
    if (!bucket) return;
    const group = getTypeGroup(r.change_type_code);
    bucket.values[group] = (bucket.values[group] ?? 0) + 1;
    bucket.total += 1;
  });
  return buckets;
};

/** 요청 상태 묶음 — 승인(완료 포함) / 반려 / 대기(검토 중 포함) */
export type RequestStatusGroup = 'approved' | 'rejected' | 'pending';

export const REQUEST_STATUS_COLORS: Record<RequestStatusGroup, string> = {
  approved: '#1E40AF',
  rejected: '#8B1538',
  pending: '#B8C1CE',
};

export const getRequestStatusGroup = (status: string | null): RequestStatusGroup => {
  if (status === 'approved' || status === 'completed') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

export const getRequestStatusLabels = (t: Translate = koreanOnly): Record<RequestStatusGroup, string> => ({
  approved: t('승인', 'Approved'),
  rejected: t('반려', 'Rejected'),
  pending: t('대기', 'Pending'),
});

/**
 * 요청 추이 — 칸마다 상태 묶음별 건수
 */
export const buildRequestTrend = (rows: DashboardRequestRow[], from: string, to: string, unit: TrendUnit, t: Translate = koreanOnly): TrendBucket[] => {
  const buckets = getBuckets(from, to, unit, t).map((b) => ({ ...b, values: {} as Record<string, number>, total: 0 }));
  const index = new Map(buckets.map((b) => [b.key, b]));
  rows.forEach((r) => {
    const bucket = index.get(getBucketKey(r.request_date.slice(0, 10), unit));
    if (!bucket) return;
    const group = getRequestStatusGroup(r.status);
    bucket.values[group] = (bucket.values[group] ?? 0) + 1;
    bucket.total += 1;
  });
  return buckets;
};

/**
 * 요청 값별 건수 (요청구분·요청사유) — 마우스를 올리면 승인·반려·대기
 */
export const rankRequests = (
  rows: DashboardRequestRow[],
  keyOf: (r: DashboardRequestRow) => string | null,
  t: Translate = koreanOnly
): RankedItem[] => {
  const labels = getRequestStatusLabels(t);
  const map = new Map<string, DashboardRequestRow[]>();
  rows.forEach((r) => {
    const key = keyOf(r) || t('미지정', 'Not set');
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  });
  return [...map]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      key,
      label: key,
      value: list.length,
      color: BAR_COLOR,
      breakdown: (['approved', 'rejected', 'pending'] as RequestStatusGroup[])
        .map((g) => ({ label: labels[g], value: list.filter((r) => getRequestStatusGroup(r.status) === g).length, color: REQUEST_STATUS_COLORS[g] }))
        .filter((b) => b.value > 0),
    }));
};
