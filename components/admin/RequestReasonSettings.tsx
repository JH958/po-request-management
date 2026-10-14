/**
 * PO 변경 사유 리스트 관리 (CRUD) — 요청 작성 팝업의 요청사유 드롭다운
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
  deleteRequestReasonSetting,
  fetchRequestReasonSettings,
  upsertRequestReasonSetting,
} from '@/lib/request-config-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { useLanguage } from '@/context/LanguageContext';
import type { RequestReasonSetting } from '@/types/request-config';

interface RequestReasonSettingsProps {
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

export const RequestReasonSettings = ({ userId }: RequestReasonSettingsProps) => {
  const { refresh: refreshGlobal } = useRequestConfig();
  const { t } = useLanguage();
  const [items, setItems] = useState<RequestReasonSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(1));

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRequestReasonSettings(false, { strict: true });
      setItems(data);
    } catch (error) {
      console.error('요청사유 목록 조회 실패:', error);
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

  const openEdit = (item: RequestReasonSetting) => {
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
      toast.error(t('PO 변경 사유를 입력해주세요.', 'Enter a PO change reason.'));
      return;
    }

    const sortOrder = parseInt(form.sort_order, 10);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      toast.error(t('순서는 0 이상의 숫자여야 합니다.', 'Order must be a number of 0 or more.'));
      return;
    }

    const label = form.label.trim();

    try {
      setSaving(true);
      await upsertRequestReasonSetting(
        {
          id: form.id,
          value: label,
          label,
          description: form.description.trim() || null,
          sort_order: sortOrder,
          is_active: form.is_active,
        },
        userId
      );
      await loadItems();
      await refreshGlobal();
      setModalOpen(false);
      toast.success(t('PO 변경 사유가 저장되었습니다.', 'PO change reason saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RequestReasonSetting) => {
    if (!window.confirm(t(`"${item.label}" 항목을 삭제하시겠습니까?`, `Delete "${item.label}"?`))) return;
    try {
      await deleteRequestReasonSetting(item.id);
      await loadItems();
      await refreshGlobal();
      toast.success(t('PO 변경 사유가 삭제되었습니다.', 'PO change reason deleted.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5A6778]">
          {t('요청 작성 팝업의 요청사유 드롭다운에 반영되는 목록을 관리합니다.', 'Manage the reasons shown in the request form dropdown.')}
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
                  t('PO 변경 사유', 'PO change reason'),
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
                  <TableCell colSpan={6} className="py-8 text-center text-[#5A6778]">
                    {t('등록된 PO 변경 사유가 없습니다.', 'No PO change reasons yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className={!item.is_active ? 'opacity-60' : undefined}>
                    <TableCell>{item.sort_order}</TableCell>
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
            <DialogTitle>{isNew ? t('PO 변경 사유 추가', 'Add PO change reason') : t('PO 변경 사유 수정', 'Edit PO change reason')}</DialogTitle>
            <DialogDescription>
              {t('사유 이름은 요청에 그대로 저장됩니다.', 'The reason name is stored on requests as-is.')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{t('PO 변경 사유', 'PO change reason')} <span className="text-red-500">*</span></Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('예: 수요 예측 오류', 'e.g. Forecast error')}
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
                id="reason-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v === true }))}
              />
              <Label htmlFor="reason-active">{t('사용 중', 'Active')}</Label>
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
