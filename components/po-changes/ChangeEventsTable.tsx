/**
 * 변경 이벤트 탭 — 통계 단위(묶음)별 표, 펼치면 라인별 이벤트, 사유 입력(여러 건 선택 가능) + Excel 다운로드
 */
'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, MessageSquarePlus, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/context/LanguageContext';
import {
  getDoChangeTypeLabels,
  getChangeGroupStatusLabels,
  getChangeGroupTypeLabels,
  getEventTypeName,
  getProductClassLabels,
} from '@/lib/po-tracker-labels';
import { groupByStatUnit, type PoStatUnit } from '@/lib/po-changes-utils';
import { DestinationChoice } from '@/components/po-changes/DestinationChoice';
import type { Translate } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PoChangeEvent, PoChangeTypeSetting } from '@/types/po-changes';

interface ChangeEventsTableProps {
  events: PoChangeEvent[];
  changeTypes: PoChangeTypeSetting[];
  statCount: number;
  from: string;
  to: string;
  /** 사유 입력 창 열기 (고른 변경들) */
  onEditReasons: (units: PoStatUnit[]) => void;
  /** 경유 고객처 주문의 실제 고객처 지정 */
  onSetDestination: (orderNo: string, target: string | null) => Promise<void>;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/** 전 → 후 문구 (둘 다 없으면 -) */
const beforeAfter = (before: string | number | null, after: string | number | null): string =>
  before === null && after === null ? '-' : `${before ?? '-'} → ${after ?? '-'}`;

/** 이벤트 한 건의 상세 (일정·운송방법·품목 전 → 후) */
const detailText = (e: PoChangeEvent): string => {
  if (e.direction === 'date') return beforeAfter(e.date_before, e.date_after);
  if (e.direction === 'mode') return beforeAfter(e.mode_before, e.mode_after);
  if (e.direction === 'item') return beforeAfter(e.item_before, e.item_after);
  return '-';
};

/** 중복 없는 값 목록 */
const uniq = (values: (string | null)[]): string[] => [...new Set(values.filter((v): v is string => Boolean(v)))];

/**
 * 여러 값 요약 — 하나면 그대로, 여럿이면 "첫 값 외 N"
 */
const summarize = (values: string[], t: Translate): string => {
  if (values.length === 0) return '-';
  if (values.length === 1) return values[0];
  return t(`${values[0]} 외 ${values.length - 1}`, `${values[0]} +${values.length - 1}`);
};

/**
 * 묶음 수량 요약 — 삭제·추가가 섞이면 "−합계 / +합계", 아니면 합계
 */
const qtySummary = (events: PoChangeEvent[]): string => {
  const removed = events.filter((e) => e.direction === 'delete').reduce((s, e) => s + e.qty, 0);
  const added = events.filter((e) => e.direction === 'add').reduce((s, e) => s + e.qty, 0);
  if (removed && added) return `−${numberFormat.format(removed)} / +${numberFormat.format(added)}`;
  return numberFormat.format(events.reduce((s, e) => s + e.qty, 0));
};

export const ChangeEventsTable = ({
  events,
  changeTypes,
  statCount,
  from,
  to,
  onEditReasons,
  onSetDestination,
}: ChangeEventsTableProps) => {
  const { t, lang } = useLanguage();
  const classLabels = getProductClassLabels(t);
  const typeLabels = getDoChangeTypeLabels(t);
  const groupTypeLabels = getChangeGroupTypeLabels(t);
  const groupStatusLabels = getChangeGroupStatusLabels(t);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const units = useMemo(() => groupByStatUnit(events), [events]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 사유 입력 대상 (추적 제외만으로 된 변경은 제외)
  const selectable = useMemo(() => units.filter((u) => !u.events.every((e) => e.is_excluded)), [units]);
  const selectedUnits = selectable.filter((u) => selected.has(u.key));
  const allSelected = selectable.length > 0 && selectedUnits.length === selectable.length;

  const toggleSelect = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = units.flatMap((unit, index) =>
        unit.events.map((e) => ({
          [t('통계 묶음 번호', 'Unit No.')]: index + 1,
          [t('기준일', 'Date')]: e.detected_on,
          [t('고객처', 'Customer')]: e.display_customer_name ?? e.customer_name ?? '',
          [t('판매주문 고객처', 'Sales order customer')]: e.customer_name ?? '',
          [t('도착국', 'Destination country')]: e.dest_country_name ?? '',
          [t('담당자', 'Manager')]: e.manager_name ?? '',
          [t('주문번호', 'Order No.')]: e.order_no,
          [t('라인', 'Line')]: e.line_no,
          DO: e.do_no ?? '',
          [t('품목번호', 'Item code')]: e.item_no ?? '',
          [t('품목명', 'Item name')]: e.item_name ?? '',
          [t('구분', 'Category')]: classLabels[e.product_class],
          [t('변경 유형', 'Change type')]: getEventTypeName(e, changeTypes, lang),
          [t('자동 판정 유형', 'Detected type')]: e.is_type_overridden
            ? getEventTypeName({ change_type_code: e.rule_type_code, change_type_label: e.rule_type_code }, changeTypes, lang)
            : '',
          [t('세부 유형', 'Detail type')]: typeLabels[e.change_type],
          [t('수량', 'Qty')]: e.qty,
          [t('수량 전', 'Qty before')]: e.qty_before ?? '',
          [t('수량 후', 'Qty after')]: e.qty_after ?? '',
          [t('상세 (전 → 후)', 'Detail (before → after)')]: detailText(e),
          [t('후보 묶음', 'Candidate group')]: e.group_type ? groupTypeLabels[e.group_type] : '',
          [t('묶음 상태', 'Group status')]: e.group_status ? groupStatusLabels[e.group_status] : '',
          [t('추적 제외', 'Excluded')]: e.is_excluded ? 'Y' : '',
          [t('변경 사유', 'Change reason')]: e.reason ?? '',
          [t('상세 사유', 'Reason note')]: e.reason_note ?? '',
          [t('요청 출처', 'Requested by')]: e.reason_origin_name ?? '',
          [t('출처 분류', 'Origin category')]: e.reason_origin_type === 'customer' ? t('고객처', 'Customer') : e.reason_origin_category ?? '',
          [t('사유 입력자', 'Reason by')]: e.reason_set_by_name ?? '',
          [t('변경 아님', 'Not a change')]: e.is_dismissed ? 'Y' : '',
          [t('정정 메모', 'Correction note')]: e.dismiss_note ?? '',
        }))
      );
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, t('PO 변경', 'PO Changes'));
      XLSX.writeFile(book, t(`PO변경_${from}_${to}.xlsx`, `PO_changes_${from}_${to}.xlsx`));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Excel 다운로드 실패:', error);
      }
      toast.error(t('Excel 파일을 만들지 못했습니다.', 'Could not create the Excel file.'));
    }
  };

  /**
   * 이벤트 한 줄 (펼친 라인 또는 이벤트 1건짜리 묶음)
   */
  const renderEventCells = (e: PoChangeEvent, nested = false) => (
    <>
      <TableCell className="whitespace-nowrap">{nested ? '' : e.detected_on}</TableCell>
      <TableCell className="max-w-56" title={e.display_customer_name ?? e.customer_name ?? ''}>
        {nested ? '' : (
          <>
            <span className="block truncate">
              {e.display_customer_name ?? e.customer_name ?? <span className="text-[#8E98A8]">{t('미확인', 'Unknown')}</span>}
            </span>
            <DestinationChoice event={e} onChange={onSetDestination} />
          </>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-[#5A6778]">{nested ? '' : e.manager_name ?? '-'}</TableCell>
      <TableCell className="whitespace-nowrap font-medium">
        {e.order_no} <span className="font-normal text-[#5A6778]">L{e.line_no}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-[#5A6778]">{e.do_no ?? '-'}</TableCell>
      <TableCell className="max-w-56">
        <span className="block truncate" title={`${e.item_no ?? ''} ${e.item_name ?? ''}`}>
          {e.item_no} <span className="text-[#5A6778]">{e.item_name}</span>
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {classLabels[e.product_class]}
        {e.is_class_overridden ? (
          <span
            className="ml-1 text-xs text-[#8E98A8]"
            title={t('관리자 설정의 품목 구분 예외로 지정된 품목입니다.', 'Set by an item category exception in admin settings.')}
          >
            · {t('예외', 'exception')}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className={cn(e.direction === 'delete' ? 'text-[#8B1538]' : e.direction === 'add' ? 'text-[#1E40AF]' : 'text-[#253143]')}>
          {nested ? typeLabels[e.change_type] : getEventTypeName(e, changeTypes, lang)}
        </span>
        {!nested ? renderTypeEdited(e) : null}
        {!nested && e.change_type === 'shipment_shortfall' ? (
          <span className="ml-1 text-xs text-[#8E98A8]">· {t('출하 부족', 'Short shipment')}</span>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="font-semibold">{numberFormat.format(e.qty)}</span>
        {e.qty_before !== null && e.qty_after !== null ? (
          <span className="ml-1 text-xs text-[#8E98A8]">
            ({numberFormat.format(e.qty_before)} → {numberFormat.format(e.qty_after)})
          </span>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-[#5A6778]">{detailText(e)}</TableCell>
    </>
  );

  /**
   * 고친 변경 유형 표시 — 자동 판정과 고친 사람은 툴팁으로
   */
  const renderTypeEdited = (e: PoChangeEvent) => {
    if (!e.is_type_overridden) return null;
    const detected = getEventTypeName({ change_type_code: e.rule_type_code, change_type_label: e.rule_type_code }, changeTypes, lang);
    return (
      <span
        className="ml-1 text-xs text-[#8E98A8]"
        title={t(
          `자동 판정: ${detected}${e.type_set_by_name ? ` · 수정 ${e.type_set_by_name}` : ''}`,
          `Detected as ${detected}${e.type_set_by_name ? ` · edited by ${e.type_set_by_name}` : ''}`
        )}
      >
        · {t('수정', 'edited')}
      </span>
    );
  };

  /**
   * 사유·출처·입력 버튼 칸 (변경 1건 기준)
   */
  const renderReasonCells = (unit: PoStatUnit) => {
    const e = unit.events[0];
    const excluded = unit.events.every((x) => x.is_excluded);
    return (
      <>
        <TableCell className="max-w-52">
          {e.is_dismissed ? (
            <span className="block truncate" title={e.dismiss_note ?? ''}>
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-600">{t('변경 아님', 'Not a change')}</Badge>
              {e.dismiss_note ? <span className="ml-1 text-xs text-[#5A6778]">{e.dismiss_note}</span> : null}
            </span>
          ) : e.reason ? (
            <span className="block truncate" title={e.reason_note ?? ''}>
              <span className="font-medium text-[#253143]">{e.reason}</span>
              {e.reason_note ? <span className="ml-1 text-xs text-[#5A6778]">{e.reason_note}</span> : null}
            </span>
          ) : excluded ? (
            <span className="text-[#8E98A8]">-</span>
          ) : (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{t('미입력', 'Missing')}</Badge>
          )}
        </TableCell>
        <TableCell className="max-w-48 whitespace-nowrap">
          {e.reason_origin_name ? (
            <span className="block truncate" title={e.reason_origin_category ?? e.reason_origin_name}>
              {e.reason_origin_type === 'customer' ? t('고객처', 'Customer') : e.reason_origin_name}
            </span>
          ) : (
            <span className="text-[#8E98A8]">-</span>
          )}
        </TableCell>
        <TableCell onClick={(ev) => ev.stopPropagation()}>
          {excluded ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[#8B1538] hover:text-[#74112F]"
              onClick={() => onEditReasons([unit])}
              aria-label={e.reason ? t('사유 수정', 'Edit reason') : t('사유 입력', 'Enter reason')}
              title={e.reason ? t('사유 수정', 'Edit reason') : t('사유 입력', 'Enter reason')}
            >
              {e.reason ? <PencilLine className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
            </Button>
          )}
        </TableCell>
      </>
    );
  };

  /**
   * 선택 칸
   */
  const renderSelectCell = (unit: PoStatUnit) => {
    const excluded = unit.events.every((x) => x.is_excluded);
    return (
      <TableCell className="w-8" onClick={(ev) => ev.stopPropagation()}>
        {excluded ? null : (
          <Checkbox
            checked={selected.has(unit.key)}
            onCheckedChange={() => toggleSelect(unit.key)}
            aria-label={t('변경 선택', 'Select change')}
          />
        )}
      </TableCell>
    );
  };

  const renderBadge = (e: PoChangeEvent) =>
    e.group_type ? (
      <Badge variant="outline" className="border-[#8B1538]/30 text-[#8B1538]">
        {groupTypeLabels[e.group_type]}
        {e.group_status ? ` · ${groupStatusLabels[e.group_status]}` : ''}
      </Badge>
    ) : (
      <span className="text-[#8E98A8]">-</span>
    );

  return (
    <div className="space-y-3">
      {selectedUnits.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#8B1538]/30 bg-[#8B1538]/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-[#253143]">{t(`${selectedUnits.length}건 선택`, `${selectedUnits.length} selected`)}</span>
          <Button size="sm" className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => onEditReasons(selectedUnits)}>
            <MessageSquarePlus className="h-4 w-4" />
            {t('선택한 변경 사유 입력', 'Enter reason for selected')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('선택 해제', 'Clear')}</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5A6778]">
          {t(
            `변경 ${numberFormat.format(statCount)}건 · 라인 이벤트 ${numberFormat.format(events.length)}건`,
            `${numberFormat.format(statCount)} changes · ${numberFormat.format(events.length)} line events`
          )}
          <span className="ml-2 text-xs text-[#8E98A8]">
            {t(
              '후보 묶음과 같은 주문·DO의 같은 일정·운송방법 변경은 1건으로 셉니다. 행을 누르면 라인이 펼쳐집니다.',
              'Candidate groups and identical schedule/mode changes on the same order and DO count as one. Click a row to see its lines.'
            )}
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExport()}
          disabled={events.length === 0}
          className="border-[#D6DDE7] shadow-none"
        >
          <Download className="h-4 w-4" />
          {t('Excel 다운로드', 'Download Excel')}
        </Button>
      </div>

      {units.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('조건에 맞는 변경 이벤트가 없습니다.', 'No change events match the filters.')}
        </p>
      ) : (
        <div className="max-h-[640px] overflow-auto rounded-lg border bg-white">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                <TableHead className="w-8 bg-white">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((u) => u.key)) : new Set())}
                    aria-label={t('전체 선택', 'Select all')}
                  />
                </TableHead>
                {[
                  '',
                  t('기준일', 'Date'),
                  t('고객처', 'Customer'),
                  t('담당자', 'Manager'),
                  t('주문 · 라인', 'Order · Line'),
                  'DO',
                  t('품목', 'Item'),
                  t('구분', 'Category'),
                  t('변경 유형', 'Change type'),
                  t('수량 (전 → 후)', 'Qty (before → after)'),
                  t('상세 (전 → 후)', 'Detail (before → after)'),
                  t('후보 묶음', 'Candidate'),
                  t('변경 사유', 'Reason'),
                  t('요청 출처', 'Requested by'),
                  '',
                ].map((h, i) => (
                  <TableHead key={`${h}-${i}`} className="whitespace-nowrap bg-white">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => {
                const first = unit.events[0];
                const excluded = unit.events.every((e) => e.is_excluded) || first.is_dismissed;

                // 이벤트 1건짜리 묶음은 그대로 한 줄
                if (unit.events.length === 1) {
                  return (
                    <TableRow key={unit.key} className={cn(excluded && 'opacity-60')}>
                      {renderSelectCell(unit)}
                      <TableCell />
                      {renderEventCells(first)}
                      <TableCell className="whitespace-nowrap">{renderBadge(first)}</TableCell>
                      {renderReasonCells(unit)}
                    </TableRow>
                  );
                }

                const open = expanded.has(unit.key);
                const orders = uniq(unit.events.map((e) => e.order_no));
                const items = uniq(unit.events.map((e) => `${e.item_no ?? ''} ${e.item_name ?? ''}`.trim()));
                const classes = uniq(unit.events.map((e) => classLabels[e.product_class]));
                const isShift = first.direction === 'date' || first.direction === 'mode';

                return (
                  <Fragment key={unit.key}>
                    <TableRow
                      className={cn('cursor-pointer bg-[#F8FAFC] hover:bg-[#F1F4F8]', excluded && 'opacity-60')}
                      onClick={() => toggle(unit.key)}
                      aria-expanded={open}
                    >
                      {renderSelectCell(unit)}
                      <TableCell className="w-8">
                        {open ? <ChevronDown className="h-4 w-4 text-[#5A6778]" /> : <ChevronRight className="h-4 w-4 text-[#5A6778]" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{first.detected_on}</TableCell>
                      <TableCell className="max-w-56" title={uniq(unit.events.map((e) => e.display_customer_name ?? e.customer_name)).join(', ')}>
                        <span className="block truncate">
                          {summarize(uniq(unit.events.map((e) => e.display_customer_name ?? e.customer_name)), t)}
                        </span>
                        {uniq(unit.events.map((e) => e.order_no)).length === 1 ? (
                          <DestinationChoice event={first} onChange={onSetDestination} />
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[#5A6778]">
                        {summarize(uniq(unit.events.map((e) => e.manager_name)), t)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {summarize(orders, t)}
                        <span className="ml-1 font-normal text-[#5A6778]">
                          · {t(`라인 ${unit.events.length}개`, `${unit.events.length} lines`)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[#5A6778]">
                        {summarize(uniq(unit.events.map((e) => e.do_no)), t)}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate" title={items.join(', ')}>
                          {items.length === 1 ? items[0] : t(`품목 ${items.length}개`, `${items.length} items`)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{classes.join(', ')}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-[#253143]">
                        {getEventTypeName(first, changeTypes, lang)}
                        {renderTypeEdited(first)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">{qtySummary(unit.events)}</TableCell>
                      <TableCell className="whitespace-nowrap text-[#5A6778]">{isShift ? detailText(first) : '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{renderBadge(first)}</TableCell>
                      {renderReasonCells(unit)}
                    </TableRow>
                    {open
                      ? unit.events.map((e) => (
                          <TableRow key={e.id} className={cn('text-sm', e.is_excluded && 'opacity-60')}>
                            <TableCell />
                            <TableCell />
                            {renderEventCells(e, true)}
                            <TableCell />
                            <TableCell colSpan={3} />
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
