/**
 * 프로즌 데이트 관리 화면
 */
'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useFrozenDateSettings } from '@/hooks/use-frozen-date-settings';
import { formatFrozenRule, getFrozenWeekdayOptions } from '@/lib/frozen-date-labels';
import { useLanguage } from '@/context/LanguageContext';
import { isSettingFullyUnset } from '@/lib/frozen-date';
import type { FrozenDateSetting, FrozenWeekday } from '@/types/frozen-date';

interface FrozenDateSettingsProps {
  userId: string;
}

interface RuleFormState {
  weeks: string;
  weekday: FrozenWeekday | 'NONE';
}

interface SettingFormState {
  id?: string;
  category: string;
  grade: string;
  country: string;
  customer_name: string;
  customer_product: RuleFormState;
  customer_material: RuleFormState;
  hq_product: RuleFormState;
  hq_material: RuleFormState;
  note: string;
}

const toFormState = (setting?: FrozenDateSetting): SettingFormState => ({
  id: setting?.id,
  category: setting?.category ?? '',
  grade: setting?.grade ?? '',
  country: setting?.country ?? '',
  customer_name: setting?.customer_name ?? '',
  customer_product: {
    weeks: setting?.customer_product_weeks?.toString() ?? '',
    weekday: setting?.customer_product_weekday ?? 'NONE',
  },
  customer_material: {
    weeks: setting?.customer_material_weeks?.toString() ?? '',
    weekday: setting?.customer_material_weekday ?? 'NONE',
  },
  hq_product: {
    weeks: setting?.hq_product_weeks?.toString() ?? '',
    weekday: setting?.hq_product_weekday ?? 'NONE',
  },
  hq_material: {
    weeks: setting?.hq_material_weeks?.toString() ?? '',
    weekday: setting?.hq_material_weekday ?? 'NONE',
  },
  note: setting?.note ?? '',
});

const parseRule = (rule: RuleFormState) => {
  const weeks = rule.weeks.trim() === '' ? null : Number(rule.weeks);
  const weekday = rule.weekday === 'NONE' ? null : rule.weekday;
  return { weeks: Number.isNaN(weeks) ? null : weeks, weekday };
};

