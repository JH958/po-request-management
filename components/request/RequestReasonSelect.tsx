/**
 * 요청사유 드롭다운 (호버 툴팁)
 */
'use client';

import { useRequestConfig } from '@/context/RequestConfigContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLanguage } from '@/context/LanguageContext';

interface RequestReasonSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export const RequestReasonSelect = ({ value, onChange }: RequestReasonSelectProps) => {
  const { requestReasons } = useRequestConfig();
  const { t } = useLanguage();

  return (
    <TooltipProvider>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('요청사유를 선택하세요', 'Select a request reason')} />
        </SelectTrigger>
        <SelectContent>
          {requestReasons.map((reason) => (
            <Tooltip key={reason.value}>
              <TooltipTrigger asChild>
                <SelectItem value={reason.value}>{reason.label}</SelectItem>
              </TooltipTrigger>
              {reason.description && (
                <TooltipContent side="right">{reason.description}</TooltipContent>
              )}
            </Tooltip>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
};
