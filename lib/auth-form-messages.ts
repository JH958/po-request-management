/**
 * 로그인·회원가입 폼 검증 메시지 번역 (zod 스키마에는 한국어로 두고 화면에 표시할 때 변환)
 */
import type { Translate } from '@/lib/i18n';

const FORM_ERROR_EN: Record<string, string> = {
  '유효한 이메일 주소를 입력해주세요.': 'Enter a valid email address.',
  '비밀번호는 최소 8자 이상이어야 합니다.': 'Password must be at least 8 characters.',
  '비밀번호 확인을 입력해주세요.': 'Confirm your password.',
  '이름을 입력해주세요.': 'Enter your name.',
  '부서를 선택해주세요.': 'Select your department.',
  '비밀번호가 일치하지 않습니다.': 'Passwords do not match.',
};

/**
 * 폼 검증 메시지를 현재 언어로 변환 (목록에 없는 메시지는 그대로)
 */
export const translateFormError = (message: string | undefined, t: Translate): string | undefined =>
  message ? t(message, FORM_ERROR_EN[message] ?? message) : message;
