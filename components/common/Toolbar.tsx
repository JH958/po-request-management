/**
 * 툴바 컴포넌트 (검색, 필터, 정렬)
 */
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchIcon } from 'lucide-react';

interface ToolbarProps {
  onSearch?: (query: string) => void;
  onFilterChange?: (filters: ToolbarFilters) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

export interface ToolbarFilters {
  status?: string;
  completed?: string;
  priority?: string;
}

export const Toolbar = ({ onSearch, onFilterChange, onSortChange }: ToolbarProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [completedFilter, setCompletedFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('request_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  /**
   * 검색 핸들러
   */
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (onSearch) {
      onSearch(value);
    }
  };

  /**
   * 필터 변경 핸들러
   */
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    if (onFilterChange) {
      onFilterChange({
        status: value === 'all' ? undefined : value,
        completed: completedFilter === 'all' ? undefined : completedFilter,
        priority: priorityFilter === 'all' ? undefined : priorityFilter,
      });
    }
  };

  const handleCompletedFilterChange = (value: string) => {
    setCompletedFilter(value);
    if (onFilterChange) {
      onFilterChange({
        status: statusFilter === 'all' ? undefined : statusFilter,
        completed: value === 'all' ? undefined : value,
        priority: priorityFilter === 'all' ? undefined : priorityFilter,
      });
    }
  };

  const handlePriorityFilterChange = (value: string) => {
    setPriorityFilter(value);
    if (onFilterChange) {
      onFilterChange({
        status: statusFilter === 'all' ? undefined : statusFilter,
        completed: completedFilter === 'all' ? undefined : completedFilter,
        priority: value === 'all' ? undefined : value,
      });
    }
  };

  /**
   * 정렬 변경 핸들러
   */
  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    if (onSortChange) {
      onSortChange(newSortBy, newSortOrder);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* 검색 입력창 */}
        <div className="flex-1">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67767F]" />
            <Input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* 필터 및 정렬 */}
        <div className="flex flex-wrap gap-2">
          {/* 상태 필터 */}
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="pending">검토대기</SelectItem>
              <SelectItem value="in_review">검토중</SelectItem>
              <SelectItem value="approved">승인</SelectItem>
              <SelectItem value="rejected">거절</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
            </SelectContent>
          </Select>

          {/* 완료여부 필터 */}
          <Select value={completedFilter} onValueChange={handleCompletedFilterChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="완료여부" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="true">완료</SelectItem>
              <SelectItem value="false">미완료</SelectItem>
            </SelectContent>
          </Select>

          {/* 우선순위 필터 */}
          <Select value={priorityFilter} onValueChange={handlePriorityFilterChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="우선순위" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="urgent">긴급</SelectItem>
              <SelectItem value="normal">일반</SelectItem>
              <SelectItem value="low">보통</SelectItem>
            </SelectContent>
          </Select>

          {/* 정렬 기준 */}
          <Select
            value={`${sortBy}-${sortOrder}`}
            onValueChange={(value) => {
              const [by, order] = value.split('-');
              handleSortChange(by, order as 'asc' | 'desc');
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="request_date-desc">요청일 최신순</SelectItem>
              <SelectItem value="request_date-asc">요청일 오래된순</SelectItem>
              <SelectItem value="factory_shipment_date-asc">출하일 빠른순</SelectItem>
              <SelectItem value="factory_shipment_date-desc">출하일 늦은순</SelectItem>
              <SelectItem value="so_number-asc">SO번호 오름차순</SelectItem>
              <SelectItem value="so_number-desc">SO번호 내림차순</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
