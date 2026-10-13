/**
 * 요청구분 리스트 관리 (CRUD)
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  deleteRequestTypeSetting,
  fetchRequestTypeSettings,
  upsertRequestTypeSetting,
} from '@/lib/request-config-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { useLanguage } from '@/context/LanguageContext';
import type { RequestTypeSetting } from '@/types/request-config';

interface RequestTypeSettingsProps {
  userId: string;
}

interface FormState {
  id?: string;
  value: string;
  label: string;
  description: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm = (sortOrder: number): FormState => ({
  value: '',
  label: '',
  description: '',
  sort_order: String(sortOrder),
  is_active: true,
});

export const RequestTypeSettings = ({ userId }: RequestTypeSettingsProps) => {
  const { refresh: refreshGlobal } = useRequestConfig();
  const { t } = useLanguage();
  const [items, setItems] = useState<RequestTypeSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(1));

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRequestTypeSettings(false, { strict: true });
      setItems(data);
    } catch (error) {
      console.error('요청구분 목록 조회 실패:', error);
      toast.error(getReadableErrorMessage(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const openCreate = () => {
    setIsNew(true);
    setForm(emptyForm(items.length + 1));
    setModalOpen(true);
  };

  const openEdit = (item: RequestTypeSetting) => {
    setIsNew(false);
    setForm({
      id: item.id,
      value: item.value,
      label: item.label,
      description: item.description ?? '',
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast.error(t('요청구분명을 입력해주세요.', 'Enter a request type name.'));
      return;
    }
    if (isNew && !form.value.trim()) {
      toast.error(t('코드(value)를 입력해주세요.', 'Enter a code (value).'));
      return;
    }

    const sortOrder = parseInt(form.sort_order, 10);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      toast.error(t('순서는 0 이상의 숫자여야 합니다.', 'Order must be a number of 0 or more.'));
      return;
    }

    try {
      setSaving(true);
      await upsertRequestTypeSetting(
        {
          id: form.id,
          value: form.value.trim(),
          label: form.label.trim(),
          description: form.description.trim() || null,
          sort_order: sortOrder,
          is_active: form.is_active,
        },
        userId
      );
      await loadItems();
      await refreshGlobal();
      setModalOpen(false);
      toast.success(t('요청구분이 저장되었습니다.', 'Request type saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RequestTypeSetting) => {
    if (!window.confirm(t(`"${item.label}" 항목을 삭제하시겠습니까?`, `Delete "${item.label}"?`))) return;
    try {
      await deleteRequestTypeSetting(item.id);
      await loadItems();
      await refreshGlobal();
      toast.success(t('요청구분이 삭제되었습니다.', 'Request type deleted.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5A6778]">
          {t('요청접수 카드 및 필터에 반영되는 요청구분 목록을 관리합니다.', 'Manage the request types shown on request cards and filters.')}
        </p>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('항목 추가', 'Add item')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('순서', 'Order'),
                  t('코드', 'Code'),
                  t('요청구분', 'Request type'),
                  t('설명', 'Description'),
                  t('상태', 'Status'),
                  t('수정', 'Edit'),
                  t('삭제', 'Delete'),
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-[#5A6778]">
                    {t('등록된 요청구분이 없습니다.', 'No request types yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className={!item.is_active ? 'opacity-60' : undefined}>
                    <TableCell>{item.sort_order}</TableCell>
                    <TableCell className="font-mono text-xs text-[#5A6778]">{item.value}</TableCell>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell className="max-w-xs truncate text-[#5A6778]" title={item.description ?? ''}>
                      {item.description ?? '-'}
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
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? t('요청구분 추가', 'Add request type') : t('요청구분 수정', 'Edit request type')}</DialogTitle>
            <DialogDescription>
              {t('코드(value)는 시스템 내부 식별자입니다. 수정 시에는 변경할 수 없습니다.', 'The code (value) is an internal identifier and cannot be changed after creation.')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{t('코드 (value)', 'Code (value)')} {isNew && <span className="text-red-500">*</span>}</Label>
              <Input
                value={form.value}
                onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                disabled={!isNew}
                placeholder={t('예: product_add', 'e.g. product_add')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('요청구분', 'Request type')} <span className="text-red-500">*</span></Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('예: 제품/상품 추가', 'e.g. Add product')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('설명', 'Description')}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('순서', 'Order')}</Label>
              <Input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="type-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v === true }))}
              />
              <Label htmlFor="type-active">{t('사용 중', 'Active')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('취소', 'Cancel')}
            </Button>
            <Button
              className="bg-[#8B1538] hover:bg-[#74112F]"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? t('저장 중...', 'Saving...') : t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
