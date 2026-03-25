-- ============================================
-- 요청 승인/반려 알림 시스템 생성
-- ============================================

-- notifications 테이블 생성
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('approved', 'rejected')),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION public.set_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_notifications_updated_at ON public.notifications;
CREATE TRIGGER trigger_set_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_notifications_updated_at();

-- 요청 상태 변경 시 알림 생성 함수
-- SECURITY DEFINER: 함수 소유자(postgres) 권한으로 실행하여 RLS 우회
CREATE OR REPLACE FUNCTION public.create_notification_on_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF NEW.status IN ('approved', 'rejected')
    AND (OLD.status IS NULL OR OLD.status <> NEW.status)
    AND NEW.requester_id IS NOT NULL THEN

    IF NEW.status = 'approved' THEN
      notification_title := '요청이 승인되었습니다';
      notification_message := 'SO 번호 ' || COALESCE(NEW.so_number, '-') || '의 요청이 승인되었습니다.';
    ELSE
      notification_title := '요청이 반려되었습니다';
      notification_message := 'SO 번호 ' || COALESCE(NEW.so_number, '-') || '의 요청이 반려되었습니다. 반려 사유를 확인해주세요.';
    END IF;

    INSERT INTO public.notifications (user_id, request_id, type, title, message)
    VALUES (NEW.requester_id, NEW.id, NEW.status, notification_title, notification_message);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_notification ON public.requests;
CREATE TRIGGER trigger_create_notification
AFTER UPDATE OF status ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.create_notification_on_status_change();

-- RLS 정책
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
