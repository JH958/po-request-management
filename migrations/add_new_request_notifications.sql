-- ============================================
-- 신규 요청 접수 시 인앱 알림 생성
-- ============================================

-- 알림 유형에 new_request 추가
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('approved', 'rejected', 'new_request'));

-- 고객처 부서 판별 (notification-utils.ts와 동일 키워드)
CREATE OR REPLACE FUNCTION public.is_customer_department(dept TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT dept IS NOT NULL AND (
    dept LIKE '%법인%' OR dept LIKE '%대리점%' OR dept LIKE '%지사%'
  );
$$;

-- 신규 요청 INSERT 시 검토 담당자에게 인앱 알림 생성
CREATE OR REPLACE FUNCTION public.create_notifications_on_new_request()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_dept TEXT;
  recipient RECORD;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.requester_id IS NULL THEN
    RETURN NEW;
  END IF;

  notification_title := '새로운 PO 변경 요청';
  notification_message :=
    'SO 번호 ' || COALESCE(NEW.so_number, '(신규)') ||
    ' | 고객: ' || COALESCE(NEW.customer, '-') ||
    ' | 요청자: ' || COALESCE(NEW.requester_name, '-');

  SELECT department INTO requester_dept
  FROM public.user_profiles
  WHERE id = NEW.requester_id;

  FOR recipient IN
    SELECT DISTINCT up.id AS user_id
    FROM public.user_profiles up
    WHERE up.id IS NOT NULL
      AND up.id <> NEW.requester_id
      AND (
        up.department = '영업관리팀'
        OR (
          public.is_customer_department(requester_dept)
          AND up.department LIKE '%팀'
          AND up.department <> '영업관리팀'
        )
        OR (
          NOT public.is_customer_department(requester_dept)
          AND requester_dept LIKE '%팀'
          AND up.department = NEW.customer
        )
      )
  LOOP
    INSERT INTO public.notifications (user_id, request_id, type, title, message)
    VALUES (recipient.user_id, NEW.id, 'new_request', notification_title, notification_message);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_notification_on_insert ON public.requests;
CREATE TRIGGER trigger_create_notification_on_insert
AFTER INSERT ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.create_notifications_on_new_request();

-- Realtime 구독용 (이미 추가된 경우 무시)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
