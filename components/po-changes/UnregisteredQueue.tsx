/**
 * 요청 없는 변경 탭 — 요청과 연결되지 않은 변경(요청 없음·확인 대기)과 후보 요청, 승인됐는데 DO에 반영되지 않은 요청
 */
'use client';

import { useMemo, useState } from 'react';
import { Link2, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MatchChips } from '@/components/po-changes/RequestLinkDialog';
import { RequestSummaryLine } from '@/components/po-changes/RequestSummaryLine';
import { useLanguage } from '@/context/LanguageContext';
import { groupByStatUnit, type PoStatUnit } from '@/lib/po-changes-utils';
import { REGISTRATION_BADGE_CLASSES, getEventTypeName, getRegistrationLabels } from '@/lib/po-tracker-labels';
import { getStatusLabel } from '@/lib/request-helpers';
import type { MatchCandidate, PoChangeEvent, PoChangeTypeSetting, UnreflectedRequest } from '@/types/po-changes';

interface UnregisteredQueueProps {
  /** 필터를 적용한 변경 이벤트 */
  events: PoChangeEvent[];
  candidatesByUnit: Map<string, MatchCandidate[]>;
  unreflected: UnreflectedRequest[];
  changeTypes: PoChangeTypeSetting[];
  /** 요청 연결 창 열기 */
  onOpen: (unit: PoStatUnit) => void;
  /** 후보 바로 연결 — 성공하면 true */
  onLink: (key: string, candidate: MatchCandidate, note: string) => Promise<boolean>;
  /** 다시 매칭 */
  onRematch: () => Promise<void>;
}

const numberFormat = new Intl.NumberFormat('ko-KR');
/** 한 변경에 바로 보여 줄 후보 수 */
const TOP_CANDIDATES = 3;

