/**
 * 로그인 페이지
 */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * 로그인 폼 스키마
 */
const loginSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 모든 훅은 early return 전에 호출해야 함 (React Hooks 규칙)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  /**
   * 이미 로그인된 사용자는 메인 페이지로 리다이렉트
   */
  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  // 로딩 중이거나 이미 로그인된 사용자는 로딩 표시 (단, 간단하게)
  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#971B2F] mx-auto"></div>
          <p className="mt-4 text-[#67767F]">{user ? '리다이렉트 중...' : '로딩 중...'}</p>
        </div>
      </div>
    );
  }

  /**
   * Supabase 오류 메시지를 사용자 친화적인 한글 메시지로 변환
   */
  const getErrorMessage = (error: unknown): string => {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const errorMsg = String(error.message);
      
      // Supabase 오류 메시지 매핑
      if (errorMsg.includes('Email not confirmed')) {
        return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.';
      }
      if (errorMsg.includes('Invalid login credentials')) {
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      }
      if (errorMsg.includes('User not found')) {
        return '등록되지 않은 이메일입니다.';
      }
      
      return errorMsg || '로그인 중 오류가 발생했습니다.';
    }
    return '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
  };

  /**
   * 로그인 폼 제출 핸들러
   */
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 환경 변수 확인
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          'Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요.'
        );
      }

      // Supabase URL 유효성 검사
      try {
        new URL(supabaseUrl);
      } catch {
        throw new Error('Supabase URL이 유효하지 않습니다. .env.local 파일을 확인해주세요.');
      }

      const supabase = createClient();

      // Supabase Auth 로그인
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        throw authError;
      }

      // 로그인 성공 처리
      // 세션은 Supabase Auth에서 자동 관리되므로 메인 페이지로 이동
      router.push('/');
      router.refresh(); // 세션 정보 갱신
    } catch (error: any) {
      console.error('로그인 오류:', error);
      
      // 네트워크 오류 처리
      if (error?.message === 'Failed to fetch' || error?.name === 'TypeError') {
        const errorMsg = '네트워크 연결 오류가 발생했습니다. 다음을 확인해주세요:\n' +
          '1. 인터넷 연결 상태\n' +
          '2. .env.local 파일의 Supabase URL과 API 키가 올바른지\n' +
          '3. Supabase 프로젝트가 활성화되어 있는지';
        setErrorMessage(errorMsg);
      } else {
        const errorMsg = getErrorMessage(error);
        setErrorMessage(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4 py-12">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* 좌측: 브랜딩 영역 */}
        <div className="hidden lg:flex flex-col justify-center space-y-6 px-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-[#101820]">
              Purchase On
            </h1>
            <p className="text-lg text-[#67767F] leading-relaxed">
              체계적인 PO 변경 요청 관리를 통해<br />
              유관부서 간 효율적인 협업을 지원합니다.
            </p>
          </div>
          <div className="space-y-2 text-sm text-[#67767F]">
            <div className="flex items-center gap-2">
              <span className="text-[#971B2F]">✓</span>
              <span>실시간 요청 현황 추적</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#971B2F]">✓</span>
              <span>원활한 승인 워크플로우</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#971B2F]">✓</span>
              <span>중앙 집중식 요청 관리</span>
            </div>
          </div>
        </div>

        {/* 우측: 로그인 폼 */}
        <div className="w-full flex justify-center">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold text-[#101820]">
                로그인
              </CardTitle>
              <CardDescription className="text-[#67767F]">
                계정에 로그인하여 서비스를 이용하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* 에러 메시지 표시 */}
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>오류</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* 이메일 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#4B4F5A]">
                    이메일
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    {...register('email')}
                    className={errors.email ? 'border-[#971B2F]' : ''}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-[#971B2F]">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* 비밀번호 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#4B4F5A]">
                    비밀번호
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="비밀번호를 입력하세요"
                      {...register('password')}
                      className={errors.password ? 'border-[#971B2F]' : ''}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#67767F] hover:text-[#4B4F5A] text-sm"
                      disabled={isLoading}
                    >
                      {showPassword ? '숨기기' : '보기'}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-[#971B2F]">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Remember Me 체크박스 및 비밀번호 찾기 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Controller
                      name="rememberMe"
                      control={control}
                      render={({ field }) => (
                        <>
                          <Checkbox
                            id="rememberMe"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isLoading}
                          />
                          <Label
                            htmlFor="rememberMe"
                            className="text-sm text-[#4B4F5A] cursor-pointer"
                            onClick={() => field.onChange(!field.value)}
                          >
                            로그인 상태 유지
                          </Label>
                        </>
                      )}
                    />
                  </div>
                  <Link
                    href="/reset-password"
                    className="text-sm text-[#971B2F] hover:underline"
                  >
                    비밀번호 찾기
                  </Link>
                </div>

                {/* 로그인 버튼 */}
                <Button
                  type="submit"
                  className="w-full bg-[#971B2F] hover:bg-[#7A1626] text-white"
                  disabled={isLoading}
                >
                  {isLoading ? '로그인 중...' : '로그인'}
                </Button>

                {/* 회원가입 링크 */}
                <div className="text-center text-sm">
                  <span className="text-[#67767F]">계정이 없으신가요? </span>
                  <Link
                    href="/signup"
                    className="text-[#971B2F] font-medium hover:underline"
                  >
                    회원가입
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* 모바일: 브랜딩 영역 (하단에 표시) */}
        <div className="lg:hidden flex flex-col items-center space-y-4 text-center px-4">
          <h1 className="text-2xl font-bold text-[#101820]">
            Purchase On
          </h1>
          <p className="text-sm text-[#67767F]">
            체계적인 PO 변경 요청 관리를 통해 효율적인 협업을 지원합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
