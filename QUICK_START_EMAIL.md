# 이메일 알람 빠른 시작 가이드

## 🚀 5분 안에 설정하기

### 1단계: Resend 계정 생성 (2분)

1. https://resend.com 접속
2. 회원가입 (무료)
3. API Keys 메뉴에서 **"Create API Key"** 클릭
4. API 키 복사 (예: `re_xxxxxxxxxxxxx`)

### 2단계: Supabase CLI 설치 및 로그인 (1분)

```bash
# CLI 설치 (아직 안 했다면)
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref YOUR_PROJECT_REF
```

### 3단계: 환경 변수 설정 (1분)

```bash
# Resend API 키 설정
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

# 발신자 이메일 설정 (무료 티어는 onboarding@resend.dev 사용)
supabase secrets set FROM_EMAIL=onboarding@resend.dev

# 발신자 이름 설정
supabase secrets set FROM_NAME="PO 요청 관리 시스템"

# Supabase 설정 (이미 설정되어 있을 수 있음)
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set APP_URL=https://your-app-url.com
```

### 4단계: Edge Functions 배포 (1분)

**Windows (PowerShell):**
```powershell
.\deploy-email-functions.ps1
```

**Mac/Linux:**
```bash
chmod +x deploy-email-functions.sh
./deploy-email-functions.sh
```

**또는 수동 배포:**
```bash
supabase functions deploy send-email-notification
supabase functions deploy scheduled-reminder
```

### 5단계: 스케줄 설정 (1분)

Supabase Dashboard > SQL Editor에서 실행:

```sql
-- pg_cron 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매일 오전 10시 알람 (한국 시간)
SELECT cron.schedule(
  'send-morning-reminder',
  '0 1 * * *',  -- UTC 01:00 = KST 10:00
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

**⚠️ 중요:** `YOUR_PROJECT_REF`와 `YOUR_ANON_KEY`를 실제 값으로 교체하세요!

---

## ✅ 테스트

1. 애플리케이션에서 **'신규 PO 추가'** 클릭
2. **우선순위: '긴급'** 선택
3. 필수 필드 입력 후 추가
4. **이메일 수신 확인** ✉️

---

## 🔍 문제 해결

**이메일이 안 오나요?**
1. Resend 대시보드 확인: https://resend.com/emails
2. Supabase Edge Functions 로그 확인
3. 환경 변수 확인: `supabase secrets list`

**더 자세한 내용은 `EMAIL_SETUP_GUIDE.md` 참조**
