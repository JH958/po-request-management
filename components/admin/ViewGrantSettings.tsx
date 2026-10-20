/**
 * 조회 권한 관리 — 본사/국내법인 부서에 특정 고객처의 PO 현황(변경·요청 통계)을 추가로 열어 줌 (관리자 전용)
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
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
import { fetchRequestOrigins } from '@/lib/po-changes-api';
import { addViewGrants, deleteViewGrant, fetchCustomerManagers, fetchViewGrants } from '@/lib/po-tracker-settings-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import type { PoRequestOrigin, ViewGrant } from '@/types/po-changes';

/** 영업관리팀은 이미 전체를 보므로 권한 부여 대상에서 뺌 */
const isSalesTeamOrigin = (o: PoRequestOrigin): boolean => o.department.includes('영업관리') && o.company === '본사';

export const ViewGrantSettings = () => {
  const { t } = useLanguage();
  const [grants, setGrants] = useState<ViewGrant[]>([]);
  const [origins, setOrigins] = useState<PoRequestOrigin[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [originCode, setOriginCode] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [grantRows, originRows, managers] = await Promise.all([fetchViewGrants(), fetchRequestOrigins(), fetchCustomerManagers()]);
      setGrants(grantRows);
      setOrigins(originRows);
      setCustomers([...new Set(managers.map((m) => m.customer_name))].sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('조회 권한 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const originName = (code: string) => origins.find((o) => o.code === code)?.display_name ?? code;
  const grantable = origins.filter((o) => o.is_active && !isSalesTeamOrigin(o));

  // 부서별로 묶어서 표시
  const byOrigin = useMemo(() => {
    const map = new Map<string, ViewGrant[]>();
    grants.forEach((g) => {
      const list = map.get(g.origin_code);
      if (list) list.push(g);
      else map.set(g.origin_code, [g]);
    });
    return [...map];
  }, [grants]);

  const already = new Set(grants.filter((g) => g.origin_code === originCode).map((g) => g.customer_name));
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return customers.filter((c) => c.toLowerCase().includes(term) && !picked.includes(c)).slice(0, 20);
  }, [customers, search, picked]);

  const openCreate = () => {
    setOriginCode('');
    setPicked([]);
    setSearch('');
    setNote('');
    setOpen(true);
  };

  const handleSave = async () => {
    const toAdd = picked.filter((c) => !already.has(c));
    if (!originCode || toAdd.length === 0) {
      toast.error(t('부서와 고객처를 골라주세요.', 'Pick a department and at least one customer.'));
      return;
    }
    try {
      setSaving(true);
      await addViewGrants(originCode, toAdd, note.trim() || null);
      await load();
      setOpen(false);
      toast.success(t(`고객처 ${toAdd.length}곳의 조회 권한을 부여했습니다.`, `Granted access to ${toAdd.length} customers.`));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (grant: ViewGrant) => {
    if (!window.confirm(t(`${originName(grant.origin_code)}의 "${grant.customer_name}" 조회 권한을 회수할까요?`, `Revoke access to "${grant.customer_name}" for ${originName(grant.origin_code)}?`))) return;
    try {
      await deleteViewGrant(grant.id);
      await load();
      toast.success(t('조회 권한을 회수했습니다.', 'Access revoked.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
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
            '본사/국내법인 부서는 기본적으로 자기 부서가 요청한 변경·요청만 PO 현황에서 봅니다. 여기서 고객처를 열어 주면 그 부서 전원이 해당 고객처의 변경·요청 통계도 봅니다.',
            'Departments see only their own requests and changes by default. Granting a customer lets everyone in the department see that customer’s statistics too.'
          )}
        </p>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('조회 권한 부여', 'Grant access')}
        </Button>
      </div>

      {byOrigin.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('부여한 조회 권한이 없습니다.', 'No access granted yet.')}
        </p>
      ) : (
        <div className="space-y-3">
          {byOrigin.map(([code, list]) => (
            <section key={code} className="rounded-lg border bg-white p-4">
              <h3 className="font-semibold text-[#172132]">
                {originName(code)} <span className="ml-1 text-sm font-normal text-[#5A6778]">{t(`고객처 ${list.length}곳`, `${list.length} customers`)}</span>
              </h3>
              <ul className="mt-3 divide-y divide-[#EEF1F5]">
                {list.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-medium text-[#253143]">{g.customer_name}</span>
                      {g.note ? <span className="ml-2 text-[#5A6778]">{g.note}</span> : null}
                      <span className="ml-2 text-xs text-[#8E98A8]">
                        {g.granted_by_name ?? '-'} · {format(new Date(g.created_at), 'yyyy-MM-dd')}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => void handleDelete(g)}
                      aria-label={t('회수', 'Revoke')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('조회 권한 부여', 'Grant access')}</DialogTitle>
            <DialogDescription>
              {t('부서 단위로 부여합니다. 그 부서로 가입한 모든 계정에 적용됩니다.', 'Granted per department — applies to every account in it.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{t('부서', 'Department')} <span className="text-red-500">*</span></Label>
              <Select value={originCode} onValueChange={setOriginCode}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t('부서 선택', 'Select a department')} /></SelectTrigger>
                <SelectContent>
                  {grantable.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vg-search">{t('고객처 (여러 곳 가능)', 'Customers (multiple)')} <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
                <Input
                  id="vg-search"
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('고객처 이름 검색', 'Search customer')}
                />
              </div>
              {candidates.length > 0 ? (
                <ul className="max-h-40 overflow-auto rounded-md border border-[#E4E9EF]">
                  {candidates.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#F8FAFC]"
                        onClick={() => {
                          setPicked([...picked, c]);
                          setSearch('');
                        }}
                      >
                        {c}
                        {already.has(c) ? <span className="ml-2 text-xs text-[#8E98A8]">{t('이미 부여됨', 'already granted')}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {picked.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {picked.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[#8B1538]/10 px-2.5 py-1 text-xs text-[#8B1538]">
                      {c}
                      <button type="button" onClick={() => setPicked(picked.filter((x) => x !== c))} aria-label={t('빼기', 'Remove')}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vg-note">{t('메모', 'Note')}</Label>
              <Input id="vg-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('예: 미국법인 생산 일정 확인용', 'e.g. to follow US production schedule')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t('취소', 'Cancel')}</Button>
            <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t('저장 중...', 'Saving...') : t('부여', 'Grant')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
