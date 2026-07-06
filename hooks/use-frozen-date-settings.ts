/**
 * 프로즌 데이트 설정 관리 훅
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAllFrozenSettings, upsertFrozenSetting, type FrozenSettingUpsertInput } from '@/lib/frozen-date-api';
import { getReadableErrorMessage } from '@/lib/request-helpers';
import type { FrozenDateSetting } from '@/types/frozen-date';

export const useFrozenDateSettings = (enabled = true) => {
  const [settings, setSettings] = useState<FrozenDateSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const data = await fetchAllFrozenSettings();
      setSettings(data);
    } catch (error) {
      console.error('프로즌 설정 목록 조회 실패:', getReadableErrorMessage(error), error);
      toast.error(getReadableErrorMessage(error) || '프로즌 설정을 불러오지 못했습니다.');
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const saveSetting = useCallback(
    async (input: FrozenSettingUpsertInput, userId: string) => {
      try {
        setSaving(true);
        const saved = await upsertFrozenSetting(input, userId);
        setSettings((prev) => {
          const exists = prev.some((s) => s.id === saved.id || s.customer_name === saved.customer_name);
          if (exists) {
            return prev.map((s) =>
              s.id === saved.id || s.customer_name === saved.customer_name ? saved : s
            );
          }
          return [...prev, saved].sort((a, b) => a.customer_name.localeCompare(b.customer_name, 'ko'));
        });
        toast.success('프로즌 설정이 저장되었습니다.');
        return saved;
      } catch (error) {
        console.error('프로즌 설정 저장 실패:', error);
        toast.error(`저장 실패: ${getReadableErrorMessage(error)}`);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, saving, fetchSettings, saveSetting };
};
