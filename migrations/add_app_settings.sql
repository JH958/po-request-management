-- =====================================================================
-- 앱 운영 설정 (한 행) — 요청접수·검토대기 메뉴 표시 (2026-10-26)
--
-- request_menu_enabled = FALSE(기본)이면 관리자 외 계정에는 요청접수·검토대기 메뉴가 보이지 않고,
-- 주소로 들어와도 "요청 접수 준비 중" 안내가 나옴. 요청 접수를 시작할 때 관리자 설정에서 켬.
--
-- 여러 번 실행해도 안전합니다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  request_menu_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

INSERT INTO public.app_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.app_settings IS '앱 운영 설정 (한 행) — 관리자 설정 ''요청 연결 기준'' 탭';
COMMENT ON COLUMN public.app_settings.request_menu_enabled IS '요청접수·검토대기 메뉴를 관리자 외 계정에도 보일지 (요청 접수 운영 시작 시 켬)';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can view app_settings" ON public.app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins can insert app_settings" ON public.app_settings;
CREATE POLICY "Admins can insert app_settings" ON public.app_settings
  FOR INSERT WITH CHECK (public.is_po_tracker_admin());
DROP POLICY IF EXISTS "Admins can update app_settings" ON public.app_settings;
CREATE POLICY "Admins can update app_settings" ON public.app_settings
  FOR UPDATE USING (public.is_po_tracker_admin());

-- 결과 확인
SELECT request_menu_enabled AS "요청 메뉴 표시" FROM public.app_settings;
