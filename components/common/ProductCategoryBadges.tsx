/**
 * 품목 구분 뱃지 컴포넌트
 */
'use client';

import { getProductCategoryColor } from '@/lib/request-helpers';

interface ProductCategoryBadgesProps {
  category: string | null | undefined;
  size?: 'sm' | 'md';
}

export const ProductCategoryBadges = ({ category, size = 'sm' }: ProductCategoryBadgesProps) => {
  if (!category) return null;
  const categories = category.split(',').map((c) => c.trim()).filter(Boolean);
  if (categories.length === 0) return null;
  const padding = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((cat) => (
        <span
          key={cat}
          className={`inline-flex items-center rounded-full font-medium ${padding} ${getProductCategoryColor(cat)}`}
        >
          {cat}
        </span>
      ))}
    </div>
  );
};
