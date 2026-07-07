/**
 * 알림 관련 커스텀 훅
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { asApiError, getReadableErrorMessage } from '@/lib/request-helpers';

export interface NotificationItem {
  id: string;
  user_id: string;
  request_id: string;
  type: 'approved' | 'rejected' | 'new_request';
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  requests?: {
    so_number: string | null;
    customer: string | null;
    request_date: string | null;
    category_of_request: string | null;
    product_category: string | null;
    erp_code: string | null;
    item_name: string | null;
    quantity: number | null;
    confirmed_quantity: number | null;
    review_details: string | null;
    status: string | null;
  } | null;
}

/**
 * 로그인 사용자의 알림 목록을 관리하는 훅
 */
export const useNotifications = (userId: string | undefined) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationDetail, setShowNotificationDetail] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id, user_id, request_id, type, title, message, is_read, created_at, updated_at,
          requests:request_id (
            so_number, customer, request_date, category_of_request, product_category,
            erp_code, item_name, quantity, confirmed_quantity, review_details, status
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const nextNotifications = (data || []) as unknown as NotificationItem[];
      setNotifications(nextNotifications);
      setUnreadCount(nextNotifications.filter((n) => !n.is_read).length);
    } catch (error: unknown) {
      const apiError = asApiError(error);
      const errorMessage = getReadableErrorMessage(error);
      if (
        apiError.code === '42P01' ||
        apiError.code === 'PGRST200' ||
        apiError.code === 'PGRST205' ||
        errorMessage.includes('notifications') ||
        errorMessage.includes('Could not find the table')
      ) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      console.error('알림 조회 실패:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void fetchNotifications();
  }, [userId, fetchNotifications]);

  /** 신규 알림 Realtime 구독 */
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    if (showNotifications && userId) void fetchNotifications();
  }, [showNotifications, userId, fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('알림 읽음 처리 실패:', error);
      toast.error('알림 읽음 처리에 실패했습니다.');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('모든 알림을 읽음 처리했습니다.');
    } catch (error) {
      console.error('모두 읽음 처리 실패:', error);
      toast.error('알림 처리에 실패했습니다.');
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.is_read) await markAsRead(notification.id);
    setSelectedNotification(notification);
    setShowNotificationDetail(true);
    setShowNotifications(false);
  };

  return {
    notifications,
    unreadCount,
    showNotifications,
    setShowNotifications,
    showNotificationDetail,
    setShowNotificationDetail,
    selectedNotification,
    handleMarkAllAsRead,
    handleNotificationClick,
    formatNotificationTime: (date: string) =>
      formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko }),
  };
};
