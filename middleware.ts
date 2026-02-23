/**
 * Next.js 미들웨어 - Supabase 세션 갱신 처리
 * 모든 요청에서 세션 쿠키를 갱신하여 만료된 토큰 문제를 방지합니다.
 */
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export const middleware = async (request: NextRequest) => {
  return await updateSession(request);
};

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 매칭:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     * - 정적 파일 (svg, png, jpg 등)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
