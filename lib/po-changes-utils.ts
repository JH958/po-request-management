/**
 * PO 변경 페이지 필터·집계 유틸리티
 */
import { format, subDays } from 'date-fns';
import type { PoChangeEvent, PoChangeFilters, PoChangeGroup } from '@/types/po-changes';

/** 기본 조회 기간: 오늘 포함 최근 7일 (달력일) */
export const getDefaultRange = (): { from: string; to: string } => {
  const today = new Date();
  return { from: format(subDays(today, 6), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
};

/** YYYY-MM-DD 형식 검사 */
export const isIsoDate = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/**
 * 검색어가 고객처·주문번호·DO·품목번호·품목명 중 하나에 들어 있는지
 */
const matchesSearch = (event: PoChangeEvent, term: string): boolean =>
  [event.customer_name, event.order_no, event.do_no, event.item_no, event.item_name, event.item_before, event.item_after]
    .some((v) => (v ?? '').toLowerCase().includes(term));

/**
 * 로그인한 담당자의 고객처 이벤트인지 (담당자 메일 = 로그인 메일, 대소문자 무시)
 */
const isMine = (event: PoChangeEvent, email: string): boolean =>
  (event.manager_email ?? '').toLowerCase() === email.toLowerCase();

/** 사유 필터 값: 미입력 / 입력됨 (그 밖의 값은 사유 값) */
export const REASON_FILTER_MISSING = '__missing__';
export const REASON_FILTER_SET = '__set__';
/** 출처 필터 값: 고객처 / 부서 / 생산부 (그 밖의 값은 부서 코드) */
export const ORIGIN_FILTER_CUSTOMER = '__customer__';
export const ORIGIN_FILTER_DEPARTMENT = '__department__';
export const ORIGIN_FILTER_PRODUCTION = '__production__';

/** 생산부로 묶는 분류 기능 */
export const PRODUCTION_FUNCTION = '생산';

/**
 * 사유 필터 일치 여부 (추적 제외 건은 사유 대상이 아니므로 미입력에 넣지 않음)
 */
const matchesReason = (e: PoChangeEvent, filter: string): boolean => {
  if (filter === 'all') return true;
  if (filter === REASON_FILTER_MISSING) return !e.reason && !e.is_excluded;
  if (filter === REASON_FILTER_SET) return Boolean(e.reason);
  return e.reason === filter;
};

/**
 * 요청 출처 필터 일치 여부
 */
const matchesOrigin = (e: PoChangeEvent, filter: string): boolean => {
  if (filter === 'all') return true;
  if (filter === ORIGIN_FILTER_CUSTOMER) return e.reason_origin_type === 'customer';
  if (filter === ORIGIN_FILTER_DEPARTMENT) return e.reason_origin_type === 'department';
  if (filter === ORIGIN_FILTER_PRODUCTION) return e.reason_origin_function === PRODUCTION_FUNCTION;
  return e.reason_origin_code === filter;
};

/**
 * 사유를 아직 입력하지 않은 변경 건수 (추적 제외 제외, 통계 단위 기준)
 */
export const countMissingReasons = (events: PoChangeEvent[]): number =>
  new Set(events.filter((e) => !e.reason && !e.is_excluded).map((e) => e.stat_unit_key)).size;

/**
 * 필터 적용 (기간은 조회 단계에서 이미 적용됨)
 */
export const filterEvents = (events: PoChangeEvent[], filters: PoChangeFilters): PoChangeEvent[] => {
  const term = filters.search.trim().toLowerCase();
  return events.filter((e) => {
    if (!filters.includeExcluded && e.is_excluded) return false;
    if (filters.myEmail && !isMine(e, filters.myEmail)) return false;
    if (filters.changeType !== 'all' && e.change_type_code !== filters.changeType) return false;
    if (filters.productClass !== 'all' && e.product_class !== filters.productClass) return false;
    if (!matchesReason(e, filters.reasonFilter)) return false;
    if (!matchesOrigin(e, filters.originFilter)) return false;
    if (term && !matchesSearch(e, term)) return false;
    return true;
  });
};

/**
 * 통계 건수 — 반려되지 않은 분할/합배송 묶음은 1건 (stat_unit_key 기준)
 */
export const countStatUnits = (events: PoChangeEvent[]): number => new Set(events.map((e) => e.stat_unit_key)).size;

/**
 * 확인 필요 탭에 보일 묶음 — 추적 제외 고객처만으로 이뤄진 묶음은 토글이 꺼져 있으면 숨김, 변경 유형·검색어 적용
 */
export const filterGroups = (groups: PoChangeGroup[], filters: PoChangeFilters): PoChangeGroup[] => {
  const term = filters.search.trim().toLowerCase();
  const myEmail = filters.myEmail;
  return groups.filter((g) => {
    if (!filters.includeExcluded && g.events.every((e) => e.is_excluded)) return false;
    if (myEmail && !g.events.some((e) => isMine(e, myEmail))) return false;
    if (filters.changeType !== 'all' && !g.events.some((e) => e.change_type_code === filters.changeType)) return false;
    if (term && !g.events.some((e) => matchesSearch(e, term))) return false;
    return true;
  });
};

/** 통계 단위 하나 (같은 stat_unit_key의 이벤트들) */
export interface PoStatUnit {
  key: string;
  events: PoChangeEvent[];
}

/**
 * 이벤트를 통계 단위로 묶음 (순서는 각 단위의 첫 이벤트 기준)
 */
export const groupByStatUnit = (events: PoChangeEvent[]): PoStatUnit[] => {
  const map = new Map<string, PoChangeEvent[]>();
  events.forEach((e) => {
    const list = map.get(e.stat_unit_key);
    if (list) list.push(e);
    else map.set(e.stat_unit_key, [e]);
  });
  return [...map].map(([key, list]) => ({ key, events: list }));
};
