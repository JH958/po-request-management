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
import { useLanguage } from '@/context/LanguageContext';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { translateFormError } from '@/lib/auth-form-messages';

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
  const { t } = useLanguage();
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
      <div className="min-h-screen flex items-center justify-center bg-[#F1F4F8]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-[#5A6778]">{user ? t('리다이렉트 중...', 'Redirecting...') : t('로딩 중...', 'Loading...')}</p>
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
        return t('이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.', 'Your email is not verified yet. Please check your inbox.');
      }
      if (errorMsg.includes('Invalid login credentials')) {
        return t('이메일 또는 비밀번호가 올바르지 않습니다.', 'Incorrect email or password.');
      }
      if (errorMsg.includes('User not found')) {
        return t('등록되지 않은 이메일입니다.', 'This email is not registered.');
      }
      
      return errorMsg || t('로그인 중 오류가 발생했습니다.', 'An error occurred while logging in.');
    }
    return t('로그인 중 오류가 발생했습니다. 다시 시도해주세요.', 'An error occurred while logging in. Please try again.');
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
      const { error: authError } = await supabase.auth.signInWithPassword({
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
    } catch (error: unknown) {
      console.error('로그인 오류:', error);
      
      // 네트워크 오류 처리
      if (error instanceof TypeError && (error.message === 'Failed to fetch' || error.name === 'TypeError')) {
        const errorMsg = t(
          '네트워크 연결 오류가 발생했습니다. 다음을 확인해주세요:\n1. 인터넷 연결 상태\n2. .env.local 파일의 Supabase URL과 API 키가 올바른지\n3. Supabase 프로젝트가 활성화되어 있는지',
          'A network error occurred. Please check:\n1. Your internet connection\n2. The Supabase URL and API key in .env.local\n3. That the Supabase project is active'
        );
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
    <div className="relative min-h-screen flex items-center justify-center bg-[#F1F4F8] px-4 py-12">
      <LanguageToggle className="absolute right-5 top-5" />
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* 좌측: 브랜딩 영역 */}
        <div className="hidden lg:flex flex-col justify-center space-y-6 px-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-brand-logo">
              PO Tracker
            </h1>
            <p className="text-lg text-[#5A6778] leading-relaxed">
              {t('매일의 DO 변경을 추적해,', 'Tracks DO changes every day')}
              <br />
              {t('PO 변경의 원인과 흐름을 한눈에 보여 줍니다.', 'to show what changed in each PO and why.')}
            </p>
          </div>
        </div>

        {/* 우측: 로그인 폼 */}
        <div className="w-full flex justify-center">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold text-[#172132]">
                {t('로그인', 'Log in')}
              </CardTitle>
              <CardDescription className="text-[#5A6778]">
                {t('계정에 로그인하여 서비스를 이용하세요', 'Log in to your account to continue')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* 에러 메시지 표시 */}
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('오류', 'Error')}</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* 이메일 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#253143]">
                    {t('이메일', 'Email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    {...register('email')}
                    className={errors.email ? 'border-[#8B1538]' : ''}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-[#8B1538]">
                      {translateFormError(errors.email.message, t)}
                    </p>
                  )}
                </div>

                {/* 비밀번호 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#253143]">
                    {t('비밀번호', 'Password')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('비밀번호를 입력하세요', 'Enter your password')}
                      {...register('password')}
                      className={errors.password ? 'border-[#8B1538]' : ''}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6778] hover:text-[#253143] text-sm"
                      disabled={isLoading}
                    >
                      {showPassword ? t('숨기기', 'Hide') : t('보기', 'Show')}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-[#8B1538]">
                      {translateFormError(errors.password.message, t)}
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
                            className="text-sm text-[#253143] cursor-pointer"
                            onClick={() => field.onChange(!field.value)}
                          >
                            {t('로그인 상태 유지', 'Keep me logged in')}
                          </Label>
                        </>
                      )}
                    />
                  </div>
                  <Link
                    href="/reset-password"
                    className="text-sm text-[#8B1538] hover:underline"
                  >
                    {t('비밀번호 찾기', 'Forgot password?')}
                  </Link>
                </div>

                {/* 로그인 버튼 */}
                <Button
                  type="submit"
                  className="w-full bg-[#8B1538] hover:bg-[#74112F] text-white"
                  disabled={isLoading}
                >
                  {isLoading ? t('로그인 중...', 'Logging in...') : t('로그인', 'Log in')}
                </Button>

                {/* 회원가입 링크 */}
                <div className="text-center text-sm">
                  <span className="text-[#5A6778]">{t('계정이 없으신가요?', "Don't have an account?")} </span>
                  <Link
                    href="/signup"
                    className="text-[#8B1538] font-medium hover:underline"
                  >
                    {t('회원가입', 'Sign up')}
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* 모바일: 브랜딩 영역 (하단에 표시) */}
        <div className="lg:hidden flex flex-col items-center space-y-4 text-center px-4">
          <h1 className="text-2xl font-bold text-brand-logo">
            PO Tracker
          </h1>
          <p className="text-sm text-[#5A6778]">
            {t(
              '매일의 DO 변경을 추적해, PO 변경의 원인과 흐름을 한눈에 보여 줍니다.',
              'Tracks DO changes every day to show what changed in each PO and why.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
