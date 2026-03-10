-- ============================================
-- user_profiles에 email 컬럼 추가 및 auth.users와 동기화
-- ============================================

-- 1) email 컬럼 추가
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) 중복되지 않은 이메일에 대한 UNIQUE 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_unique
ON public.user_profiles(email)
WHERE email IS NOT NULL;

-- 3) 기존 사용자 이메일 백필
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND up.email IS DISTINCT FROM au.email;

-- 4) 신규 회원가입 시 email 자동 저장 트리거 함수 갱신
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, department, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '사용자'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'department', ''), '미지정'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'requester')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) auth.users 이메일 변경 시 user_profiles.email 동기화
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

COMMENT ON COLUMN public.user_profiles.email IS '사용자 이메일 (auth.users.email과 동기화)';
