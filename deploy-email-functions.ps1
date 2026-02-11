# PO 요청 관리 시스템 - 이메일 알람 Edge Functions 배포 스크립트 (PowerShell)
# 사용법: .\deploy-email-functions.ps1

Write-Host "🚀 PO 요청 관리 시스템 - 이메일 알람 배포 시작" -ForegroundColor Cyan
Write-Host ""

# 1. Supabase CLI 확인
Write-Host "1️⃣ Supabase CLI 확인 중..." -ForegroundColor Yellow
try {
    $supabaseVersion = supabase --version 2>&1
    Write-Host "✅ Supabase CLI 설치됨: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI가 설치되지 않았습니다." -ForegroundColor Red
    Write-Host "다음 명령어를 실행하세요: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 2. Supabase 로그인 확인
Write-Host "2️⃣ Supabase 로그인 확인 중..." -ForegroundColor Yellow
try {
    supabase projects list | Out-Null
    Write-Host "✅ Supabase 로그인 확인됨" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase에 로그인되어 있지 않습니다." -ForegroundColor Red
    Write-Host "다음 명령어를 실행하세요: supabase login" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 3. 프로젝트 연결 확인
Write-Host "3️⃣ 프로젝트 연결 확인 중..." -ForegroundColor Yellow
if (-not (Test-Path ".supabase\config.toml")) {
    Write-Host "⚠️  프로젝트가 연결되지 않았습니다." -ForegroundColor Yellow
    $projectRef = Read-Host "프로젝트 REF를 입력하세요"
    supabase link --project-ref $projectRef
}
Write-Host "✅ 프로젝트 연결 확인됨" -ForegroundColor Green
Write-Host ""

# 4. 환경 변수 확인 및 설정
Write-Host "4️⃣ 환경 변수 확인 중..." -ForegroundColor Yellow

$secrets = supabase secrets list 2>&1

if ($secrets -notmatch "RESEND_API_KEY") {
    Write-Host "⚠️  RESEND_API_KEY가 설정되지 않았습니다." -ForegroundColor Yellow
    $resendKey = Read-Host "Resend API 키를 입력하세요"
    supabase secrets set RESEND_API_KEY=$resendKey
    Write-Host "✅ RESEND_API_KEY 설정 완료" -ForegroundColor Green
}

if ($secrets -notmatch "FROM_EMAIL") {
    Write-Host "⚠️  FROM_EMAIL이 설정되지 않았습니다." -ForegroundColor Yellow
    $fromEmail = Read-Host "발신자 이메일을 입력하세요 (기본값: onboarding@resend.dev)"
    if ([string]::IsNullOrWhiteSpace($fromEmail)) {
        $fromEmail = "onboarding@resend.dev"
    }
    supabase secrets set FROM_EMAIL=$fromEmail
    Write-Host "✅ FROM_EMAIL 설정 완료: $fromEmail" -ForegroundColor Green
}

if ($secrets -notmatch "FROM_NAME") {
    supabase secrets set FROM_NAME="PO 요청 관리 시스템"
    Write-Host "✅ FROM_NAME 설정 완료" -ForegroundColor Green
}

Write-Host "✅ 환경 변수 확인 완료" -ForegroundColor Green
Write-Host ""

# 5. Edge Functions 배포
Write-Host "5️⃣ Edge Functions 배포 중..." -ForegroundColor Yellow
Write-Host "  - send-email-notification 배포 중..." -ForegroundColor Cyan
supabase functions deploy send-email-notification

Write-Host "  - scheduled-reminder 배포 중..." -ForegroundColor Cyan
supabase functions deploy scheduled-reminder

Write-Host "✅ Edge Functions 배포 완료" -ForegroundColor Green
Write-Host ""

# 6. 완료 메시지
Write-Host "🎉 배포가 완료되었습니다!" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "1. Supabase Dashboard > SQL Editor에서 스케줄 설정 SQL 실행" -ForegroundColor White
Write-Host "2. 테스트 이메일 발송 확인" -ForegroundColor White
Write-Host ""
Write-Host "자세한 내용은 EMAIL_SETUP_GUIDE.md 파일을 참조하세요." -ForegroundColor Cyan
