/**
 * 클라이언트 컴포넌트용 Supabase 클라이언트
 */
import { createBrowserClient } from '@supabase/ssr';

/**
 * 클라이언트 컴포넌트에서 사용할 Supabase 클라이언트 생성
 * @returns Supabase 클라이언트 인스턴스
 */
export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요.'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
