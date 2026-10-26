/**
 * 회원가입 페이지
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ALL_CUSTOMERS } from '@/lib/request-constants';
import { useLanguage } from '@/context/LanguageContext';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { translateFormError } from '@/lib/auth-form-messages';

/**
 * 회원가입 폼 스키마
 */
const signupSchema = z
  .object({
    email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
    password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
    confirmPassword: z.string().min(8, '비밀번호 확인을 입력해주세요.'),
    fullName: z.string().min(1, '이름을 입력해주세요.'),
    department: z.string().min(1, '부서를 선택해주세요.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

type SignupFormData = z.infer<typeof signupSchema>;

/** 회원가입 부서 선택지 (값 = 저장되는 부서명, 이름 = 화면 표시명) */
interface DepartmentOption {
  value: string;
  label: string;
}

/** DB를 읽지 못했을 때의 기본 본사 부서 */
const FALLBACK_INTERNAL: DepartmentOption[] = ['영업관리팀', '제조관리팀', '제조팀', '생산관리팀', '글로벌 CS팀'].map((d) => ({
  value: d,
  label: d,
}));

/**
 * 회원가입 부서 목록 — 본사/국내법인 부서(관리자 설정 '요청 부서')와 고객처(관리자 설정 '고객처 계정')
 * 로그인 전이라 사용 중인 항목만 읽을 수 있음. 실패하면 기본 목록
 */
const loadDepartmentOptions = async (): Promise<{ internal: DepartmentOption[]; customers: DepartmentOption[] }> => {
  const supabase = createClient();
  const [origins, accounts] = await Promise.all([
    supabase.from('po_request_origins').select('department, display_name').eq('is_active', true).order('sort_order'),
    supabase.from('po_customer_accounts').select('customer_name').eq('is_active', true).order('sort_order'),
  ]);
  const internal = (origins.data ?? []).map((o) => ({ value: o.department as string, label: o.display_name as string }));
  const customers = (accounts.data ?? []).map((a) => ({ value: a.customer_name as string, label: a.customer_name as string }));
  return {
    internal: internal.length ? internal : FALLBACK_INTERNAL,
    customers: customers.length ? customers : ALL_CUSTOMERS.map((c) => ({ value: c, label: c })),
  };
};

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { t } = useLanguage();
  const [departmentOptions, setDepartmentOptions] = useState<{ internal: DepartmentOption[]; customers: DepartmentOption[] }>({
    internal: FALLBACK_INTERNAL,
    customers: ALL_CUSTOMERS.map((c) => ({ value: c, label: c })),
  });

  useEffect(() => {
    let cancelled = false;
    loadDepartmentOptions()
      .then((options) => {
        if (!cancelled) setDepartmentOptions(options);
      })
      .catch(() => {
        // 기본 목록 유지
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      department: '',
    },
  });

  /**
   * Supabase 오류 메시지를 사용자 친화적인 한글 메시지로 변환
   */
  const getErrorMessage = (error: unknown): string => {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const errorMsg = String(error.message);
      
      // Supabase 오류 메시지 매핑
      if (errorMsg.includes('User already registered')) {
        return t('이미 등록된 이메일입니다. 로그인 페이지로 이동해주세요.', 'This email is already registered. Please log in.');
      }
      if (errorMsg.includes('Invalid email')) {
        return t('유효하지 않은 이메일 주소입니다.', 'Invalid email address.');
      }
      if (errorMsg.includes('Password')) {
        return t('비밀번호가 너무 짧습니다. 최소 8자 이상 입력해주세요.', 'Password is too short. Use at least 8 characters.');
      }
      if (errorMsg.includes('Email rate limit')) {
        return t('이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 'Email limit exceeded. Please try again later.');
      }
      
      return errorMsg || t('회원가입 중 오류가 발생했습니다.', 'An error occurred while signing up.');
    }
    return t('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.', 'An error occurred while signing up. Please try again.');
  };

  /**
   * 회원가입 폼 제출 핸들러
   */
  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();

      // Supabase Auth 회원가입
      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            department: data.department,
          },
        },
      });

      if (authError) {
        throw authError;
      }

      // 회원가입 성공 처리
      // Supabase는 기본적으로 이메일 확인을 요구하므로
      // 사용자에게 이메일 확인 안내 메시지를 표시
      setSuccessMessage(
        t(
          `회원가입이 완료되었습니다. ${data.email}로 인증 메일이 발송되었습니다. 메일함을 확인하여 이메일 인증을 완료해주세요.`,
          `Sign-up complete. A verification email was sent to ${data.email}. Please check your inbox to verify your email.`
        )
      );
    } catch (error) {
      console.error('회원가입 오류:', error);
      const errorMsg = getErrorMessage(error);
      setErrorMessage(errorMsg);
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

        {/* 우측: 회원가입 폼 */}
        <div className="w-full flex justify-center">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold text-[#172132]">
                {t('회원가입', 'Sign up')}
              </CardTitle>
              <CardDescription className="text-[#5A6778]">
                {t('새 계정을 생성하여 서비스를 시작하세요', 'Create an account to get started')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* 성공 메시지 표시 */}
                {successMessage && (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-800 dark:text-green-200">
                      {t('회원가입 성공', 'Sign-up successful')}
                    </AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      {successMessage}
                    </AlertDescription>
                  </Alert>
                )}

                {/* 에러 메시지 표시 */}
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('오류', 'Error')}</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* 이름 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-[#253143]">
                    {t('이름', 'Name')} <span className="text-[#8B1538]">*</span>
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('홍길동', 'Jane Doe')}
                    {...register('fullName')}
                    className={errors.fullName ? 'border-[#8B1538]' : ''}
                    disabled={isLoading}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-[#8B1538]">
                      {translateFormError(errors.fullName.message, t)}
                    </p>
                  )}
                </div>

                {/* 이메일 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#253143]">
                    {t('이메일', 'Email')} <span className="text-[#8B1538]">*</span>
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

                {/* 부서 선택 */}
                <div className="space-y-2">
                  <Label htmlFor="department" className="text-[#253143]">
                    {t('부서', 'Department')} <span className="text-[#8B1538]">*</span>
                  </Label>
                  <Controller
                    name="department"
                    control={control}
                    render={({ field }) => (
                      <>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isLoading}
                        >
                          <SelectTrigger
                            id="department"
                            className={
                              errors.department ? 'border-[#8B1538]' : ''
                            }
                          >
                            <SelectValue placeholder={t('부서를 선택하세요', 'Select your department')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel className="text-xs text-[#8E98A8]">{t('본사/국내법인', 'HQ/Affiliates')}</SelectLabel>
                              {departmentOptions.internal.map((dept) => (
                                <SelectItem key={`i-${dept.value}`} value={dept.value}>
                                  {dept.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel className="text-xs text-[#8E98A8]">{t('고객처', 'Customers')}</SelectLabel>
                              {departmentOptions.customers.map((dept) => (
                                <SelectItem key={`c-${dept.value}`} value={dept.value}>
                                  {dept.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {errors.department && (
                          <p className="text-sm text-[#8B1538]">
                            {translateFormError(errors.department.message, t)}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>

                {/* 비밀번호 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#253143]">
                    {t('비밀번호', 'Password')} <span className="text-[#8B1538]">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('최소 8자 이상', 'At least 8 characters')}
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

                {/* 비밀번호 확인 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-[#253143]">
                    {t('비밀번호 확인', 'Confirm password')} <span className="text-[#8B1538]">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t('비밀번호를 다시 입력하세요', 'Re-enter your password')}
                      {...register('confirmPassword')}
                      className={
                        errors.confirmPassword ? 'border-[#8B1538]' : ''
                      }
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6778] hover:text-[#253143] text-sm"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? t('숨기기', 'Hide') : t('보기', 'Show')}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-[#8B1538]">
                      {translateFormError(errors.confirmPassword.message, t)}
                    </p>
                  )}
                </div>

                {/* 회원가입 버튼 */}
                <Button
                  type="submit"
                  className="w-full bg-[#8B1538] hover:bg-[#74112F] text-white"
                  disabled={isLoading}
                >
                  {isLoading ? t('회원가입 중...', 'Signing up...') : t('회원가입', 'Sign up')}
                </Button>

                {/* 로그인 링크 */}
                <div className="text-center text-sm">
                  <span className="text-[#5A6778]">{t('이미 계정이 있으신가요?', 'Already have an account?')} </span>
                  <Link
                    href="/login"
                    className="text-[#8B1538] font-medium hover:underline"
                  >
                    {t('로그인', 'Log in')}
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
