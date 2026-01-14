/**
 * 대시보드 관련 유틸리티 함수
 */

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
export const getUrgencyLevel = (daysLeft: number): 'urgent' | 'normal' | 'low' => {
  if (daysLeft <= 5) return 'urgent';
  if (daysLeft <= 10) return 'normal';
  return 'low';
};
