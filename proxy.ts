/**
 * Next.js Proxy - Supabase 세션 갱신 처리
 * 모든 요청에서 세션 쿠키를 갱신하여 만료된 토큰 문제를 방지합니다.
 */
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export const proxy = async (request: NextRequest) => {
  return await updateSession(request);
};

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
