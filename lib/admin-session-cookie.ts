/**
 * 관리자 모드 HttpOnly 쿠키용 서명·검증 (서버 전용)
 */
import { createHmac, timingSafeEqual } from 'crypto';

/** 관리자 세션 쿠키 이름 */
export const ADMIN_SESSION_COOKIE_NAME = 'po_admin_session';

/** 쿠키 유효 시간(초) — 8시간 */
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 8;

export interface AdminSessionPayload {
  uid: string;
  exp: number;
}

/**
 * uid·만료 시각을 HMAC으로 서명한 토큰 문자열 생성
 */
export const buildAdminSessionToken = (
  uid: string,
  expUnixSec: number,
  secret: string
): string => {
  const payloadJson = JSON.stringify({ uid, exp: expUnixSec });
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
};

/**
 * 쿠키 토큰 검증 후 페이로드 반환 (실패 시 null)
 */
export const verifyAdminSessionToken = (
  token: string,
  secret: string
): AdminSessionPayload | null => {
  const dot = token.indexOf('.');
  if (dot === -1) {
    return null;
  }
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as { uid?: unknown; exp?: unknown };
    if (typeof obj.uid !== 'string' || typeof obj.exp !== 'number') {
      return null;
    }
    return { uid: obj.uid, exp: obj.exp };
  } catch {
    return null;
  }
};
