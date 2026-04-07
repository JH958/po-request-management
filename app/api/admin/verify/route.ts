/**
 * 관리자 모드 비밀번호 검증 API (서버만 비밀번호를 알고 HttpOnly 쿠키 발급)
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SEC,
  buildAdminSessionToken,
} from '@/lib/admin-session-cookie';

export async function POST(request: Request) {
  const expected = process.env.ADMIN_PAGE_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!expected || !secret) {
    return NextResponse.json(
      {
        error:
          '관리자 로그인 서버 설정이 완료되지 않았습니다. ADMIN_PAGE_PASSWORD와 ADMIN_SESSION_SECRET을 설정해주세요.',
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const password = body.password ?? '';
  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SEC;
  const token = buildAdminSessionToken(user.id, exp, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  });
  return res;
}
