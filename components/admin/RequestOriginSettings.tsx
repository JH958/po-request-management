/**
 * 요청 부서 관리 — 변경 사유의 요청 출처로 고르는 부서(회사·부서·표시명·분류)
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { fetchRequestOrigins } from '@/lib/po-changes-api';
import { deleteRequestOrigin, saveRequestOrigin } from '@/lib/po-tracker-settings-api';
import { PRODUCTION_FUNCTION } from '@/lib/po-changes-utils';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import type { PoRequestOrigin } from '@/types/po-changes';

interface RequestOriginSettingsProps {
  userId: string;
}

interface FormState {
  code?: string;
  department: string;
  company: string;
  display_name: string;
  category: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm = (sortOrder: number): FormState => ({
  department: '',
  company: '본사',
  display_name: '',
  category: '',
  sort_order: String(sortOrder),
  is_active: true,
});

export const RequestOriginSettings = ({ userId }: RequestOriginSettingsProps) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<PoRequestOrigin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await fetchRequestOrigins());
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 부서 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (item: PoRequestOrigin) =>
    setForm({
      code: item.code,
      department: item.department,
      company: item.company,
      display_name: item.display_name,
      category: item.category,
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });

  const handleSave = async () => {
    if (!form) return;
    if (!form.department.trim() || !form.company.trim() || !form.category.trim()) {
      toast.error(t('부서·회사·분류를 입력해주세요.', 'Enter the department, company and category.'));
      return;
    }
    const sortOrder = parseInt(form.sort_order, 10);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      toast.error(t('순서는 0 이상의 숫자여야 합니다.', 'Order must be a number of 0 or more.'));
      return;
    }
    // 표시명을 비우면 "부서 (회사)"로
    const displayName = form.display_name.trim() || `${form.department.trim()} (${form.company.trim()})`;
    if (items.some((i) => i.display_name === displayName && i.code !== form.code)) {
      toast.error(t('같은 표시명의 부서가 이미 있습니다.', 'A department with this display name already exists.'));
      return;
    }
    try {
      setSaving(true);
      await saveRequestOrigin(
        {
          code: form.code,
          department: form.department.trim(),
          company: form.company.trim(),
          display_name: displayName,
          category: form.category.trim(),
          sort_order: sortOrder,
          is_active: form.is_active,
        },
        userId
      );
      await load();
      setForm(null);
      toast.success(t('요청 부서를 저장했습니다.', 'Department saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: PoRequestOrigin) => {
    if (!window.confirm(t(`"${item.display_name}"을(를) 삭제할까요?`, `Delete "${item.display_name}"?`))) return;
    try {
      await deleteRequestOrigin(item.code);
      await load();
      toast.success(t('요청 부서를 삭제했습니다.', 'Department deleted.'));
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
            'PO 변경 사유를 입력할 때 요청 출처로 고르는 부서입니다. 분류는 "회사구분_기능" 형식(예: 본사_생산)이며, 기능이 "생산"인 부서는 생산부로 묶여 필터·통계에 쓰입니다.',
            'Departments picked as the requester when entering a change reason. Categories use "company_function" (e.g. 본사_생산); departments whose function is "생산" are grouped as Production.'
          )}
        </p>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => setForm(emptyForm(items.length + 1))}>
          <Plus className="mr-2 h-4 w-4" />
          {t('부서 추가', 'Add department')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                t('순서', 'Order'),
                t('표시명', 'Display name'),
                t('부서', 'Department'),
                t('회사', 'Company'),
                t('분류', 'Category'),
                t('상태', 'Status'),
                t('수정', 'Edit'),
                t('삭제', 'Delete'),
              ].map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-[#5A6778]">
                  {t('등록된 부서가 없습니다.', 'No departments yet.')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.code} className={!item.is_active ? 'opacity-60' : undefined}>
                  <TableCell>{item.sort_order}</TableCell>
                  <TableCell className="font-medium">{item.display_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.department}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.company}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.category}
                    {item.function_group === PRODUCTION_FUNCTION ? (
                      <Badge variant="outline" className="ml-2 border-[#8B1538]/30 text-[#8B1538]">{t('생산부', 'Production')}</Badge>
                    ) : null}
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
            <DialogTitle>{form?.code ? t('요청 부서 수정', 'Edit department') : t('요청 부서 추가', 'Add department')}</DialogTitle>
            <DialogDescription>
              {t(
                '이미 사유에 쓰인 부서는 삭제할 수 없습니다. 더 쓰지 않으면 "사용 중"을 꺼주세요.',
                'Departments already used in reasons cannot be deleted. Turn off "Active" instead.'
              )}
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="origin-department">{t('부서', 'Department')} <span className="text-red-500">*</span></Label>
                  <Input id="origin-department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder={t('예: 제조팀', 'e.g. 제조팀')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="origin-company">{t('회사', 'Company')} <span className="text-red-500">*</span></Label>
                  <Input id="origin-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder={t('예: 본사, 코르트', 'e.g. 본사, 코르트')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="origin-display">{t('표시명', 'Display name')}</Label>
                <Input
                  id="origin-display"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder={t('예: 제조팀 (본사·웰니스 생산) — 비우면 "부서 (회사)"', 'e.g. 제조팀 (본사·웰니스 생산) — blank uses "department (company)"')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="origin-category">{t('분류', 'Category')} <span className="text-red-500">*</span></Label>
                <Input
                  id="origin-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={t('예: 본사_생산, 국내법인_영업관리', 'e.g. 본사_생산, 국내법인_영업관리')}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="origin-order">{t('순서', 'Order')}</Label>
                  <Input id="origin-order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Checkbox id="origin-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v === true })} />
                  <Label htmlFor="origin-active">{t('사용 중', 'Active')}</Label>
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
