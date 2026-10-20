/**
 * 고객처 계정 관리 — 회원가입·요청서에서 고르는 고객처 (이름은 판매주문조회 고객처 이름과 같아야 변경 통계가 연결됨)
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  deleteCustomerAccount,
  fetchCustomerAccounts,
  fetchCustomerManagers,
  saveCustomerAccount,
} from '@/lib/po-tracker-settings-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { cn } from '@/lib/utils';
import type { CustomerAccount, CustomerManager } from '@/types/po-changes';

interface CustomerAccountSettingsProps {
  userId: string;
}

interface FormState {
  isNew: boolean;
  customer_name: string;
  account_no: string | null;
  sort_order: string;
  is_active: boolean;
}

export const CustomerAccountSettings = ({ userId }: CustomerAccountSettingsProps) => {
  const { t } = useLanguage();
  const { refresh: refreshConfig } = useRequestConfig();
  const [items, setItems] = useState<CustomerAccount[]>([]);
  const [customers, setCustomers] = useState<CustomerManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [accounts, managers] = await Promise.all([fetchCustomerAccounts(), fetchCustomerManagers()]);
      setItems(accounts);
      setCustomers(managers);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('고객처 계정 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 추가 창: 판매주문조회 고객처(고객처 담당자 표)에서 검색해 고름 — 이미 계정인 곳은 제외
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const taken = new Set(items.map((i) => i.customer_name));
    return customers
      .filter((c) => !taken.has(c.customer_name))
      .filter((c) => c.customer_name.toLowerCase().includes(term) || c.account_no.toLowerCase().includes(term))
      .slice(0, 20);
  }, [customers, items, search]);

  const openCreate = () => {
    setSearch('');
    setForm({ isNew: true, customer_name: '', account_no: null, sort_order: String(items.length + 1), is_active: true });
  };

  const openEdit = (item: CustomerAccount) =>
    setForm({
      isNew: false,
      customer_name: item.customer_name,
      account_no: item.account_no,
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });

  const handleSave = async () => {
    if (!form) return;
    if (!form.customer_name) {
      toast.error(t('고객처를 골라주세요.', 'Pick a customer.'));
      return;
    }
    const sortOrder = parseInt(form.sort_order, 10);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      toast.error(t('순서는 0 이상의 숫자여야 합니다.', 'Order must be a number of 0 or more.'));
      return;
    }
    try {
      setSaving(true);
      await saveCustomerAccount(
        { customer_name: form.customer_name, account_no: form.account_no, sort_order: sortOrder, is_active: form.is_active },
        userId
      );
      await load();
      await refreshConfig();
      setForm(null);
      toast.success(t('고객처 계정을 저장했습니다.', 'Customer account saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CustomerAccount) => {
    if (
      !window.confirm(
        t(
          `"${item.customer_name}"을(를) 목록에서 뺄까요? 이미 가입한 계정은 그대로 남습니다. 잠시 숨기려면 수정에서 "사용 중"을 꺼주세요.`,
          `Remove "${item.customer_name}" from the list? Existing accounts stay. To hide it temporarily, turn off "Active" instead.`
        )
      )
    ) {
      return;
    }
    try {
      await deleteCustomerAccount(item.customer_name);
      await load();
      await refreshConfig();
      toast.success(t('고객처 계정을 삭제했습니다.', 'Customer account removed.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-[#5A6778]">
          {t(
            '회원가입과 요청서에서 고르는 고객처 목록입니다. 고객처 계정으로 가입하면 PO 현황에서 자기 고객처의 요청·변경만 봅니다.',
            'Customers available at sign-up and in requests. Customer accounts see only their own requests and changes on the dashboard.'
          )}
        </p>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('고객처 추가', 'Add customer')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {[t('순서', 'Order'), t('고객처', 'Customer'), t('계정 번호', 'Account No.'), t('상태', 'Status'), t('수정', 'Edit'), t('삭제', 'Delete')].map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-[#5A6778]">
                  {t('등록된 고객처 계정이 없습니다.', 'No customer accounts yet.')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.customer_name} className={!item.is_active ? 'opacity-60' : undefined}>
                  <TableCell>{item.sort_order}</TableCell>
                  <TableCell className="font-medium">{item.customer_name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-[#5A6778]">
                    {item.account_no ?? (
                      <span
                        className="font-sans text-amber-700"
                        title={t('판매주문조회에서 이 이름의 고객처를 찾지 못했습니다.', 'No customer with this name in the sales order list.')}
                      >
                        {t('판매주문조회에 없음', 'Not in sales orders')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.is_active ? 'default' : 'outline'}>
                      {item.is_active ? t('사용', 'Active') : t('비활성', 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)} aria-label={t('수정', 'Edit')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => void handleDelete(item)}
                      aria-label={t('삭제', 'Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.isNew ? t('고객처 계정 추가', 'Add customer account') : t('고객처 계정 수정', 'Edit customer account')}</DialogTitle>
            <DialogDescription>
              {t(
                '판매주문조회에 나온 고객처에서 고릅니다. 이름이 정확히 같아야 변경 통계가 연결됩니다.',
                'Pick from customers in the sales order list. The name must match exactly for change statistics to link.'
              )}
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-4 py-2">
              {form.isNew ? (
                <div className="space-y-2">
                  <Label htmlFor="ca-search">{t('고객처 검색', 'Search customer')} <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
                    <Input
                      id="ca-search"
                      className="pl-10"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('고객처 이름 또는 계정 번호', 'Customer name or account number')}
                    />
                  </div>
                  {search.trim() ? (
                    <ul className="max-h-48 overflow-auto rounded-md border border-[#E4E9EF]">
                      {candidates.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-[#8E98A8]">{t('찾는 고객처가 없습니다.', 'No matching customers.')}</li>
                      ) : (
                        candidates.map((c) => (
                          <li key={c.account_no}>
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, customer_name: c.customer_name, account_no: c.account_no })}
                              className={cn(
                                'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]',
                                form.account_no === c.account_no && 'bg-[#8B1538]/5 font-medium text-[#8B1538]'
                              )}
                            >
                              <span>{c.customer_name}</span>
                              <span className="font-mono text-xs text-[#8E98A8]">{c.account_no}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                  {form.customer_name ? (
                    <p className="text-sm text-[#253143]">
                      {t('선택', 'Selected')}: <span className="font-medium">{form.customer_name}</span>
                      <span className="ml-1 font-mono text-xs text-[#8E98A8]">{form.account_no}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm font-medium text-[#253143]">{form.customer_name}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ca-order">{t('순서', 'Order')}</Label>
                  <Input id="ca-order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Checkbox id="ca-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v === true })} />
                  <Label htmlFor="ca-active">{t('사용 중', 'Active')}</Label>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t('저장 중...', 'Saving...') : t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
