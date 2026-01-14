/**
 * 회원가입 페이지
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  '제조관리팀',
  '영업관리팀',
  '사업성장팀',
  '글로벌CS팀',
  '제조팀',
  '구매팀',
  '생산관리팀',
  '경영관리팀',
  '대리점영업팀',
  '해외영업마케팅팀',
  'Biz&Ops 팀',
  '남부지사',
  '대전지사',
  '부산지사',
  '강북지사',
  '미국법인',
  'BWA법인',
  '중국법인',
  '중국생산법인',
  '일본법인',
  '유럽법인',
  '인도법인',
  '아시아법인',
  '호주법인',
  '베트남법인',
  '터키법인',
  '멕시코법인',
];

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        return '이미 등록된 이메일입니다. 로그인 페이지로 이동해주세요.';
      }
      if (errorMsg.includes('Invalid email')) {
        return '유효하지 않은 이메일 주소입니다.';
      }
      if (errorMsg.includes('Password')) {
        return '비밀번호가 너무 짧습니다. 최소 8자 이상 입력해주세요.';
      }
      if (errorMsg.includes('Email rate limit')) {
        return '이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      }
      
      return errorMsg || '회원가입 중 오류가 발생했습니다.';
    }
    return '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.';
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
      const { data: authData, error: authError } = await supabase.auth.signUp({
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
        `회원가입이 완료되었습니다. ${data.email}로 인증 메일이 발송되었습니다. 메일함을 확인하여 이메일 인증을 완료해주세요.`
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
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4 py-12">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* 좌측: 브랜딩 영역 */}
        <div className="hidden lg:flex flex-col justify-center space-y-6 px-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-[#101820]">
              PO 변경 요청 관리 시스템
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

        {/* 우측: 회원가입 폼 */}
        <div className="w-full flex justify-center">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold text-[#101820]">
                회원가입
              </CardTitle>
              <CardDescription className="text-[#67767F]">
                새 계정을 생성하여 서비스를 시작하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* 성공 메시지 표시 */}
                {successMessage && (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-800 dark:text-green-200">
                      회원가입 성공
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
                    <AlertTitle>오류</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* 이름 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-[#4B4F5A]">
                    이름 <span className="text-[#971B2F]">*</span>
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="홍길동"
                    {...register('fullName')}
                    className={errors.fullName ? 'border-[#971B2F]' : ''}
                    disabled={isLoading}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-[#971B2F]">
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* 이메일 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#4B4F5A]">
                    이메일 <span className="text-[#971B2F]">*</span>
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

                {/* 부서 선택 */}
                <div className="space-y-2">
                  <Label htmlFor="department" className="text-[#4B4F5A]">
                    부서 <span className="text-[#971B2F]">*</span>
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
                              errors.department ? 'border-[#971B2F]' : ''
                            }
                          >
                            <SelectValue placeholder="부서를 선택하세요" />
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
                          <p className="text-sm text-[#971B2F]">
                            {errors.department.message}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>

                {/* 비밀번호 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#4B4F5A]">
                    비밀번호 <span className="text-[#971B2F]">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="최소 8자 이상"
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

                {/* 비밀번호 확인 입력 */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-[#4B4F5A]">
                    비밀번호 확인 <span className="text-[#971B2F]">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="비밀번호를 다시 입력하세요"
                      {...register('confirmPassword')}
                      className={
                        errors.confirmPassword ? 'border-[#971B2F]' : ''
                      }
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#67767F] hover:text-[#4B4F5A] text-sm"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? '숨기기' : '보기'}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-[#971B2F]">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                {/* 회원가입 버튼 */}
                <Button
                  type="submit"
                  className="w-full bg-[#971B2F] hover:bg-[#7A1626] text-white"
                  disabled={isLoading}
                >
                  {isLoading ? '회원가입 중...' : '회원가입'}
                </Button>

                {/* 로그인 링크 */}
                <div className="text-center text-sm">
                  <span className="text-[#67767F]">이미 계정이 있으신가요? </span>
                  <Link
                    href="/login"
                    className="text-[#971B2F] font-medium hover:underline"
                  >
                    로그인
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* 모바일: 브랜딩 영역 (하단에 표시) */}
        <div className="lg:hidden flex flex-col items-center space-y-4 text-center px-4">
          <h1 className="text-2xl font-bold text-[#101820]">
            PO 변경 요청 관리 시스템
          </h1>
          <p className="text-sm text-[#67767F]">
            체계적인 PO 변경 요청 관리를 통해 효율적인 협업을 지원합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