export const UnregisteredQueue = ({ events, candidatesByUnit, unreflected, changeTypes, onOpen, onLink, onRematch }: UnregisteredQueueProps) => {
  const { t, lang } = useLanguage();
  const registrationLabels = getRegistrationLabels(t);
  const [includeWaiting, setIncludeWaiting] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const units = useMemo(
    () =>
      groupByStatUnit(
        events.filter(
          (e) =>
            !e.is_excluded &&
            !e.is_dismissed &&
            (e.registration_status === 'unregistered' || (includeWaiting && e.registration_status === 'waiting'))
        )
      ),
    [events, includeWaiting]
  );

  const handleRematch = async () => {
    setBusy('rematch');
    await onRematch();
    setBusy(null);
  };

  const handleLink = async (key: string, candidate: MatchCandidate) => {
    setBusy(`${key}|${candidate.request_id}|${candidate.item_key}`);
    await onLink(key, candidate, '');
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5A6778]">
          {t(
            `요청과 연결되지 않은 변경 ${numberFormat.format(units.length)}건`,
            `${numberFormat.format(units.length)} changes without a linked request`
          )}
          <span className="ml-2 text-xs text-[#8E98A8]">
            {t(
              '감지 후 유예 영업일이 지나면 요청 없음, 그 전은 확인 대기입니다. 후보를 연결하거나 예외 처리하세요.',
              'No request after the grace business days, Waiting before that. Link a candidate or mark it exempt.'
            )}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="queue-waiting" checked={includeWaiting} onCheckedChange={setIncludeWaiting} />
            <Label htmlFor="queue-waiting" className="cursor-pointer text-sm text-[#253143]">{t('확인 대기 포함', 'Include waiting')}</Label>
          </div>
          <Button variant="outline" size="sm" className="border-[#D6DDE7] shadow-none" disabled={busy !== null} onClick={() => void handleRematch()}>
            {busy === 'rematch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('다시 매칭', 'Match again')}
          </Button>
        </div>
      </div>

      {units.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('요청과 연결되지 않은 변경이 없습니다.', 'Every change is linked to a request or exempt.')}
        </p>
      ) : (
        <div className="max-h-[640px] overflow-auto rounded-lg border bg-white">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                {[
                  t('기준일', 'Date'),
                  t('고객처', 'Customer'),
                  t('주문 · 품목', 'Order · Item'),
                  t('변경 유형', 'Change type'),
                  t('수량', 'Qty'),
                  t('연결 상태', 'Link status'),
                  t('후보 요청', 'Candidate requests'),
                  '',
                ].map((h, i) => (
                  <TableHead key={`${h}-${i}`} className="whitespace-nowrap bg-white">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => {
                const e = unit.events[0];
                const orders = [...new Set(unit.events.map((x) => x.order_no))];
                const items = [...new Set(unit.events.map((x) => `${x.item_no ?? ''} ${x.item_name ?? ''}`.trim()))];
                const candidates = [...(candidatesByUnit.get(unit.key) ?? [])].sort((a, b) => b.score - a.score);
                return (
                  <TableRow key={unit.key} className="align-top">
                    <TableCell className="whitespace-nowrap">{e.detected_on}</TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={e.display_customer_name ?? e.customer_name ?? ''}>
                        {e.display_customer_name ?? e.customer_name ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">{orders.join(', ')}</span>
                      <span className="block truncate text-xs text-[#5A6778]" title={items.join(', ')}>
                        {items.length === 1 ? items[0] : t(`품목 ${items.length}개`, `${items.length} items`)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{getEventTypeName(e, changeTypes, lang)}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">
                      {numberFormat.format(unit.events.reduce((s, x) => s + x.qty, 0))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={REGISTRATION_BADGE_CLASSES[e.registration_status]}>
                        {registrationLabels[e.registration_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-72">
                      {candidates.length === 0 ? (
                        <span className="text-xs text-[#8E98A8]">{t('후보 없음', 'No candidates')}</span>
                      ) : (
                        <ul className="space-y-2">
                          {candidates.slice(0, TOP_CANDIDATES).map((c) => {
                            const id = `${unit.key}|${c.request_id}|${c.item_key}`;
                            return (
                              <li key={id} className="flex items-start justify-between gap-2">
                                <div className="min-w-0 space-y-1">
                                  <RequestSummaryLine request={c} compact />
                                  <MatchChips candidate={c} />
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 shrink-0 border-[#8B1538]/40 px-2 text-[#8B1538] hover:bg-[#FBF7F8] hover:text-[#74112F]"
                                  disabled={busy !== null}
                                  onClick={() => void handleLink(unit.key, c)}
                                >
                                  {busy === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                  {t('연결', 'Link')}
                                </Button>
                              </li>
                            );
                          })}
                          {candidates.length > TOP_CANDIDATES ? (
                            <li className="text-xs text-[#8E98A8]">
                              {t(`외 ${candidates.length - TOP_CANDIDATES}건 — 처리에서 보기`, `+${candidates.length - TOP_CANDIDATES} more in Handle`)}
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-8 text-[#8B1538] hover:text-[#74112F]" onClick={() => onOpen(unit)}>
                        <Settings2 className="h-4 w-4" />
                        {t('처리', 'Handle')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[#172132]">{t(`미반영 요청 ${unreflected.length}`, `Requests not reflected ${unreflected.length}`)}</h3>
          <p className="text-xs text-[#8E98A8]">
            {t(
              '승인·완료됐는데 확정 출하일(없으면 희망·현재 출하일)이 지나도록 연결된 DO 변경이 없는 요청입니다. 기간 필터와 관계없이 전체를 보여 줍니다.',
              'Approved or completed requests with no linked DO change after the confirmed (or desired/current) ship date. Shown regardless of the period filter.'
            )}
          </p>
        </div>
        {unreflected.length === 0 ? (
          <p className="rounded-lg border bg-white py-8 text-center text-sm text-[#5A6778]">{t('미반영 요청이 없습니다.', 'No requests waiting to be reflected.')}</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border bg-white">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow>
                  {[
                    t('요청일', 'Request date'),
                    t('SO 번호', 'SO No.'),
                    t('고객', 'Customer'),
                    t('요청자 · 부서', 'Requester · Dept'),
                    t('요청구분', 'Request type'),
                    t('품목', 'Items'),
                    t('출하일', 'Ship date'),
                    t('상태', 'Status'),
                  ].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap bg-white">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unreflected.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.request_date}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.so_number}</TableCell>
                    <TableCell className="max-w-48 truncate" title={r.customer}>{r.customer}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#5A6778]">{r.requester_name} · {r.requesting_dept}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.category_of_request}</TableCell>
                    <TableCell className="max-w-64 truncate text-[#5A6778]" title={r.items ?? ''}>{r.items ?? '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-red-700">{r.due_date}</TableCell>
                    <TableCell className="whitespace-nowrap">{getStatusLabel(r.status, t)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
};
