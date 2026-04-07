/**
 * 관리자 모드 HttpOnly 세션 쿠키 삭제 API
 */
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin-session-cookie';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
