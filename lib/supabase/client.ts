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
    const errorMsg = 
      'Supabase 환경 변수가 설정되지 않았습니다.\n' +
      '.env.local 파일에 다음 변수를 설정해주세요:\n' +
      '- NEXT_PUBLIC_SUPABASE_URL\n' +
      '- NEXT_PUBLIC_SUPABASE_ANON_KEY';
    
    console.error('❌ Supabase 클라이언트 초기화 실패:', errorMsg);
    throw new Error(errorMsg);
  }

  // URL 유효성 검사
  try {
    new URL(supabaseUrl);
  } catch {
    const errorMsg = `Supabase URL이 유효하지 않습니다: ${supabaseUrl}`;
    console.error('❌ Supabase URL 유효성 검사 실패:', errorMsg);
    throw new Error(errorMsg);
  }

  // 개발 환경에서만 환경 변수 로드 확인 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Supabase 클라이언트 초기화 성공');
    console.log('📍 Supabase URL:', supabaseUrl);
    console.log('🔑 API Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : '없음');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
