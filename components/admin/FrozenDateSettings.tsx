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
import { formatFrozenRule, FROZEN_WEEKDAY_OPTIONS } from '@/lib/frozen-date-labels';
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
}) => (
  <div className="space-y-2 rounded-lg border p-3">
    <Label className="text-sm font-semibold">{label}</Label>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-[#67767F]">주 수</Label>
        <Input
          type="number"
          min={0}
          value={value.weeks}
          onChange={(e) => onChange({ ...value, weeks: e.target.value })}
          placeholder="예: 4"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-[#67767F]">요일</Label>
        <Select
          value={value.weekday}
          onValueChange={(v) => onChange({ ...value, weekday: v as RuleFormState['weekday'] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {FROZEN_WEEKDAY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
);

export const FrozenDateSettings = ({ userId }: FrozenDateSettingsProps) => {
  const { settings, loading, saving, saveSetting } = useFrozenDateSettings();
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67767F]" />
          <Input
            className="pl-10"
            placeholder="고객처명, 국가 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button className="bg-[#971B2F] hover:bg-[#7A1626]" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          신규 고객처 추가
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
                {['구분', '국가', '고객처명', '고객기준(제품)', '고객기준(자재)', '본사기준(제품)', '본사기준(자재)', '비고', '수정'].map(
                  (h) => (
                    <TableHead key={h}>{h}</TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-[#67767F]">
                    등록된 프로즌 설정이 없습니다.
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
                            미설정
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatFrozenRule(s.customer_product_weeks, s.customer_product_weekday)}</TableCell>
                    <TableCell>{formatFrozenRule(s.customer_material_weeks, s.customer_material_weekday)}</TableCell>
                    <TableCell>{formatFrozenRule(s.hq_product_weeks, s.hq_product_weekday)}</TableCell>
                    <TableCell>{formatFrozenRule(s.hq_material_weeks, s.hq_material_weekday)}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={s.note ?? ''}>
                      {s.note ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label="수정">
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
            <DialogTitle>{isNew ? '신규 고객처 추가' : '프로즌 설정 수정'}</DialogTitle>
            <DialogDescription>
              고객처별 프로즌 데이트 산정 기준을 입력합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>구분</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="법인 / 대리점 / 지사"
                />
              </div>
              <div className="space-y-2">
                <Label>등급</Label>
                <Input
                  value={form.grade}
                  onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>국가</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>고객처명 <span className="text-red-500">*</span></Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                  disabled={!isNew}
                  placeholder="고객 드롭다운과 동일한 명칭"
                />
              </div>
            </div>

            <RuleFieldEditor
              label="고객기준 (제품)"
              value={form.customer_product}
              onChange={(v) => setForm((p) => ({ ...p, customer_product: v }))}
            />
            <RuleFieldEditor
              label="고객기준 (자재)"
              value={form.customer_material}
              onChange={(v) => setForm((p) => ({ ...p, customer_material: v }))}
            />
            <RuleFieldEditor
              label="본사기준 (제품)"
              value={form.hq_product}
              onChange={(v) => setForm((p) => ({ ...p, hq_product: v }))}
            />
            <RuleFieldEditor
              label="본사기준 (자재)"
              value={form.hq_material}
              onChange={(v) => setForm((p) => ({ ...p, hq_material: v }))}
            />

            <div className="space-y-2">
              <Label>비고</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button
              className="bg-[#971B2F] hover:bg-[#7A1626]"
              onClick={() => void handleSave()}
              disabled={saving || !form.customer_name.trim()}
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
