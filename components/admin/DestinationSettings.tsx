/**
 * 경유 고객처·도착지 관리 — 경유 고객처(인바디헬스케어·코르트) 주문의 도착항·국가 → 실제 고객처, 국가 한글명 (관리자 전용)
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteDestinationRule,
  deleteViaCustomer,
  fetchCountryNames,
  fetchCustomerManagers,
  fetchDestinationRules,
  fetchViaCustomers,
  saveCountryName,
  saveDestinationRule,
  saveViaCustomer,
} from '@/lib/po-tracker-settings-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { CountryName, DestinationRule, ViaCustomer } from '@/types/po-changes';

interface DestinationSettingsProps {
  userId: string;
}

type RuleMode = 'fixed' | 'choice';

interface RuleForm {
  isNew: boolean;
  match_key: string;
  mode: RuleMode;
  target: string | null;
  candidates: string[];
  note: string;
}

/**
 * 고객처 이름 검색 — 판매주문조회 고객처(고객처 담당자 표)에서 고름
 */
const CustomerPicker = ({
  customers,
  exclude,
  onPick,
  placeholder,
  id,
}: {
  customers: string[];
  exclude: string[];
  onPick: (name: string) => void;
  placeholder: string;
  id: string;
}) => {
  const [term, setTerm] = useState('');
  const list = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) => !exclude.includes(c) && c.toLowerCase().includes(q)).slice(0, 15);
  }, [customers, exclude, term]);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
        <Input id={id} className="pl-10" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} />
      </div>
      {list.length > 0 ? (
        <ul className="max-h-40 overflow-auto rounded-md border border-[#E4E9EF]">
          {list.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#F8FAFC]"
                onClick={() => {
                  onPick(c);
                  setTerm('');
                }}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const DestinationSettings = ({ userId }: DestinationSettingsProps) => {
  const { t } = useLanguage();
  const [via, setVia] = useState<ViaCustomer[]>([]);
  const [rules, setRules] = useState<DestinationRule[]>([]);
  const [countries, setCountries] = useState<CountryName[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [countryForm, setCountryForm] = useState<CountryName & { isNew: boolean } | null>(null);
  const [addingVia, setAddingVia] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [v, r, c, m] = await Promise.all([fetchViaCustomers(), fetchDestinationRules(), fetchCountryNames(), fetchCustomerManagers()]);
      setVia(v);
      setRules(r);
      setCountries(c);
      setCustomers([...new Set(m.map((x) => x.customer_name))].sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('도착지 설정 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const countryName = (code: string) => countries.find((c) => c.country_code === code)?.name_ko;

  const run = async (fn: () => Promise<void>, done: string) => {
    try {
      setSaving(true);
      await fn();
      await load();
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleForm) return;
    const key = ruleForm.match_key.trim().toUpperCase();
    if (!key) {
      toast.error(t('도착항 또는 국가 코드를 입력해주세요.', 'Enter a port or country code.'));
      return;
    }
    if (ruleForm.mode === 'fixed' && !ruleForm.target) {
      toast.error(t('실제 고객처를 골라주세요.', 'Pick the actual customer.'));
      return;
    }
    if (ruleForm.mode === 'choice' && ruleForm.candidates.length < 2) {
      toast.error(t('건별 선택은 후보 고객처를 2곳 이상 골라주세요.', 'Pick at least two candidates for per-order choice.'));
      return;
    }
    if (ruleForm.isNew && rules.some((r) => r.match_key === key)) {
      toast.error(t('이미 있는 도착지입니다. 목록에서 수정해주세요.', 'This destination already exists. Edit it in the list.'));
      return;
    }
    const ok = await run(
      () =>
        saveDestinationRule(
          {
            match_key: key,
            target_customer: ruleForm.mode === 'fixed' ? ruleForm.target : null,
            choice_candidates: ruleForm.mode === 'choice' ? ruleForm.candidates : null,
            note: ruleForm.note.trim() || null,
          },
          userId
        ),
      t('도착지 연결을 저장했습니다.', 'Destination saved.')
    );
    if (ok) setRuleForm(null);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-[#5A6778]">
        {t(
          '경유 고객처 주문은 판매주문조회의 도착항·국가로 실제 고객처를 찾아 "주식회사 인바디헬스케어_미국(미국법인)"처럼 표시합니다. 판단 순서: PO 변경 화면에서 건별로 고른 값 → 이름2 메모 → 도착항 → 국가 → 도착항이 없으면 국내. 조회 범위·담당자는 판매주문 고객처 기준 그대로입니다.',
          'Orders of via customers are shown as "Customer_actual customer" using the destination port and country. Order: per-order pick → name 2 memo → port → country → domestic if no port. Access scope and owners stay with the sales order customer.'
        )}
      </p>

      {/* 경유 고객처 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#172132]">{t('경유 고객처', 'Via customers')}</h3>
          <Button size="sm" variant="outline" className="border-[#D6DDE7] shadow-none" onClick={() => setAddingVia(!addingVia)}>
            <Plus className="h-4 w-4" />
            {t('추가', 'Add')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {via.map((v) => (
            <span key={v.customer_name} className="inline-flex items-center gap-1.5 rounded-full border border-[#D6DDE7] bg-white px-3 py-1 text-sm">
              {v.customer_name}
              {v.note ? <span className="text-xs text-[#8E98A8]">{v.note}</span> : null}
              <button
                type="button"
                aria-label={t('삭제', 'Delete')}
                onClick={() => {
                  if (window.confirm(t(`"${v.customer_name}"을(를) 경유 고객처에서 뺄까요?`, `Remove "${v.customer_name}"?`))) {
                    void run(() => deleteViaCustomer(v.customer_name), t('경유 고객처에서 뺐습니다.', 'Removed.'));
                  }
                }}
              >
                <X className="h-3.5 w-3.5 text-[#8E98A8] hover:text-red-600" />
              </button>
            </span>
          ))}
        </div>
        {addingVia ? (
          <div className="max-w-md">
            <CustomerPicker
              id="via-add"
              customers={customers}
              exclude={via.map((v) => v.customer_name)}
              placeholder={t('고객처 검색', 'Search customer')}
              onPick={(name) => {
                void run(() => saveViaCustomer({ customer_name: name, note: null }, userId), t('경유 고객처를 추가했습니다.', 'Added.'));
                setAddingVia(false);
              }}
            />
          </div>
        ) : null}
      </section>

      {/* 도착지 연결표 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#172132]">{t('도착지 → 실제 고객처', 'Destination → actual customer')}</h3>
          <Button
            size="sm"
            className="bg-[#8B1538] hover:bg-[#74112F]"
            onClick={() => setRuleForm({ isNew: true, match_key: '', mode: 'fixed', target: null, candidates: [], note: '' })}
          >
            <Plus className="h-4 w-4" />
            {t('도착지 추가', 'Add destination')}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {[t('기준', 'Basis'), t('도착항·국가', 'Port · Country'), t('실제 고객처', 'Actual customer'), t('메모', 'Note'), t('수정', 'Edit'), t('삭제', 'Delete')].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const isPort = r.match_key.includes('_');
                return (
                  <TableRow key={r.match_key}>
                    <TableCell className="whitespace-nowrap text-[#5A6778]">{isPort ? t('도착항', 'Port') : t('국가', 'Country')}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {r.match_key}
                      {!isPort && countryName(r.match_key) ? <span className="ml-1 font-normal text-[#5A6778]">{countryName(r.match_key)}</span> : null}
                    </TableCell>
                    <TableCell>
                      {r.target_customer ?? (
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{t('건별 선택', 'Per order')}</Badge>
                          <span className="text-sm text-[#5A6778]">{(r.choice_candidates ?? []).join(' / ')}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-[#5A6778]" title={r.note ?? ''}>{r.note ?? '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('수정', 'Edit')}
                        onClick={() =>
                          setRuleForm({
                            isNew: false,
                            match_key: r.match_key,
                            mode: r.target_customer ? 'fixed' : 'choice',
                            target: r.target_customer,
                            candidates: r.choice_candidates ?? [],
                            note: r.note ?? '',
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        aria-label={t('삭제', 'Delete')}
                        onClick={() => {
                          if (window.confirm(t(`${r.match_key} 연결을 삭제할까요? 이 도착지는 국가명만 표시됩니다.`, `Delete ${r.match_key}? Only the country will be shown.`))) {
                            void run(() => deleteDestinationRule(r.match_key), t('도착지 연결을 삭제했습니다.', 'Destination deleted.'));
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 국가 한글명 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#172132]">{t('국가 한글명', 'Country names')}</h3>
          <Button
            size="sm"
            variant="outline"
            className="border-[#D6DDE7] shadow-none"
            onClick={() => setCountryForm({ isNew: true, country_code: '', name_ko: '' })}
          >
            <Plus className="h-4 w-4" />
            {t('국가 추가', 'Add country')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {countries.map((c) => (
            <button
              key={c.country_code}
              type="button"
              onClick={() => setCountryForm({ ...c, isNew: false })}
              className="rounded-md border border-[#E4E9EF] bg-white px-2 py-1 text-xs text-[#253143] hover:border-[#8B1538]/40"
            >
              <span className="font-mono text-[#8E98A8]">{c.country_code}</span> {c.name_ko}
            </button>
          ))}
        </div>
      </section>

      {/* 도착지 연결 창 */}
      <Dialog open={ruleForm !== null} onOpenChange={(open) => !open && setRuleForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ruleForm?.isNew ? t('도착지 추가', 'Add destination') : t('도착지 수정', 'Edit destination')}</DialogTitle>
            <DialogDescription>
              {t(
                '도착항 코드(예: O_LGB, A_DXB)는 국가 코드(예: USA, JPN)보다 우선합니다. 같은 국가라도 항구로 고객처가 갈리면 도착항으로 넣어주세요.',
                'Port codes (e.g. O_LGB) take priority over country codes (e.g. USA). Use a port when one country splits by port.'
              )}
            </DialogDescription>
          </DialogHeader>
          {ruleForm ? (
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="dest-key">{t('도착항 또는 국가 코드', 'Port or country code')} <span className="text-red-500">*</span></Label>
                <Input
                  id="dest-key"
                  value={ruleForm.match_key}
                  disabled={!ruleForm.isNew}
                  onChange={(e) => setRuleForm({ ...ruleForm, match_key: e.target.value })}
                  placeholder="O_USMNH / JPN"
                />
              </div>
              <div className="flex gap-1 rounded-md border border-[#D6DDE7] p-0.5 text-sm" role="radiogroup">
                {([
                  ['fixed', t('고객처 고정', 'Fixed customer')],
                  ['choice', t('건별 선택', 'Pick per order')],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={ruleForm.mode === key}
                    onClick={() => setRuleForm({ ...ruleForm, mode: key })}
                    className={cn('flex-1 rounded px-3 py-1.5 text-[#5A6778]', ruleForm.mode === key && 'bg-[#8B1538] text-white')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {ruleForm.mode === 'fixed' ? (
                <div className="space-y-2">
                  <Label htmlFor="dest-target">{t('실제 고객처', 'Actual customer')} <span className="text-red-500">*</span></Label>
                  {ruleForm.target ? (
                    <p className="flex items-center gap-2 text-sm font-medium text-[#253143]">
                      {ruleForm.target}
                      <button type="button" onClick={() => setRuleForm({ ...ruleForm, target: null })} aria-label={t('다시 고르기', 'Change')}>
                        <X className="h-3.5 w-3.5 text-[#8E98A8]" />
                      </button>
                    </p>
                  ) : (
                    <CustomerPicker id="dest-target" customers={customers} exclude={[]} placeholder={t('고객처 검색', 'Search customer')} onPick={(name) => setRuleForm({ ...ruleForm, target: name })} />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="dest-cand">{t('후보 고객처 (2곳 이상)', 'Candidates (2 or more)')} <span className="text-red-500">*</span></Label>
                  <CustomerPicker
                    id="dest-cand"
                    customers={customers}
                    exclude={ruleForm.candidates}
                    placeholder={t('고객처 검색', 'Search customer')}
                    onPick={(name) => setRuleForm({ ...ruleForm, candidates: [...ruleForm.candidates, name] })}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {ruleForm.candidates.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[#8B1538]/10 px-2.5 py-1 text-xs text-[#8B1538]">
                        {c}
                        <button type="button" onClick={() => setRuleForm({ ...ruleForm, candidates: ruleForm.candidates.filter((x) => x !== c) })} aria-label={t('빼기', 'Remove')}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="dest-note">{t('메모', 'Note')}</Label>
                <Input id="dest-note" value={ruleForm.note} onChange={(e) => setRuleForm({ ...ruleForm, note: e.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleForm(null)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSaveRule()} disabled={saving}>
              {saving ? t('저장 중...', 'Saving...') : t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 국가 한글명 창 */}
      <Dialog open={countryForm !== null} onOpenChange={(open) => !open && setCountryForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{countryForm?.isNew ? t('국가 추가', 'Add country') : t('국가명 수정', 'Edit country name')}</DialogTitle>
            <DialogDescription>{t('판매주문조회 국가/지역 열의 3자리 코드입니다.', 'The 3-letter code in the sales order country column.')}</DialogDescription>
          </DialogHeader>
          {countryForm ? (
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="cty-code">{t('국가 코드', 'Country code')}</Label>
                <Input id="cty-code" value={countryForm.country_code} disabled={!countryForm.isNew} onChange={(e) => setCountryForm({ ...countryForm, country_code: e.target.value })} placeholder="CAN" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cty-name">{t('한글명', 'Korean name')}</Label>
                <Input id="cty-name" value={countryForm.name_ko} onChange={(e) => setCountryForm({ ...countryForm, name_ko: e.target.value })} placeholder="캐나다" />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountryForm(null)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button
              className="bg-[#8B1538] hover:bg-[#74112F]"
              disabled={saving}
              onClick={() => {
                if (!countryForm) return;
                const code = countryForm.country_code.trim().toUpperCase();
                if (!code || !countryForm.name_ko.trim()) {
                  toast.error(t('국가 코드와 한글명을 입력해주세요.', 'Enter the code and the name.'));
                  return;
                }
                void run(() => saveCountryName({ country_code: code, name_ko: countryForm.name_ko.trim() }, userId), t('국가명을 저장했습니다.', 'Country saved.')).then((ok) => {
                  if (ok) setCountryForm(null);
                });
              }}
            >
              {t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
