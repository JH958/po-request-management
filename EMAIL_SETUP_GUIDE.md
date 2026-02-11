# 이메일 알람 설정 가이드

이 가이드에서는 PO 요청 관리 시스템의 이메일 알람 기능을 활성화하는 방법을 설명합니다.

## 📋 사전 준비

1. **Resend 계정 생성** (무료)
   - https://resend.com 접속
   - 회원가입 (무료 티어: 월 3,000건 이메일 발송)
   - API 키 발급

2. **Supabase CLI 설치**
   ```bash
   npm install -g supabase
   ```

---

## 🚀 단계별 설정

### 1단계: Resend API 키 발급

1. **Resend 대시보드 접속**: https://resend.com/api-keys
2. **"Create API Key"** 클릭
3. API 키 이름 입력 (예: "PO-Request-System")
4. 권한: **"Sending access"** 선택
5. **"Add"** 클릭하여 API 키 생성
6. 생성된 API 키를 복사 (한 번만 표시되므로 안전하게 보관)

### 2단계: 도메인 인증 (선택사항, 권장)

**Resend 무료 티어는 `onboarding@resend.dev` 도메인만 사용 가능합니다.**

실제 도메인을 사용하려면:
1. Resend 대시보드 > **Domains** 클릭
2. **"Add Domain"** 클릭
3. 도메인 입력 (예: `yourcompany.com`)
4. DNS 레코드 추가 (Resend에서 제공하는 값)
5. 인증 완료 대기 (보통 몇 분 소요)

### 3단계: Supabase 프로젝트 연결

```bash
# Supabase 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref YOUR_PROJECT_REF
```

프로젝트 REF는 Supabase Dashboard > Settings > General에서 확인할 수 있습니다.

### 4단계: Edge Function 배포

```bash
# 프로젝트 디렉토리로 이동
cd po-request-management

# Edge Functions 배포
supabase functions deploy send-email-notification
supabase functions deploy scheduled-reminder
```

### 5단계: 환경 변수 설정

```bash
# Resend API 키 설정
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

# 발신자 이메일 설정 (Resend 무료 티어는 onboarding@resend.dev 사용)
supabase secrets set FROM_EMAIL=onboarding@resend.dev

# 발신자 이름 설정
supabase secrets set FROM_NAME="PO 요청 관리 시스템"

# Supabase URL 설정
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co

# Supabase Service Role Key 설정
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# 앱 URL 설정 (이메일 링크에 사용)
supabase secrets set APP_URL=https://your-app-url.com
```

**환경 변수 확인:**
```bash
supabase secrets list
```

### 6단계: 스케줄 설정 (매일 오전 10시 알람)

Supabase Dashboard > SQL Editor에서 실행:

```sql
-- pg_cron 확장 활성화 (아직 안 했다면)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 기존 스케줄 삭제 (있다면)
SELECT cron.unschedule('send-morning-reminder');

-- 매일 오전 10시 알람 (한국 시간 기준, UTC+9)
-- UTC 01:00 = KST 10:00
SELECT cron.schedule(
  'send-morning-reminder',
  '0 1 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

**주의:** `YOUR_PROJECT_REF`와 `YOUR_ANON_KEY`를 실제 값으로 교체하세요.

---

## 🧪 테스트

### 1. Edge Function 로컬 테스트

```bash
# Edge Function 로컬 실행
supabase functions serve send-email-notification

# 다른 터미널에서 테스트
curl -X POST http://localhost:54321/functions/v1/send-email-notification \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "테스트 이메일",
    "message": "이것은 테스트 이메일입니다.",
    "recipients": [
      {
        "name": "테스트 사용자",
        "email": "your-email@example.com"
      }
    ]
  }'
```

### 2. 실제 이메일 발송 테스트

1. 애플리케이션에서 **'신규 PO 추가'** 클릭
2. 긴급 요청 생성
3. 이메일 수신 확인

### 3. 스케줄 알람 테스트

```bash
# 수동으로 스케줄 함수 호출
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-reminder \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

---

## 🔧 문제 해결

### 이메일이 발송되지 않을 때

1. **Resend API 키 확인**
   ```bash
   supabase secrets list
   ```

2. **Edge Function 로그 확인**
   - Supabase Dashboard > Edge Functions > send-email-notification > Logs

3. **Resend 대시보드 확인**
   - https://resend.com/emails
   - 발송 내역 및 오류 메시지 확인

### 일반적인 오류

**오류: "Invalid API key"**
- Resend API 키가 올바른지 확인
- API 키에 "Sending access" 권한이 있는지 확인

**오류: "Domain not verified"**
- Resend 무료 티어는 `onboarding@resend.dev` 사용
- 또는 도메인 인증 완료 확인

**오류: "Rate limit exceeded"**
- Resend 무료 티어: 월 3,000건 제한
- Resend 대시보드에서 사용량 확인

---

## 📊 이메일 발송 모니터링

### Resend 대시보드
- https://resend.com/emails
- 발송 내역, 성공/실패율, 통계 확인

### Supabase 로그
- Supabase Dashboard > Edge Functions > Logs
- 함수 실행 로그 및 오류 확인

---

## 💡 추가 설정 (선택사항)

### SendGrid 사용하기

Resend 대신 SendGrid를 사용하려면:

1. `supabase/functions/send-email-notification/index.ts` 파일 수정
2. Resend 코드를 SendGrid 코드로 교체
3. 환경 변수 설정:
   ```bash
   supabase secrets set SENDGRID_API_KEY=YOUR_SENDGRID_API_KEY
   ```

### 이메일 템플릿 커스터마이징

`supabase/functions/send-email-notification/index.ts` 파일의 HTML 템플릿을 수정하여 이메일 디자인을 변경할 수 있습니다.

---

## ✅ 완료 체크리스트

- [ ] Resend 계정 생성 및 API 키 발급
- [ ] Supabase CLI 설치 및 로그인
- [ ] 프로젝트 연결 (`supabase link`)
- [ ] Edge Functions 배포
- [ ] 환경 변수 설정 (RESEND_API_KEY, FROM_EMAIL 등)
- [ ] 스케줄 설정 (pg_cron)
- [ ] 테스트 이메일 발송 확인
- [ ] 실제 요청 생성 시 이메일 수신 확인

---

**설정 완료 후 실제 이메일 알람이 정상적으로 작동합니다!** 🎉
