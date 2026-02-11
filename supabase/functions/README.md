# Supabase Edge Functions

이 디렉토리에는 PO 요청 관리 시스템의 Supabase Edge Functions가 포함되어 있습니다.

## scheduled-reminder

검토 대기 중인 요청에 대한 스케줄 알람을 전송하는 Edge Function입니다.

### 설정 방법

1. **Supabase CLI 설치**
   ```bash
   npm install -g supabase
   ```

2. **Supabase 프로젝트와 연결**
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```

3. **Edge Function 배포**
   ```bash
   supabase functions deploy scheduled-reminder
   ```

4. **환경 변수 설정**
   ```bash
   supabase secrets set SUPABASE_URL=your-supabase-url
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

5. **Cron 스케줄 설정**
   
   Supabase Dashboard > Database > Extensions > pg_cron 활성화 후:
   
   ```sql
   -- 매일 오전 10시 (한국 시간 기준, UTC+9)
   SELECT cron.schedule(
     'send-morning-reminder',
     '0 1 * * *',  -- UTC 01:00 = KST 10:00
     $$
     SELECT
       net.http_post(
         url:='https://your-project-ref.supabase.co/functions/v1/scheduled-reminder',
         headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
       ) as request_id;
     $$
   );

   -- 매일 오후 5시 (한국 시간 기준, UTC+9)
   SELECT cron.schedule(
     'send-evening-reminder',
     '0 8 * * *',  -- UTC 08:00 = KST 17:00
     $$
     SELECT
       net.http_post(
         url:='https://your-project-ref.supabase.co/functions/v1/scheduled-reminder',
         headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
       ) as request_id;
     $$
   );
   ```

### 이메일 발송 구현

현재 Edge Function은 콘솔에만 로깅합니다. 실제 이메일을 발송하려면:

1. **SendGrid 사용 (추천)**
   ```typescript
   // SendGrid API 호출 예시
   const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       personalizations: [
         {
           to: users.map(user => ({ email: user.email })),
         }
       ],
       from: { email: 'noreply@yourcompany.com' },
       subject: subject,
       content: [{ type: 'text/plain', value: message }],
     }),
   });
   ```

2. **Resend 사용**
   ```typescript
   const response = await fetch('https://api.resend.com/emails', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       from: 'noreply@yourcompany.com',
       to: users.map(user => user.email),
       subject: subject,
       text: message,
     }),
   });
   ```

## 테스트

로컬에서 테스트:

```bash
supabase functions serve scheduled-reminder
```

cURL로 호출:

```bash
curl -X POST http://localhost:54321/functions/v1/scheduled-reminder \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```
