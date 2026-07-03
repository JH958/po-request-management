/**
 * 인증된 메인 레이아웃 (사이드바 + 헤더)
 */
import { AppShell } from '@/components/common/AppShell';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
