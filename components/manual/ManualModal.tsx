/**
 * Purchase On 사용 가이드 모달
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import {
  getManualType,
  persistManualClose,
  type ManualType,
} from '@/lib/manualUtils';
import { ManualTabs } from '@/components/manual/ManualTabs';

interface ManualModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** useAuth 프로필이 있으면 추가 조회 없이 탭 구성에 사용 */
  profileDepartment?: string | null;
  profileRole?: string | null;
}

export const ManualModal = ({
  open,
  onOpenChange,
  profileDepartment,
  profileRole,
}: ManualModalProps) => {
  const [hideToday, setHideToday] = useState(false);
  const [asyncManualType, setAsyncManualType] = useState<ManualType | null>(null);

  const hasProfileHint =
    (profileDepartment != null && String(profileDepartment).length > 0) ||
    (profileRole != null && String(profileRole).length > 0);

  const manualTypeFromProfile = useMemo(() => {
    if (!hasProfileHint) {
      return null;
    }
    return getManualType(profileDepartment, profileRole);
  }, [hasProfileHint, profileDepartment, profileRole]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (manualTypeFromProfile !== null) {
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user || cancelled) {
          return;
        }

        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('department, role')
          .eq('id', user.id)
          .single();

        if (cancelled) {
          return;
        }

        if (error || !profile) {
          setAsyncManualType('customer');
          return;
        }

        setAsyncManualType(
          getManualType(
            profile.department as string | null,
            profile.role as string | null
          )
        );
      } catch {
        if (!cancelled) {
          setAsyncManualType('customer');
        }
      }
    };

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [open, manualTypeFromProfile]);

  const manualType: ManualType =
    manualTypeFromProfile ?? asyncManualType ?? 'customer';

  const applyClose = useCallback(
    (hide: boolean) => {
      persistManualClose(hide);
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      persistManualClose(hideToday);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] max-w-[1000px] flex-col gap-4 overflow-hidden p-6 sm:max-w-[1000px]"
        aria-labelledby="manual-dialog-title"
      >
        <DialogHeader className="shrink-0 space-y-1 text-left">
          <DialogTitle
            id="manual-dialog-title"
            className="flex items-center gap-2 text-xl font-bold text-[#971B2F]"
          >
            <BookOpen className="h-6 w-6 shrink-0" aria-hidden />
            Purchase On 사용 가이드
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ManualTabs manualType={manualType} />
        </div>

        <DialogFooter className="shrink-0 flex-col gap-4 border-t border-[#E5E7EB] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="manual-hide-today"
              checked={hideToday}
              onCheckedChange={(v) => setHideToday(v === true)}
            />
            <Label
              htmlFor="manual-hide-today"
              className="cursor-pointer text-sm font-normal text-[#67767F]"
            >
              오늘 하루 보지 않기
            </Label>
          </div>
          <Button
            type="button"
            onClick={() => applyClose(hideToday)}
            className="w-full bg-[#971B2F] hover:bg-[#7a1625] sm:w-auto"
            aria-label="매뉴얼 닫기"
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
