/**
 * 고객처 담당자 관리 — 고객처(계정 번호)별 영업관리팀 담당자·메일 (로그인 메일로 담당 고객처 확인)
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Pencil, Plus, Search, Trash2, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteCustomerManager,
  fetchCustomerManagers,
  fetchUnassignedCustomers,
  reassignCustomerManager,
  saveCustomerManagers,
  type UnassignedCustomer,
} from '@/lib/po-tracker-settings-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { CustomerManager } from '@/types/po-changes';

interface CustomerManagerSettingsProps {
  userId: string;
}

/** 담당자 한 명 (이름 + 메일) */
interface ManagerOption {
  name: string;
  email: string;
  count: number;
}

interface EditForm {
  isNew: boolean;
  account_no: string;
  customer_name: string;
  manager_name: string;
  manager_email: string;
  note: string;
}

/** Excel 일괄 반영 미리보기 */
interface ImportPreview {
  rows: Pick<CustomerManager, 'account_no' | 'customer_name' | 'manager_name' | 'manager_email' | 'note'>[];
  added: number;
  changed: number;
  same: number;
  invalid: number;
}

const PAGE_SIZE = 50;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;
const ALL = '__all__';

export const CustomerManagerSettings = ({ userId }: CustomerManagerSettingsProps) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<CustomerManager[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<EditForm | null>(null);
  const [reassign, setReassign] = useState<{ from: string; to: string; name: string; email: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [rows, missing] = await Promise.all([fetchCustomerManagers(), fetchUnassignedCustomers()]);
      setItems(rows);
      setUnassigned(missing);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('고객처 담당자 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 담당자 목록 (메일 기준, 담당 고객처 수 포함) */
  const managers = useMemo<ManagerOption[]>(() => {
    const map = new Map<string, ManagerOption>();
    items.forEach((i) => {
      const cur = map.get(i.manager_email);
      if (cur) cur.count += 1;
      else map.set(i.manager_email, { name: i.manager_name, email: i.manager_email, count: 1 });
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (managerFilter !== ALL && i.manager_email !== managerFilter) return false;
      if (!term) return true;
      return [i.account_no, i.customer_name, i.manager_name, i.manager_email].some((v) => v.toLowerCase().includes(term));
    });
  }, [items, search, managerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const openEdit = (item: CustomerManager) =>
    setForm({
      isNew: false,
      account_no: item.account_no,
      customer_name: item.customer_name,
      manager_name: item.manager_name,
      manager_email: item.manager_email,
      note: item.note ?? '',
    });

  const openCreate = (preset?: UnassignedCustomer) =>
    setForm({
      isNew: true,
      account_no: preset?.account_no ?? '',
      customer_name: preset?.customer_name ?? '',
      manager_name: '',
      manager_email: '',
      note: '',
    });

  const handleSave = async () => {
    if (!form) return;
    const accountNo = form.account_no.trim().toUpperCase();
    if (!accountNo || !form.customer_name.trim()) {
      toast.error(t('계정 번호와 고객처 이름을 입력해주세요.', 'Enter the account number and customer name.'));
      return;
    }
    if (!form.manager_name.trim() || !EMAIL_PATTERN.test(form.manager_email.trim())) {
      toast.error(t('담당자 이름과 올바른 메일주소를 입력해주세요.', 'Enter the manager name and a valid email.'));
      return;
    }
    if (form.isNew && items.some((i) => i.account_no === accountNo)) {
      toast.error(t('이미 등록된 계정 번호입니다. 목록에서 수정해주세요.', 'This account is already registered. Edit it in the list.'));
      return;
    }
    try {
      setSaving(true);
      await saveCustomerManagers(
        [{
          account_no: accountNo,
          customer_name: form.customer_name.trim(),
          manager_name: form.manager_name.trim(),
          manager_email: form.manager_email.trim(),
          note: form.note.trim() || null,
        }],
        userId
      );
      await load();
      setForm(null);
      toast.success(t('고객처 담당자를 저장했습니다.', 'Customer manager saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CustomerManager) => {
    if (!window.confirm(t(`${item.customer_name} 담당자 지정을 삭제할까요?`, `Remove the manager for ${item.customer_name}?`))) return;
    try {
      await deleteCustomerManager(item.account_no);
      await load();
      toast.success(t('담당자 지정을 삭제했습니다.', 'Manager removed.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  const handleReassign = async () => {
    if (!reassign) return;
    const picked = managers.find((m) => m.email === reassign.to);
    const toName = reassign.to === 'new' ? reassign.name.trim() : picked?.name;
    const toEmail = reassign.to === 'new' ? reassign.email.trim() : picked?.email;
    if (!reassign.from || !toName || !toEmail || !EMAIL_PATTERN.test(toEmail)) {
      toast.error(t('넘겨줄 담당자와 받을 담당자를 확인해주세요.', 'Check both the current and the new manager.'));
      return;
    }
    if (toEmail.toLowerCase() === reassign.from) {
      toast.error(t('같은 담당자입니다.', 'That is the same manager.'));
      return;
    }
    try {
      setSaving(true);
      const count = await reassignCustomerManager(reassign.from, { manager_name: toName, manager_email: toEmail }, userId);
      await load();
      setReassign(null);
      toast.success(t(`고객처 ${count}곳의 담당자를 ${toName}(으)로 바꿨습니다.`, `Moved ${count} customers to ${toName}.`));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Excel(계정 번호·이름·담당자·담당자 이메일 주소) 읽어서 현재 목록과 비교
   */
  const handleFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const current = new Map(items.map((i) => [i.account_no, i]));
      const rows: ImportPreview['rows'] = [];
      let added = 0;
      let changed = 0;
      let same = 0;
      let invalid = 0;

      raw.forEach((r) => {
        const account = String(r['계정 번호'] ?? '').trim().toUpperCase();
        const customer = String(r['이름'] ?? '').trim();
        const name = String(r['담당자'] ?? '').trim();
        const email = String(r['담당자 이메일 주소'] ?? '').trim().toLowerCase();
        if (!account || !customer || !name || !EMAIL_PATTERN.test(email)) {
          invalid += 1;
          return;
        }
        const prev = current.get(account);
        if (!prev) added += 1;
        else if (prev.customer_name === customer && prev.manager_name === name && prev.manager_email === email) {
          same += 1;
          return;
        } else changed += 1;
        rows.push({ account_no: account, customer_name: customer, manager_name: name, manager_email: email, note: prev?.note ?? null });
      });

      if (raw.length === 0 || added + changed + same === 0) {
        toast.error(t(
          '읽을 수 있는 행이 없습니다. 열 이름(계정 번호, 이름, 담당자, 담당자 이메일 주소)을 확인해주세요.',
          'No readable rows. Check the column names (계정 번호, 이름, 담당자, 담당자 이메일 주소).'
        ));
        return;
      }
      setPreview({ rows, added, changed, same, invalid });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('담당자 Excel 읽기 실패:', error);
      }
      toast.error(t('Excel 파일을 읽지 못했습니다.', 'Could not read the Excel file.'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    try {
      setSaving(true);
      await saveCustomerManagers(preview.rows, userId);
      await load();
      toast.success(t(`${preview.rows.length}건을 반영했습니다.`, `Applied ${preview.rows.length} rows.`));
      setPreview(null);
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-[#5A6778]">
          {t(
            '고객처(판매주문조회 계정 번호)별 영업관리팀 담당자입니다. 담당자 메일로 로그인하면 PO 변경 페이지에서 "내 담당 고객처만" 볼 수 있습니다.',
            'Sales management owner per customer (account number in the sales order list). Owners who log in with this email can filter PO Changes to "My customers only".'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button variant="outline" className="border-[#D6DDE7] shadow-none" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {t('Excel로 일괄 반영', 'Apply from Excel')}
          </Button>
          <Button
            variant="outline"
            className="border-[#D6DDE7] shadow-none"
            onClick={() => setReassign({ from: '', to: '', name: '', email: '' })}
          >
            <UserRoundCog className="mr-2 h-4 w-4" />
            {t('담당자 일괄 변경', 'Reassign owner')}
          </Button>
          <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => openCreate()}>
            <Plus className="mr-2 h-4 w-4" />
            {t('고객처 추가', 'Add customer')}
          </Button>
        </div>
      </div>

      {unassigned.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800">
            {t(`담당자 미지정 고객처 ${unassigned.length}곳`, `${unassigned.length} customers without an owner`)}
          </h3>
          <p className="mt-0.5 text-xs text-amber-700">
            {t('판매주문조회에 새로 나타난 고객처입니다. 담당자를 지정해주세요.', 'New customers from the sales order list. Please assign an owner.')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unassigned.slice(0, 30).map((u) => (
              <Button
                key={u.account_no}
                size="sm"
                variant="outline"
                className="h-8 border-amber-300 bg-white text-amber-900 shadow-none hover:bg-amber-100"
                onClick={() => openCreate(u)}
              >
                {u.customer_name ?? u.account_no}
                <span className="ml-1 text-xs text-amber-700">{u.account_no}</span>
              </Button>
            ))}
            {unassigned.length > 30 ? (
              <span className="self-center text-xs text-amber-700">{t(`외 ${unassigned.length - 30}곳`, `+${unassigned.length - 30} more`)}</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setManagerFilter(ALL); setPage(0); }}
          className={cn('rounded-full border-[#D6DDE7] bg-white shadow-none', managerFilter === ALL && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white')}
        >
          {t(`전체 ${items.length}`, `All ${items.length}`)}
        </Button>
        {managers.map((m) => (
          <Button
            key={m.email}
            size="sm"
            variant="outline"
            onClick={() => { setManagerFilter(m.email); setPage(0); }}
            className={cn('rounded-full border-[#D6DDE7] bg-white shadow-none', managerFilter === m.email && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white')}
            title={m.email}
          >
            {m.name} {m.count}
          </Button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
        <Input
          className="pl-10"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder={t('고객처, 계정 번호, 담당자 검색...', 'Search customer, account or owner...')}
          aria-label={t('검색', 'Search')}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                t('계정 번호', 'Account No.'),
                t('고객처', 'Customer'),
                t('담당자', 'Owner'),
                t('메일주소', 'Email'),
                t('메모', 'Note'),
                t('수정', 'Edit'),
                t('삭제', 'Delete'),
              ].map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-[#5A6778]">
                  {t('조건에 맞는 고객처가 없습니다.', 'No customers match.')}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((item) => (
                <TableRow key={item.account_no}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-[#5A6778]">{item.account_no}</TableCell>
                  <TableCell className="font-medium">{item.customer_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.manager_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-[#5A6778]">{item.manager_email}</TableCell>
                  <TableCell className="max-w-xs truncate text-[#5A6778]" title={item.note ?? ''}>{item.note ?? '-'}</TableCell>
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

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-[#5A6778]">
          <span>
            {t(
              `${filtered.length}곳 중 ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}`,
              `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`
            )}
          </span>
          <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            {t('이전', 'Prev')}
          </Button>
          <Button size="sm" variant="outline" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
            {t('다음', 'Next')}
          </Button>
        </div>
      ) : null}

      {/* 추가·수정 */}
      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.isNew ? t('고객처 담당자 추가', 'Add customer owner') : t('고객처 담당자 수정', 'Edit customer owner')}</DialogTitle>
            <DialogDescription>
              {t('계정 번호는 판매주문조회의 계정 번호와 같아야 합니다.', 'The account number must match the sales order list.')}
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cm-account">{t('계정 번호', 'Account No.')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="cm-account"
                    value={form.account_no}
                    disabled={!form.isNew}
                    onChange={(e) => setForm({ ...form, account_no: e.target.value })}
                    placeholder="HC000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cm-customer">{t('고객처', 'Customer')} <span className="text-red-500">*</span></Label>
                  <Input id="cm-customer" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('기존 담당자에서 선택', 'Pick an existing owner')}</Label>
                <Select
                  value={managers.some((m) => m.email === form.manager_email) ? form.manager_email : ''}
                  onValueChange={(v) => {
                    const m = managers.find((x) => x.email === v);
                    if (m) setForm({ ...form, manager_name: m.name, manager_email: m.email });
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('담당자 선택', 'Select owner')} /></SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.email} value={m.email}>{m.name} · {m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cm-name">{t('담당자 이름', 'Owner name')} <span className="text-red-500">*</span></Label>
                  <Input id="cm-name" value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cm-email">{t('메일주소 (로그인 메일)', 'Email (login)')} <span className="text-red-500">*</span></Label>
                  <Input id="cm-email" type="email" value={form.manager_email} onChange={(e) => setForm({ ...form, manager_email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cm-note">{t('메모', 'Note')}</Label>
                <Input id="cm-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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

      {/* 담당자 일괄 변경 */}
      <Dialog open={reassign !== null} onOpenChange={(open) => !open && setReassign(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('담당자 일괄 변경', 'Reassign owner')}</DialogTitle>
            <DialogDescription>
              {t('한 담당자가 맡던 고객처를 모두 다른 담당자에게 넘깁니다.', 'Move every customer of one owner to another owner.')}
            </DialogDescription>
          </DialogHeader>
          {reassign ? (
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label>{t('넘겨줄 담당자', 'Current owner')}</Label>
                <Select value={reassign.from} onValueChange={(v) => setReassign({ ...reassign, from: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('담당자 선택', 'Select owner')} /></SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.email} value={m.email}>{m.name} · {t(`${m.count}곳`, `${m.count} customers`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('받을 담당자', 'New owner')}</Label>
                <Select value={reassign.to} onValueChange={(v) => setReassign({ ...reassign, to: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('담당자 선택', 'Select owner')} /></SelectTrigger>
                  <SelectContent>
                    {managers.filter((m) => m.email !== reassign.from).map((m) => (
                      <SelectItem key={m.email} value={m.email}>{m.name} · {m.email}</SelectItem>
                    ))}
                    <SelectItem value="new">{t('새 담당자 입력', 'Enter a new owner')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {reassign.to === 'new' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ra-name">{t('담당자 이름', 'Owner name')}</Label>
                    <Input id="ra-name" value={reassign.name} onChange={(e) => setReassign({ ...reassign, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ra-email">{t('메일주소', 'Email')}</Label>
                    <Input id="ra-email" type="email" value={reassign.email} onChange={(e) => setReassign({ ...reassign, email: e.target.value })} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassign(null)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleReassign()} disabled={saving}>
              {saving ? t('변경 중...', 'Updating...') : t('일괄 변경', 'Reassign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel 일괄 반영 미리보기 */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Excel 일괄 반영', 'Apply from Excel')}</DialogTitle>
            <DialogDescription>
              {t(
                '계정 번호 기준으로 새 고객처는 추가하고 바뀐 담당자는 수정합니다. 파일에 없는 고객처는 그대로 둡니다.',
                'New accounts are added and changed owners updated by account number. Customers missing from the file are kept.'
              )}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <ul className="space-y-1.5 py-2 text-sm text-[#253143]">
              <li>{t(`추가 ${preview.added}건`, `${preview.added} new`)}</li>
              <li>{t(`수정 ${preview.changed}건`, `${preview.changed} changed`)}</li>
              <li className="text-[#5A6778]">{t(`변경 없음 ${preview.same}건`, `${preview.same} unchanged`)}</li>
              {preview.invalid ? (
                <li className="text-amber-700">{t(`빈칸·메일 형식 오류로 건너뜀 ${preview.invalid}건`, `${preview.invalid} skipped (blank or invalid email)`)}</li>
              ) : null}
            </ul>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button
              className="bg-[#8B1538] hover:bg-[#74112F]"
              onClick={() => void handleImport()}
              disabled={saving || !preview || preview.rows.length === 0}
            >
              {saving ? t('반영 중...', 'Applying...') : t(`${preview?.rows.length ?? 0}건 반영`, `Apply ${preview?.rows.length ?? 0}`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
