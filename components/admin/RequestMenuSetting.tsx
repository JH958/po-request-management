/**
 * 요청 메뉴 표시 설정 — 요청 접수를 시작하기 전까지 관리자 외 계정에 요청접수·검토대기 메뉴를 숨김 (관리자 전용)
 */
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/context/LanguageContext';
import { useRequestConfig } from '@/context/RequestConfigContext';
import { saveRequestMenuEnabled } from '@/lib/app-settings-api';

export const RequestMenuSetting = ({ userId }: { userId: string }) => {
  const { t } = useLanguage();
  const { requestMenuEnabled, setRequestMenuEnabled } = useRequestConfig();
  const [saving, setSaving] = useState(false);

  const handleChange = async (enabled: boolean) => {
    try {
      setSaving(true);
      await saveRequestMenuEnabled(enabled, userId);
      setRequestMenuEnabled(enabled);
      toast.success(
        enabled
          ? t('요청접수·검토대기 메뉴를 모든 계정에 보입니다.', 'Request menus are now shown to everyone.')
          : t('요청접수·검토대기 메뉴를 관리자만 봅니다.', 'Request menus are now shown to admins only.')
      );
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('요청 메뉴 표시 저장 실패:', error);
      }
      toast.error(error instanceof Error ? error.message : t('저장하지 못했습니다.', 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-white p-4">
      <div className="space-y-1">
        <Label htmlFor="request-menu-enabled" className="font-semibold text-[#172132]">
          {t('요청 메뉴 표시', 'Show request menus')}
        </Label>
        <p className="max-w-2xl text-xs text-[#8E98A8]">
          {t(
            '끄면 관리자 외 계정에는 요청접수·검토대기 메뉴가 보이지 않고, 주소로 들어와도 "요청 접수 준비 중" 안내가 나옵니다. PO Tracker로 요청 접수를 시작할 때 켜세요.',
            'When off, only admins see Submit Request and Pending Review; others see a "not open yet" notice. Turn it on when request intake starts in PO Tracker.'
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="request-menu-enabled" checked={requestMenuEnabled} disabled={saving} onCheckedChange={(v) => void handleChange(v)} />
        <span className="text-sm text-[#253143]">{requestMenuEnabled ? t('모든 계정', 'Everyone') : t('관리자만', 'Admins only')}</span>
      </div>
    </div>
  );
};