const RuleFieldEditor = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RuleFormState;
  onChange: (v: RuleFormState) => void;
}) => {
  const { t } = useLanguage();
  return (
  <div className="space-y-2 rounded-lg border p-3">
    <Label className="text-sm font-semibold">{label}</Label>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-[#5A6778]">{t('주 수', 'Weeks')}</Label>
        <Input
          type="number"
          min={0}
          value={value.weeks}
          onChange={(e) => onChange({ ...value, weeks: e.target.value })}
          placeholder={t('예: 4', 'e.g. 4')}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-[#5A6778]">{t('요일', 'Weekday')}</Label>
        <Select
          value={value.weekday}
          onValueChange={(v) => onChange({ ...value, weekday: v as RuleFormState['weekday'] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {getFrozenWeekdayOptions(t).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
  );
};

export const FrozenDateSettings = ({ userId }: FrozenDateSettingsProps) => {
  const { settings, loading, saving, saveSetting } = useFrozenDateSettings();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SettingFormState>(toFormState());
  const [isNew, setIsNew] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return settings;
    return settings.filter(
      (s) =>
        s.customer_name.toLowerCase().includes(term) ||
        (s.country ?? '').toLowerCase().includes(term)
    );
  }, [settings, search]);

  const openCreate = () => {
    setIsNew(true);
    setForm(toFormState());
    setModalOpen(true);
  };

  const openEdit = (setting: FrozenDateSetting) => {
    setIsNew(false);
    setForm(toFormState(setting));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;

    const customerProduct = parseRule(form.customer_product);
    const customerMaterial = parseRule(form.customer_material);
    const hqProduct = parseRule(form.hq_product);
    const hqMaterial = parseRule(form.hq_material);

    await saveSetting(
      {
        id: form.id,
        category: form.category || null,
        grade: form.grade || null,
        country: form.country || null,
        customer_name: form.customer_name.trim(),
        customer_product_weeks: customerProduct.weeks,
        customer_product_weekday: customerProduct.weekday,
        customer_material_weeks: customerMaterial.weeks,
        customer_material_weekday: customerMaterial.weekday,
        hq_product_weeks: hqProduct.weeks,
        hq_product_weekday: hqProduct.weekday,
        hq_material_weeks: hqMaterial.weeks,
        hq_material_weekday: hqMaterial.weekday,
        note: form.note || null,
      },
      userId
    );
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A6778]" />
          <Input
            className="pl-10"
            placeholder={t('고객처명, 국가 검색...', 'Search customer or country...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('신규 고객처 추가', 'Add customer')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('구분', 'Type'),
                  t('국가', 'Country'),
                  t('고객처명', 'Customer'),
                  t('고객기준(제품)', 'Customer (product)'),
                  t('고객기준(자재)', 'Customer (material)'),
                  t('본사기준(제품)', 'HQ (product)'),
                  t('본사기준(자재)', 'HQ (material)'),
                  t('비고', 'Note'),
                  t('수정', 'Edit'),
                ].map(
                  (h) => (
                    <TableHead key={h}>{h}</TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-[#5A6778]">
                    {t('등록된 프로즌 설정이 없습니다.', 'No frozen date settings yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.category ?? '-'}</TableCell>
                    <TableCell>{s.country ?? '-'}</TableCell>
                    <TableCell className="min-w-[180px] font-medium">
                      <div className="flex items-center gap-2">
                        {s.customer_name}
                        {isSettingFullyUnset(s) && (
                          <Badge variant="outline" className="text-xs text-slate-500">
                            {t('미설정', 'Not set')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatFrozenRule(s.customer_product_weeks, s.customer_product_weekday, t)}</TableCell>
                    <TableCell>{formatFrozenRule(s.customer_material_weeks, s.customer_material_weekday, t)}</TableCell>
                    <TableCell>{formatFrozenRule(s.hq_product_weeks, s.hq_product_weekday, t)}</TableCell>
                    <TableCell>{formatFrozenRule(s.hq_material_weeks, s.hq_material_weekday, t)}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={s.note ?? ''}>
                      {s.note ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label={t('수정', 'Edit')}>
                        <Pencil className="h-4 w-4" />
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? t('신규 고객처 추가', 'Add customer') : t('프로즌 설정 수정', 'Edit frozen date rule')}</DialogTitle>
            <DialogDescription>
              {t('고객처별 프로즌 데이트 산정 기준을 입력합니다.', 'Set how the frozen date is calculated for this customer.')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('구분', 'Type')}</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder={t('법인 / 대리점 / 지사', 'Subsidiary / Dealer / Branch')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('등급', 'Grade')}</Label>
                <Input
                  value={form.grade}
                  onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('국가', 'Country')}</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('고객처명', 'Customer')} <span className="text-red-500">*</span></Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                  disabled={!isNew}
                  placeholder={t('고객 드롭다운과 동일한 명칭', 'Same name as in the customer dropdown')}
                />
              </div>
            </div>

            <RuleFieldEditor
              label={t('고객기준 (제품)', 'Customer (product)')}
              value={form.customer_product}
              onChange={(v) => setForm((p) => ({ ...p, customer_product: v }))}
            />
            <RuleFieldEditor
              label={t('고객기준 (자재)', 'Customer (material)')}
              value={form.customer_material}
              onChange={(v) => setForm((p) => ({ ...p, customer_material: v }))}
            />
            <RuleFieldEditor
              label={t('본사기준 (제품)', 'HQ (product)')}
              value={form.hq_product}
              onChange={(v) => setForm((p) => ({ ...p, hq_product: v }))}
            />
            <RuleFieldEditor
              label={t('본사기준 (자재)', 'HQ (material)')}
              value={form.hq_material}
              onChange={(v) => setForm((p) => ({ ...p, hq_material: v }))}
            />

            <div className="space-y-2">
              <Label>{t('비고', 'Note')}</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('취소', 'Cancel')}
            </Button>
            <Button
              className="bg-[#8B1538] hover:bg-[#74112F]"
              onClick={() => void handleSave()}
              disabled={saving || !form.customer_name.trim()}
            >
              {saving ? t('저장 중...', 'Saving...') : t('저장', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
