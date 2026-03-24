-- ============================================
-- 이메일 동기화 트리거 추가
-- ============================================
-- auth.users 이메일 변경 시 user_profiles.email 자동 동기화

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.user_profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_email_update();
