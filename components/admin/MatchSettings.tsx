/**
 * 요청 연결 기준 — 요청 ↔ DO 변경 후보 날짜 범위와 '요청 없음'으로 보기 전 유예 영업일 (관리자 전용)
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/context/LanguageContext';
import { fetchMatchSettings, saveMatchSettings } from '@/lib/po-request-links-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type { MatchSettings as MatchSettingsValue } from '@/types/po-changes';

/** 입력 칸 정의 (DB 제약과 같은 범위) */
const FIELDS: { key: keyof MatchSettingsValue; max: number }[] = [
  { key: 'days_before', max: 365 },
  { key: 'days_after', max: 365 },
  { key: 'grace_business_days', max: 60 },
];

export const MatchSettings = ({ userId }: { userId: string }) => {
  const { t } = useLanguage();
  const [value, setValue] = useState<MatchSettingsValue | null>(null);
  const [saved, setSaved] = useState<MatchSettingsValue | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await fetchMatchSettings();
      setValue(row);
      setSaved(row);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 연결 기준 조회 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!value) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const labels: Record<keyof MatchSettingsValue, { name: string; hint: string; unit: string }> = {
    days_before: {
      name: t('요청일 이전', 'Before the request date'),
      hint: t('DO 변경이 요청일보다 이만큼 먼저 감지돼도 후보로 봅니다 (사후 요청).', 'A DO change detected this many days before the request still counts (requested after).'),
      unit: t('일', 'days'),
    },
    days_after: {
      name: t('요청일 이후', 'After the request date'),
      hint: t('요청일 뒤 이만큼 안에 감지된 DO 변경을 후보로 봅니다.', 'DO changes detected within this many days after the request are candidates.'),
      unit: t('일', 'days'),
    },
    grace_business_days: {
      name: t('요청 없음 유예', 'Grace before No request'),
      hint: t('연결된 요청이 없는 변경을 감지 후 이만큼 지나면 요청 없음으로, 그 전은 확인 대기로 봅니다 (토·일 제외).', 'A change with no linked request becomes No request after this many business days; before that it is Waiting (weekends excluded).'),
      unit: t('영업일', 'business days'),
    },
  };
  const valid = FIELDS.every((f) => Number.isInteger(value[f.key]) && value[f.key] >= 0 && value[f.key] <= f.max);
  const changed = JSON.stringify(value) !== JSON.stringify(saved);

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveMatchSettings(value, userId);
      setSaved(value);
      toast.success(t('요청 연결 기준을 저장했습니다.', 'Saved the matching rules.'));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 연결 기준 저장 실패:', error);
      }
      toast.error(getReadableErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-[#5A6778]">
        {t(
          'DO에서 찾은 변경과 요청서를 맞출 때 쓰는 기준입니다. SO 번호와 품목코드가 같고(출하일정·운송방법 변경은 SO만) 아래 날짜 범위 안이면 후보가 되며, 유형·수량까지 맞고 후보가 하나뿐이면 자동으로 연결됩니다.',
          'Rules for matching DO changes with requests. Same SO and item (SO only for schedule/mode changes) within the window below makes a candidate; a single full match on type and quantity is linked automatically.'
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5 rounded-lg border bg-white p-4">
            <Label htmlFor={`match-${f.key}`} className="font-semibold text-[#172132]">{labels[f.key].name}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`match-${f.key}`}
                type="number"
                min={0}
                max={f.max}
                className="w-24"
                value={Number.isNaN(value[f.key]) ? '' : value[f.key]}
                onChange={(e) => setValue({ ...value, [f.key]: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
              />
              <span className="text-sm text-[#5A6778]">{labels[f.key].unit}</span>
            </div>
            <p className="text-xs text-[#8E98A8]">{labels[f.key].hint}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button className="bg-[#8B1538] hover:bg-[#74112F]" disabled={!valid || !changed || saving} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('저장', 'Save')}
        </Button>
      </div>
    </div>
  );
};
