/**
 * 관리자 모드 HttpOnly 세션 쿠키 유효 여부 조회 API
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSessionToken,
} from '@/lib/admin-session-cookie';

export async function GET() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false });
  }

  const payload = verifyAdminSessionToken(raw, secret);
  if (!payload) {
    return NextResponse.json({ ok: false });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return NextResponse.json({ ok: false });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.uid) {
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}
