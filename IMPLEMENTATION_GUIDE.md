# PO 요청 관리 시스템 - 구현 가이드

## 📋 구현된 기능

### 1. 요청 접수 테이블 영역 개선
- ✅ 테이블을 페이지 가운데 길게 배치
- ✅ '+추가' 버튼을 **'기존 PO 수정'**과 **'신규 PO 추가'** 두 개로 분리
- ✅ 각 버튼별 다른 필드 세트 표시
  - **기존 PO 수정**: 고객, SO 번호, 현재 출하일, 희망 출하일, 확정 출하일, 요청 구분, 우선순위, 품목 정보, 요청 사유
  - **신규 PO 추가**: 고객, 희망 출하일, 확정 출하일, 요청 구분, 우선순위, 품목 정보, 요청사유, 요청상세

### 2. 필드 개선
- ✅ **요청구분 드롭다운** 업데이트:
  - 품목 추가
  - 품목 삭제
  - 수량 추가
  - 수량 삭제
  - 품목 코드 변경
  - 출하일정 변경
  - 운송방법 변경

- ✅ **희망 출하일 & 확정 출하일**:
  - 요청구분이 '출하일정 변경'일 때만 활성화
  - 확정 출하일은 검토자(reviewer) 또는 관리자(admin)만 수정 가능

- ✅ **수량 필드**: 음의 값, 0, 양의 값 모두 입력 가능

### 3. 품목 관리 개선
- ✅ 품목코드, 품목명, 수량을 **표 형식**으로 표시
- ✅ **Excel 업로드** 기능 추가
  - CSV 형식 지원
  - 품목 일괄 등록 가능
  - Excel 형식: `품목코드, 품목명, 수량`

### 4. 레이아웃 개선
- ✅ 검토 대기 카드를 테이블 아래로 이동
- ✅ 3x3 그리드 형식으로 표시
- ✅ 반응형 디자인 (모바일, 태블릿, 데스크톱)

### 5. 알람 기능
- ✅ 긴급 요청 생성 시 모든 사용자에게 알람
- ✅ 신규 요청 생성 시 모든 사용자에게 알람
- ✅ 검토 대기 중인 요청에 대한 스케줄 알람 (오전 10시, 오후 5시)
  - Supabase Edge Function 구현
  - pg_cron을 통한 스케줄 실행

---

## 🔧 설정 방법

### 1. 데이터베이스 마이그레이션 실행

Supabase Dashboard > SQL Editor에서 다음 파일을 실행하세요:

```bash
migrations/add_new_fields.sql
```

또는 SQL 직접 실행:

```sql
-- 1. 희망 출하일 필드 추가
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS desired_shipment_date DATE;

-- 2. 확정 출하일 필드 추가
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS confirmed_shipment_date DATE;

-- 3. 품목 목록 필드 추가 (JSONB 형식)
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS items JSONB;

-- 4. 수량 체크 제약 조건 수정 (음수, 0 허용)
ALTER TABLE public.requests 
DROP CONSTRAINT IF EXISTS requests_quantity_check;

ALTER TABLE public.requests 
ADD CONSTRAINT requests_quantity_check CHECK (quantity IS NULL OR quantity >= -999999);
```

### 2. 알람 기능 설정

#### Step 1: Supabase Edge Function 배포

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 연결
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Edge Function 배포
supabase functions deploy scheduled-reminder

# 환경 변수 설정
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

#### Step 2: pg_cron 스케줄 설정

Supabase Dashboard > Database > Extensions에서 `pg_cron` 활성화 후, SQL Editor에서 실행:

