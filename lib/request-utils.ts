/**
 * PO 변경 요청 관련 유틸리티 함수
 */

import type { UrgencyLevel, RequestStatus } from '@/types/request';
import { koreanOnly, type Translate } from '@/lib/i18n';

/**
 * 날짜를 한국어 형식으로 포맷팅
 * @param dateString - 포맷팅할 날짜 문자열
 * @returns 포맷팅된 날짜 문자열 (예: "2026-01-14")
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

/**
 * 출하일까지 남은 일수 계산
 * @param shipmentDate - 출하일 날짜 문자열
 * @returns 남은 일수
 */
export const calculateDaysLeft = (shipmentDate: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shipment = new Date(shipmentDate);
  shipment.setHours(0, 0, 0, 0);
  const diff = shipment.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * 남은 일수에 따른 긴급도 레벨 계산
 * @param daysLeft - 남은 일수
 * @returns 긴급도 레벨
 */
export const getUrgencyLevel = (daysLeft: number): UrgencyLevel => {
  if (daysLeft <= 5) return 'urgent';
  if (daysLeft <= 10) return 'normal';
  return 'low';
};

/**
 * 요청 상태에 따른 한글 라벨 반환
 * @param status - 요청 상태
 * @returns 한글 라벨
 */
export const getStatusLabel = (status: RequestStatus, t: Translate = koreanOnly): string => {
  const statusLabels: Record<RequestStatus, string> = {
    pending: t('검토대기', 'Pending'),
    in_review: t('검토중', 'In review'),
    approved: t('승인', 'Approved'),
    rejected: t('거절', 'Rejected'),
    completed: t('완료', 'Completed'),
  };
  return statusLabels[status];
};

/**
 * 요청 상태에 따른 Badge 스타일 클래스 반환
 * @param status - 요청 상태
 * @returns Tailwind CSS 클래스 문자열
 */
export const getStatusBadgeClasses = (status: RequestStatus): string => {
  const statusConfig: Record<RequestStatus, { bg: string; text: string; border: string }> = {
    pending: {
      bg: 'bg-[#8E98A8]/20',
      text: 'text-[#5A6778]',
      border: 'border border-[#8E98A8]',
    },
    in_review: {
      bg: 'bg-[#A2B2C8]/20',
      text: 'text-[#253143]',
      border: 'border border-[#A2B2C8]',
    },
    approved: {
      bg: 'bg-[#A2B2C8]/30',
      text: 'text-[#253143]',
      border: 'border border-[#A2B2C8]',
    },
    rejected: {
      bg: 'bg-[#8B1538]/10',
      text: 'text-[#8B1538]',
      border: 'border border-[#8B1538]/30',
    },
    completed: {
      bg: 'bg-[#8E98A8]/10',
      text: 'text-[#5A6778]',
      border: 'border border-[#8E98A8]/50',
    },
  };

  const config = statusConfig[status];
  return `${config.bg} ${config.text} ${config.border}`;
};

/**
 * 긴급도에 따른 색상 및 아이콘 반환
 * @param urgency - 긴급도 레벨
 * @returns 색상 및 아이콘 정보
 */
export const getUrgencyConfig = (urgency: UrgencyLevel, t: Translate = koreanOnly) => {
  const configs: Record<UrgencyLevel, { color: string; bgColor: string; icon: string; label: string }> = {
    urgent: {
      color: 'text-[#8B1538]',
      bgColor: 'bg-[#8B1538]/10',
      icon: '🔴',
      label: t('긴급', 'Urgent'),
    },
    normal: {
      color: 'text-[#5A6778]',
      bgColor: 'bg-[#5A6778]/10',
      icon: '🟡',
      label: t('일반', 'Normal'),
    },
    low: {
      color: 'text-[#8E98A8]',
      bgColor: 'bg-[#8E98A8]/10',
      icon: '⚪',
      label: t('보통', 'Low'),
    },
  };
  return configs[urgency];
};
