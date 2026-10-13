/**
 * 회원가입 페이지
 */
'use client';

import { useState } from 'react';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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

/**
 * 부서 목록
 */
const departments = [
  // 본사 팀
  '영업관리팀',
  '제조관리팀',
  '혈압계팀',
  'W팀',
  '글로벌 CS팀',
  // 해외 법인 및 지사
  '일본(일본법인)',
  '미국(미국법인)',
  '중국(중국법인)',
  '말레이시아(아시아법인)',
  '인도(인도법인)',
  '네덜란드(유럽법인)',
  '멕시코(멕시코법인)',
  '중국(중국법인_생산)',
  '독일(유럽법인_독일지사)',
  '주식회사 코르트',
  '호주(호주법인)',
  '미국(미국동부법인)',
  '주식회사 인바디헬스케어',
  '영국(유럽법인_영국지사)',
  '베트남(베트남법인)',
  '튀르키예(튀르키예법인)',
  // 국내 지사
  '국내_인바디 서부지사',
  '국내_인바디 남부지사',
  '국내_인바디 강남지사',
  '국내_인바디 대전지사',
  '국내_인바디 대구지사',
  '국내_인바디 광주지사',
  '국내_인바디 강북지사',
  '국내_인바디 강서지사',
  '국내_인바디 강원지사',
  '국내_인바디 중부지사',
  '국내_인바디 부산지사',
  // 기타 해외 법인
  '태국(InBody Thailand Co., Ltd.)',
  '인도네시아(PT. InBody Global Healthcare)',
];

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { t } = useLanguage();

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
              {t('체계적인 PO 변경 요청 관리를 통해', 'Structured PO change request management')}
              <br />
              {t('유관부서 간 효율적인 협업을 지원합니다.', 'for smooth collaboration across departments.')}
            </p>
          </div>
          <div className="space-y-2 text-sm text-[#5A6778]">
            <div className="flex items-center gap-2">
              <span className="text-[#8B1538]">✓</span>
              <span>{t('실시간 요청 현황 추적', 'Real-time request tracking')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8B1538]">✓</span>
              <span>{t('원활한 승인 워크플로우', 'Smooth approval workflow')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8B1538]">✓</span>
              <span>{t('중앙 집중식 요청 관리', 'Centralized request management')}</span>
            </div>
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
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
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
              '체계적인 PO 변경 요청 관리를 통해 효율적인 협업을 지원합니다.',
              'Structured PO change request management for smooth collaboration.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
