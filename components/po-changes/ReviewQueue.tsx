/**
 * 확인 필요 탭 — 분할/합배송·품목코드 변경 후보 묶음 목록 (확인 전 / 처리 완료)
 */
'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChangeGroupCard } from '@/components/po-changes/ChangeGroupCard';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { ReasonOption } from '@/lib/request-constants';
import type {
  ChangeGroupStatus,
  ChangeReasonInput,
  PoChangeGroup,
  PoChangeTypeSetting,
  PoRequestOrigin,
} from '@/types/po-changes';

interface ReviewQueueProps {
  groups: PoChangeGroup[];
  currentUserId: string;
  reasons: ReasonOption[];
  origins: PoRequestOrigin[];
  changeTypes: PoChangeTypeSetting[];
  onReview: (
    groupId: string,
    status: ChangeGroupStatus,
    note: string | null,
    reason?: ChangeReasonInput | null,
    typeCode?: string | null
  ) => Promise<void>;
}

type QueueView = 'pending' | 'done';

export const ReviewQueue = ({ groups, currentUserId, reasons, origins, changeTypes, onReview }: ReviewQueueProps) => {
  const { t } = useLanguage();
  const [view, setView] = useState<QueueView>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = groups.filter((g) => g.status === 'pending');
  const done = groups.filter((g) => g.status !== 'pending');
  const visible = view === 'pending' ? pending : done;

  const handleReview = async (
    groupId: string,
    status: ChangeGroupStatus,
    note: string | null,
    reason?: ChangeReasonInput | null,
    typeCode?: string | null
  ) => {
    setBusyId(groupId);
    try {
      await onReview(groupId, status, note, reason, typeCode);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label={t('확인 상태', 'Review status')}>
        {([
          ['pending', t(`확인 전 ${pending.length}`, `To review ${pending.length}`)],
          ['done', t(`처리 완료 ${done.length}`, `Reviewed ${done.length}`)],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={view === key}
            variant="outline"
            size="sm"
            onClick={() => setView(key)}
            className={cn(
              'rounded-full border-[#D6DDE7] bg-white shadow-none',
              view === key && 'border-[#8B1538] bg-[#8B1538] text-white hover:bg-[#74112F] hover:text-white'
            )}
          >
            {label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-white py-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-[#8E98A8]" />
          <p className="text-sm text-[#5A6778]">
            {view === 'pending'
              ? t('확인할 후보가 없습니다.', 'Nothing to review.')
              : t('처리한 후보가 없습니다.', 'No reviewed candidates yet.')}
          </p>
        </div>
      ) : (
        visible.map((group) => (
          <ChangeGroupCard
            key={group.id}
            group={group}
            currentUserId={currentUserId}
            busy={busyId === group.id}
            reasons={reasons}
            origins={origins}
            changeTypes={changeTypes}
            onReview={handleReview}
          />
        ))
      )}
    </div>
  );
};
