/**
 * 요청구분 3x3 카드 그리드 (호버 툴팁 + 인바디 브랜드 컬러)
 */
'use client';

import { REQUEST_TYPES } from '@/lib/request-constants';
import type { RequestTypeCard } from '@/lib/request-constants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface RequestTypeGridProps {
  onSelect: (type: RequestTypeCard) => void;
}

type CardVariant = 'quantity' | 'change' | 'other';

/** 추가·삭제 / 변경 / 기타·배송 계열별 통일 스타일 */
const VARIANT_STYLES: Record<CardVariant, { base: string; hover: string }> = {
  /** 제품·자재 추가/삭제 (4개) — 브랜드 레드 계열 */
  quantity: {
    base: 'border-[#971B2F]/35 bg-[#971B2F]/10 text-[#971B2F]',
    hover: 'hover:border-[#971B2F] hover:bg-[#971B2F] hover:text-white hover:shadow-md',
  },
  /** 품목코드·출하·운송 변경 (3개) — 브랜드 액센트 블루그레이 계열 */
  change: {
    base: 'border-[#A2B2C8] bg-[#A2B2C8]/20 text-[#101820]',
    hover: 'hover:border-[#8A9BB1] hover:bg-[#A2B2C8] hover:shadow-md',
  },
  /** 분할/합배송·기타 (2개) — 뉴트럴 그레이 계열 */
  other: {
    base: 'border-[#B2B4B8] bg-[#F8F9FA] text-[#67767F]',
    hover: 'hover:border-[#67767F] hover:bg-white hover:text-[#101820] hover:shadow-md',
  },
};

const getCardVariant = (value: string): CardVariant => {
  if (
    value === 'product_add' ||
    value === 'material_add' ||
    value === 'product_delete' ||
    value === 'material_delete'
  ) {
    return 'quantity';
  }
  if (value === 'code_change' || value === 'schedule_change' || value === 'shipping_change') {
    return 'change';
  }
  return 'other';
};

export const RequestTypeGrid = ({ onSelect }: RequestTypeGridProps) => {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REQUEST_TYPES.map((type) => {
          const style = VARIANT_STYLES[getCardVariant(type.value)];

          return (
            <Tooltip key={type.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(type)}
                  aria-label={`${type.label} 요청 작성`}
                  className={cn(
                    'rounded-lg border-2 p-6 text-center text-base font-semibold leading-snug transition-all duration-200',
                    style.base,
                    style.hover
                  )}
                >
                  {type.label}
                </button>
              </TooltipTrigger>
              {type.description && <TooltipContent>{type.description}</TooltipContent>}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