```sql
-- 매일 오전 10시 알람 (한국 시간 기준)
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

-- 매일 오후 5시 알람 (한국 시간 기준)
SELECT cron.schedule(
  'send-evening-reminder',
  '0 8 * * *',  -- UTC 08:00 = KST 17:00
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

#### Step 3: 이메일 발송 설정 (선택사항)

현재는 콘솔에만 로깅됩니다. 실제 이메일을 발송하려면:

1. **SendGrid 계정 생성**: https://sendgrid.com
2. API 키 발급
3. Edge Function 코드에 이메일 발송 로직 추가 (상세 내용은 `supabase/functions/README.md` 참조)

```bash
supabase secrets set SENDGRID_API_KEY=YOUR_SENDGRID_API_KEY
```

---

## 📱 사용 방법

### 요청 생성

1. **기존 PO 수정**:
   - '기존 PO 수정' 버튼 클릭
   - 고객, SO 번호, 현재 출하일 입력
   - 요청구분이 '출하일정 변경'인 경우 희망 출하일/확정 출하일 입력
   - 품목 정보 입력 (표 형식 또는 Excel 업로드)
   - 요청사유 선택

2. **신규 PO 추가**:
   - '신규 PO 추가' 버튼 클릭
   - 고객, 희망 출하일, 확정 출하일 입력
   - 품목 정보 입력 (표 형식 또는 Excel 업로드)
   - 요청사유 및 요청상세 입력

### Excel 업로드

Excel 파일 형식 (CSV):

```csv
품목코드,품목명,수량
PROD-001,제품 A,100
PROD-002,제품 B,-50
PROD-003,제품 C,0
```

- 첫 번째 줄은 헤더 (건너뜀)
- 수량은 음수, 0, 양수 모두 가능

### 권한별 기능

- **요청자 (Requester)**:
  - 자신의 요청 생성, 조회, 수정 (pending 상태만)
  - 자신의 요청 삭제 (pending 상태만)

- **검토자 (Reviewer)**:
  - 모든 요청 조회
  - 요청 승인/거절
  - 확정 출하일 수정
  - 검토 정보 입력

- **관리자 (Admin)**:
  - 모든 권한
  - 완료 여부 변경

---

## 🧪 테스트

### 1. 로컬 개발 서버 실행

```bash
cd po-request-management
npm run dev
```

### 2. Edge Function 로컬 테스트

```bash
supabase functions serve scheduled-reminder

# cURL로 호출
curl -X POST http://localhost:54321/functions/v1/scheduled-reminder \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### 3. 알람 테스트

1. 긴급 요청 생성
2. 콘솔에서 알람 로그 확인
3. Supabase Dashboard > Edge Functions > Logs에서 확인

---

## 📝 주의사항

1. **데이터베이스 마이그레이션**:
   - 반드시 프로덕션 환경에 적용하기 전에 스테이징 환경에서 테스트하세요.
   - 백업을 먼저 수행하세요.

2. **Excel 업로드**:
   - 현재 CSV 형식만 지원합니다.
   - .xlsx 파일은 추가 라이브러리 필요 (예: xlsx 라이브러리)

3. **알람 기능**:
   - 실제 이메일 발송을 위해서는 SendGrid 또는 다른 이메일 서비스 설정이 필요합니다.
   - 스케줄 시간은 UTC 기준이므로 한국 시간(UTC+9) 변환 필요

4. **권한 관리**:
   - 확정 출하일은 reviewer 또는 admin만 수정 가능
   - RLS(Row Level Security) 정책이 올바르게 설정되어 있는지 확인하세요.

---

## 🐛 문제 해결

### Excel 업로드가 작동하지 않을 때

- 파일 형식이 CSV인지 확인
- 첫 번째 줄이 헤더(품목코드,품목명,수량)인지 확인
- 인코딩이 UTF-8인지 확인

### 알람이 전송되지 않을 때

1. Supabase Dashboard > Database > Extensions에서 pg_cron이 활성화되어 있는지 확인
2. cron 작업이 올바르게 스케줄되었는지 확인:
   ```sql
   SELECT * FROM cron.job;
   ```
3. Edge Function이 배포되었는지 확인
4. Edge Function 로그 확인

### 권한 오류가 발생할 때

1. RLS 정책 확인:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'requests';
   ```
2. 사용자 역할 확인:
   ```sql
   SELECT * FROM user_profiles WHERE id = 'USER_ID';
   ```

---

## 📞 지원

문제가 발생하거나 추가 기능이 필요한 경우:
- GitHub Issues 생성
- 프로젝트 관리자에게 문의

---

**구현 완료일**: 2026-01-15
**버전**: 2.0.0
