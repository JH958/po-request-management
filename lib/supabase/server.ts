/**
 * 서버 컴포넌트용 Supabase 클라이언트
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 서버 컴포넌트에서 사용할 Supabase 클라이언트 생성
 * Next.js 15+에서는 cookies()가 비동기이므로 async 함수로 변경
 * @returns Supabase 클라이언트 인스턴스
 */
export const createClient = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서 호출 시 무시 가능
          // 미들웨어에서 세션 갱신을 처리합니다.
        }
      },
    },
  });
};
