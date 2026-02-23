/**
 * 미들웨어용 Supabase 클라이언트 생성 유틸리티
 * 서버 요청/응답의 쿠키를 통해 세션을 갱신합니다.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 미들웨어에서 Supabase 세션을 갱신하는 함수
 * @param request - Next.js 요청 객체
 * @returns 세션이 갱신된 응답 객체
 */
export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // 환경 변수가 없으면 세션 갱신 없이 통과
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 요청 쿠키에 세션 쿠키 설정
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        // 응답 객체 재생성 (갱신된 요청 포함)
        supabaseResponse = NextResponse.next({
          request,
        });

        // 응답 쿠키에도 세션 쿠키 설정
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // 세션 갱신 시도 - getUser()가 토큰 갱신을 트리거
  // 에러가 발생해도 (만료된 토큰 등) 정상적으로 계속 진행
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // 인증이 필요한 페이지에서 미인증 사용자 처리
    if (
      !user &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/signup') &&
      !request.nextUrl.pathname.startsWith('/reset-password') &&
      !request.nextUrl.pathname.startsWith('/_next') &&
      !request.nextUrl.pathname.startsWith('/api') &&
      !request.nextUrl.pathname.includes('.')
    ) {
      // 만료된 토큰 오류 시 쿠키 정리
      if (error) {
        console.warn('미들웨어: 세션 갱신 실패, 쿠키 정리:', error.message);
        // Supabase 관련 쿠키 삭제
        request.cookies.getAll().forEach((cookie) => {
          if (cookie.name.startsWith('sb-')) {
            supabaseResponse.cookies.delete(cookie.name);
          }
        });
      }
    }
  } catch (error) {
    // 세션 갱신 실패 시에도 요청은 계속 처리
    console.warn('미들웨어: 세션 갱신 중 예외 발생:', error);
  }

  return supabaseResponse;
};
