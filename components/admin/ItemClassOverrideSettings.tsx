/**
 * 품목 구분 예외 관리 — 카테고리 구분과 다르게 셀 품목을 품목번호로 지정
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  deleteItemClassOverride,
  fetchItemClassOverrides,
  lookupItems,
  saveItemClassOverride,
} from '@/lib/po-tracker-settings-api';
import { getProductClassLabels } from '@/lib/po-tracker-labels';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import type { ItemClassOverride } from '@/types/po-changes';

interface ItemClassOverrideSettingsProps {
  userId: string;
}

type OverrideClass = ItemClassOverride['product_class'];

interface FormState {
  isNew: boolean;
  item_no: string;
  product_class: OverrideClass;
  note: string;
}

const OVERRIDE_CLASSES: OverrideClass[] = ['제품', '상품', '자재', '제외'];

export const ItemClassOverrideSettings = ({ userId }: ItemClassOverrideSettingsProps) => {
  const { t } = useLanguage();
  const classLabels = getProductClassLabels(t);
  const [items, setItems] = useState<ItemClassOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ isNew: true, item_no: '', product_class: '상품', note: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await fetchItemClassOverrides());
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('품목 구분 예외 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ isNew: true, item_no: '', product_class: '상품', note: '' });
    setModalOpen(true);
  };

  const openEdit = (item: ItemClassOverride) => {
    setForm({ isNew: false, item_no: item.item_no, product_class: item.product_class, note: item.note ?? '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const itemNo = form.item_no.trim().toUpperCase();
    if (!itemNo) {
      toast.error(t('품목번호를 입력해주세요.', 'Enter an item code.'));
      return;
    }
    if (form.isNew && items.some((i) => i.item_no === itemNo)) {
      toast.error(t('이미 예외로 지정된 품목입니다. 목록에서 수정해주세요.', 'This item already has an exception. Edit it in the list.'));
      return;
    }

    try {
      setSaving(true);
      // 판매주문조회에 한 번도 나오지 않은 품목번호는 오타일 수 있어 확인
      if (form.isNew) {
        const found = await lookupItems([itemNo]);
        if (
          !found.has(itemNo) &&
          !window.confirm(
            t(
              `${itemNo} 품목은 업로드된 판매주문조회에 없습니다. 그래도 저장할까요?`,
              `${itemNo} is not in any uploaded sales order list. Save anyway?`
            )
          )
        ) {
          return;
        }
      }
      await saveItemClassOverride(
        { item_no: itemNo, product_class: form.product_class, note: form.note.trim() || null },
        userId
      );
      await load();
      setModalOpen(false);
      toast.success(t('품목 구분 예외를 저장했습니다.', 'Item category exception saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ItemClassOverride) => {
    if (
      !window.confirm(
        t(
          `${item.item_no} 예외를 삭제할까요? 다시 카테고리 구분(${classLabels[item.category_class]})으로 셉니다.`,
          `Delete the exception for ${item.item_no}? It will count by its category (${classLabels[item.category_class]}) again.`
        )
      )
    ) {
      return;
    }
    try {
      await deleteItemClassOverride(item.item_no);
      await load();
      toast.success(t('품목 구분 예외를 삭제했습니다.', 'Item category exception deleted.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5A6778]">
          {t(
            '카테고리 모델의 구분과 다르게 셀 품목을 지정합니다. 지정한 구분이 카테고리보다 우선하며 지난 이벤트에도 바로 반영됩니다.',
            'Set items that should count differently from their category. The exception overrides the category and applies to past events immediately.'
          )}
        </p>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('품목 추가', 'Add item')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('품목번호', 'Item code'),
                  t('품목명', 'Item name'),
                  t('카테고리 모델', 'Category model'),
                  t('카테고리 구분', 'Category class'),
                  t('지정 구분', 'Exception class'),
                  t('메모', 'Note'),
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
                    {t('지정된 품목이 없습니다.', 'No item exceptions yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.item_no}>
                    <TableCell className="whitespace-nowrap font-medium">{item.item_no}</TableCell>
                    <TableCell>{item.item_name ?? <span className="text-[#8E98A8]">-</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#5A6778]">{item.category_model ?? '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#5A6778]">{classLabels[item.category_class]}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold text-[#8B1538]">
                      {classLabels[item.product_class]}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-[#5A6778]" title={item.note ?? ''}>
                      {item.note ?? '-'}
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
            <DialogTitle>
              {form.isNew ? t('품목 구분 예외 추가', 'Add item exception') : t('품목 구분 예외 수정', 'Edit item exception')}
            </DialogTitle>
            <DialogDescription>
              {t('품목번호는 판매주문조회·DO등록현황조회의 품목번호와 같아야 합니다.', 'The item code must match the code in the sales order and DO lists.')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="override-item">{t('품목번호', 'Item code')} <span className="text-red-500">*</span></Label>
              <Input
                id="override-item"
                value={form.item_no}
                disabled={!form.isNew}
                onChange={(e) => setForm((p) => ({ ...p, item_no: e.target.value }))}
                placeholder={t('예: X9W300001', 'e.g. X9W300001')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('지정 구분', 'Exception class')}</Label>
              <Select value={form.product_class} onValueChange={(v) => setForm((p) => ({ ...p, product_class: v as OverrideClass }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERRIDE_CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>{classLabels[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-note">{t('메모', 'Note')}</Label>
              <Textarea
                id="override-note"
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                rows={2}
                placeholder={t('예외로 지정한 이유', 'Why this item is an exception')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('취소', 'Cancel')}
            </Button>
            <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t('저장 중...', 'Saving...') : t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
