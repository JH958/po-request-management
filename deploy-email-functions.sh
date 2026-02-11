#!/bin/bash

# PO 요청 관리 시스템 - 이메일 알람 Edge Functions 배포 스크립트
# 사용법: ./deploy-email-functions.sh

echo "🚀 PO 요청 관리 시스템 - 이메일 알람 배포 시작"
echo ""

# 1. Supabase 로그인 확인
echo "1️⃣ Supabase 로그인 확인 중..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Supabase에 로그인되어 있지 않습니다."
    echo "다음 명령어를 실행하세요: supabase login"
    exit 1
fi
echo "✅ Supabase 로그인 확인됨"
echo ""

# 2. 프로젝트 연결 확인
echo "2️⃣ 프로젝트 연결 확인 중..."
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  프로젝트가 연결되지 않았습니다."
    read -p "프로젝트 REF를 입력하세요: " PROJECT_REF
    supabase link --project-ref "$PROJECT_REF"
fi
echo "✅ 프로젝트 연결 확인됨"
echo ""

# 3. 환경 변수 확인
echo "3️⃣ 환경 변수 확인 중..."
if ! supabase secrets list | grep -q "RESEND_API_KEY"; then
    echo "⚠️  RESEND_API_KEY가 설정되지 않았습니다."
    read -p "Resend API 키를 입력하세요: " RESEND_KEY
    supabase secrets set RESEND_API_KEY="$RESEND_KEY"
fi

if ! supabase secrets list | grep -q "FROM_EMAIL"; then
    echo "⚠️  FROM_EMAIL이 설정되지 않았습니다."
    read -p "발신자 이메일을 입력하세요 (기본값: onboarding@resend.dev): " FROM_EMAIL
    FROM_EMAIL=${FROM_EMAIL:-onboarding@resend.dev}
    supabase secrets set FROM_EMAIL="$FROM_EMAIL"
fi

if ! supabase secrets list | grep -q "FROM_NAME"; then
    supabase secrets set FROM_NAME="PO 요청 관리 시스템"
fi

echo "✅ 환경 변수 확인됨"
echo ""

# 4. Edge Functions 배포
echo "4️⃣ Edge Functions 배포 중..."
echo "  - send-email-notification 배포 중..."
supabase functions deploy send-email-notification

echo "  - scheduled-reminder 배포 중..."
supabase functions deploy scheduled-reminder

echo "✅ Edge Functions 배포 완료"
echo ""

# 5. 완료 메시지
echo "🎉 배포가 완료되었습니다!"
echo ""
echo "다음 단계:"
echo "1. Supabase Dashboard > SQL Editor에서 스케줄 설정 SQL 실행"
echo "2. 테스트 이메일 발송 확인"
echo ""
echo "자세한 내용은 EMAIL_SETUP_GUIDE.md 파일을 참조하세요."
