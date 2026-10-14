/**
 * PO 변경 유형 관리 — 유형 이름·설명·순서·사용 여부(CRUD)와 판정 기준 → 유형 연결
 * 요청접수 화면의 요청구분 카드도 이 목록(사용 중인 유형)을 그대로 쓴다
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
import { fetchChangeTypes } from '@/lib/po-changes-api';
import {
  OTHER_CHANGE_TYPE_CODE,
  deleteChangeType,
  fetchChangeTypeRules,
  saveChangeType,
  saveChangeTypeRule,
} from '@/lib/po-tracker-settings-api';
import { CHANGE_RULE_KEYS, getChangeRuleLabels, getChangeTypeName } from '@/lib/po-tracker-labels';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import { useLanguage } from '@/context/LanguageContext';
import { useRequestConfig } from '@/context/RequestConfigContext';
import type { ChangeRuleKey, PoChangeTypeRule, PoChangeTypeSetting } from '@/types/po-changes';

interface PoChangeTypeSettingsProps {
  userId: string;
}

interface FormState {
  code?: string;
  label: string;
  label_en: string;
  description: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm = (sortOrder: number): FormState => ({
  label: '',
  label_en: '',
  description: '',
  sort_order: String(sortOrder),
  is_active: true,
});

export const PoChangeTypeSettings = ({ userId }: PoChangeTypeSettingsProps) => {
  const { t, lang } = useLanguage();
  const { refresh: refreshRequestConfig } = useRequestConfig();
  const ruleLabels = getChangeRuleLabels(t);
  const [types, setTypes] = useState<PoChangeTypeSetting[]>([]);
  const [rules, setRules] = useState<PoChangeTypeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState<ChangeRuleKey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(1));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [typeRows, ruleRows] = await Promise.all([fetchChangeTypes(), fetchChangeTypeRules()]);
      setTypes(typeRows);
      setRules(ruleRows);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('PO 변경 유형 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 유형에 연결된 판정 기준 이름 목록 */
  const rulesOf = (code: string): string[] =>
    CHANGE_RULE_KEYS.filter((key) => {
      const linked = rules.find((r) => r.rule_key === key)?.type_code ?? null;
      const linkedType = types.find((type) => type.code === linked);
      // 연결이 없거나 꺼진 유형에 연결된 기준은 기타로 셈
      const effective = linkedType && linkedType.is_active ? linkedType.code : OTHER_CHANGE_TYPE_CODE;
      return effective === code;
    }).map((key) => ruleLabels[key].name);

  const openCreate = () => {
    const nextOrder = types.filter((type) => type.code !== OTHER_CHANGE_TYPE_CODE).length + 1;
    setForm(emptyForm(nextOrder));
    setModalOpen(true);
  };

  const openEdit = (type: PoChangeTypeSetting) => {
    setForm({
      code: type.code,
      label: type.label,
      label_en: type.label_en ?? '',
      description: type.description ?? '',
      sort_order: String(type.sort_order),
      is_active: type.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast.error(t('유형 이름을 입력해주세요.', 'Enter a type name.'));
      return;
    }
    const sortOrder = parseInt(form.sort_order, 10);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      toast.error(t('순서는 0 이상의 숫자여야 합니다.', 'Order must be a number of 0 or more.'));
      return;
    }
    if (types.some((type) => type.label === form.label.trim() && type.code !== form.code)) {
      toast.error(t('같은 이름의 유형이 이미 있습니다.', 'A type with this name already exists.'));
      return;
    }

    try {
      setSaving(true);
      await saveChangeType(
        {
          code: form.code,
          label: form.label.trim(),
          label_en: form.label_en.trim() || null,
          description: form.description.trim() || null,
          sort_order: sortOrder,
          // 기타는 끌 수 없음 — 연결 없는 기준이 모이는 곳
          is_active: form.code === OTHER_CHANGE_TYPE_CODE ? true : form.is_active,
        },
        userId
      );
      await load();
      await refreshRequestConfig();
      setModalOpen(false);
      toast.success(t('변경 유형을 저장했습니다.', 'Change type saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: PoChangeTypeSetting) => {
    const linked = rulesOf(type.code);
    const message = linked.length
      ? t(
          `"${type.label}" 유형을 삭제할까요? 연결된 기준(${linked.join(', ')})은 기타로 셉니다.`,
          `Delete "${getChangeTypeName(type, lang)}"? Linked rules (${linked.join(', ')}) will count as Other.`
        )
      : t(`"${type.label}" 유형을 삭제할까요?`, `Delete "${getChangeTypeName(type, lang)}"?`);
    if (!window.confirm(message)) return;
    try {
      await deleteChangeType(type.code);
      await load();
      await refreshRequestConfig();
      toast.success(t('변경 유형을 삭제했습니다.', 'Change type deleted.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  const handleRuleChange = async (ruleKey: ChangeRuleKey, typeCode: string) => {
    try {
      setSavingRule(ruleKey);
      await saveChangeTypeRule({ rule_key: ruleKey, type_code: typeCode }, userId);
      setRules((prev) => [...prev.filter((r) => r.rule_key !== ruleKey), { rule_key: ruleKey, type_code: typeCode }]);
      toast.success(t('연결을 저장했습니다.', 'Link saved.'));
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSavingRule(null);
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

  const isOther = form.code === OTHER_CHANGE_TYPE_CODE;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#172132]">{t('변경 유형', 'Change types')}</h3>
            <p className="text-sm text-[#5A6778]">
              {t(
                '요청접수 화면의 요청구분 카드, PO 변경 페이지의 변경 유형 드롭다운과 통계에 함께 쓰입니다. 바꾸면 지난 이벤트에도 바로 반영됩니다(이미 접수된 요청의 요청구분은 접수 당시 이름 유지).',
                'Used for the request type cards, the PO Changes type filter and statistics. Changes apply to past events immediately (submitted requests keep the name they were filed with).'
              )}
            </p>
          </div>
          <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('유형 추가', 'Add type')}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('순서', 'Order'),
                  t('유형 이름', 'Type name'),
                  t('영문명', 'English name'),
                  t('설명 (요청 카드)', 'Description (request card)'),
                  t('연결된 판정 기준', 'Linked rules'),
                  t('상태', 'Status'),
                  t('수정', 'Edit'),
                  t('삭제', 'Delete'),
                ].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-[#5A6778]">
                    {t('등록된 변경 유형이 없습니다.', 'No change types yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                types.map((type) => {
                  const linked = rulesOf(type.code);
                  const other = type.code === OTHER_CHANGE_TYPE_CODE;
                  return (
                    <TableRow key={type.code} className={!type.is_active ? 'opacity-60' : undefined}>
                      <TableCell>{type.sort_order}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{type.label}</TableCell>
                      <TableCell className="whitespace-nowrap text-[#5A6778]">{type.label_en ?? '-'}</TableCell>
                      <TableCell className="max-w-56 truncate text-sm text-[#5A6778]" title={type.description ?? ''}>
                        {type.description ?? '-'}
                      </TableCell>
                      <TableCell className="text-sm text-[#5A6778]">
                        {linked.length ? linked.join(', ') : <span className="text-[#8E98A8]">{t('없음', 'None')}</span>}
                        {other ? (
                          <span className="block text-xs text-[#8E98A8]">
                            {t('연결이 없거나 꺼진 유형의 기준도 여기로 셉니다.', 'Rules with no link or an inactive type also count here.')}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={type.is_active ? 'default' : 'outline'}>
                          {type.is_active ? t('사용', 'Active') : t('비활성', 'Inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(type)} aria-label={t('수정', 'Edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={other}
                          title={other ? t('기타는 삭제할 수 없습니다.', 'Other cannot be deleted.') : undefined}
                          onClick={() => void handleDelete(type)}
                          aria-label={t('삭제', 'Delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-semibold text-[#172132]">{t('판정 기준 연결', 'Rule links')}</h3>
          <p className="text-sm text-[#5A6778]">
            {t(
              '시스템이 DO 비교로 정하는 판정 기준을 어느 변경 유형으로 셀지 고릅니다. 기준 자체는 바꿀 수 없습니다.',
              'Choose which change type each system rule counts as. The rules themselves cannot be changed.'
            )}
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {[t('판정 기준', 'Rule'), t('설명', 'Description'), t('변경 유형', 'Change type')].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CHANGE_RULE_KEYS.map((key) => {
                const linked = rules.find((r) => r.rule_key === key)?.type_code ?? null;
                const linkedType = types.find((type) => type.code === linked);
                const value = linkedType ? linkedType.code : OTHER_CHANGE_TYPE_CODE;
                return (
                  <TableRow key={key}>
                    <TableCell className="whitespace-nowrap font-medium">{ruleLabels[key].name}</TableCell>
                    <TableCell className="text-sm text-[#5A6778]">
                      {ruleLabels[key].description}
                      {linkedType && !linkedType.is_active ? (
                        <span className="block text-xs text-amber-700">
                          {t('연결된 유형이 꺼져 있어 기타로 셉니다.', 'The linked type is inactive, so this counts as Other.')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={value}
                        disabled={savingRule === key}
                        onValueChange={(v) => void handleRuleChange(key, v)}
                      >
                        <SelectTrigger className="w-[190px]" aria-label={ruleLabels[key].name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {types.map((type) => (
                            <SelectItem key={type.code} value={type.code}>
                              {getChangeTypeName(type, lang)}
                              {!type.is_active ? ` (${t('비활성', 'inactive')})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.code ? t('변경 유형 수정', 'Edit change type') : t('변경 유형 추가', 'Add change type')}</DialogTitle>
            <DialogDescription>
              {t(
                '사용 중인 유형은 요청접수 카드로도 보입니다. 새 유형은 아래 "판정 기준 연결"에서 기준을 연결해야 DO 변경 이벤트가 셉니다.',
                'Active types also appear as request cards. Link rules to a new type under "Rule links" for DO change events to count toward it.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="change-type-label">{t('유형 이름', 'Type name')} <span className="text-red-500">*</span></Label>
              <Input
                id="change-type-label"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('예: 출하일정 변경', 'e.g. 출하일정 변경')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-type-label-en">{t('영문명', 'English name')}</Label>
              <Input
                id="change-type-label-en"
                value={form.label_en}
                onChange={(e) => setForm((p) => ({ ...p, label_en: e.target.value }))}
                placeholder={t('영어 화면에 표시 (비우면 한국어 이름)', 'Shown in English (Korean name if empty)')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-type-description">{t('설명', 'Description')}</Label>
              <Textarea
                id="change-type-description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder={t('요청접수 카드에 마우스를 올리면 보이는 안내', 'Shown when hovering over the request card')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-type-order">{t('순서', 'Order')}</Label>
              <Input
                id="change-type-order"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="change-type-active"
                checked={isOther ? true : form.is_active}
                disabled={isOther}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v === true }))}
              />
              <Label htmlFor="change-type-active">{t('사용 중', 'Active')}</Label>
              {isOther ? (
                <span className="text-xs text-[#8E98A8]">{t('기타는 항상 사용합니다.', 'Other is always active.')}</span>
              ) : null}
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
