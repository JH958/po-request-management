# PRD: PO 변경 요청 관리 시스템
## Product Requirements Document

**문서 버전:** 1.0  
**작성일:** 2026-01-14  
**프로젝트명:** PO Change Request Management System  

---

## 1. 프로젝트 개요

### 1.1 배경
현재 국내외 고객처(법인, 대리점, 지사)로부터 접수되는 PO(Purchase Order)의 변경 요청이 팀즈나 메일을 통해 비체계적으로 관리되고 있습니다. 이로 인해 다음과 같은 문제가 발생하고 있습니다:

- 요청 건의 이력 관리 불가
- 요청 사항이 여러 채널에 산재되어 추적 어려움
- 본사 담당자가 단순 전달자 역할에 그침
- 유관부서 간 협업 프로세스 비효율

### 1.2 목표
PO 변경 요청을 체계적으로 관리할 수 있는 웹 기반 시스템을 구축하여:

- 모든 변경 요청의 중앙 집중식 관리
- 실시간 요청 현황 및 진행 상태 추적
- 유관부서 간 원활한 협업 및 승인 프로세스 자동화
- 데이터 기반 의사결정을 위한 분석 기반 마련

### 1.3 프로젝트 범위
**포함:**
- 사용자 인증 및 권한 관리
- PO 변경 요청 CRUD 기능
- 승인 워크플로우
- 검색/필터/정렬 기능
- 이력 추적

**제외 (향후 확장):**
- ERP 시스템 직접 연동
- 모바일 앱
- 고급 분석 대시보드

---

## 2. 주요 사용자 및 역할

### 2.1 사용자 유형

| 역할 | 설명 | 권한 |
|------|------|------|
| **요청자 (Requester)** | 고객처 담당자 또는 영업 담당자 | 변경 요청 생성, 본인 요청 조회/수정 |
| **검토자 (Reviewer)** | 생산, 품질, 물류 등 유관부서 담당자 | 배정된 요청 검토, 가능여부 판단, 검토의견 작성 |
| **관리자 (Admin)** | 시스템 관리자 | 모든 권한, 사용자 관리, 시스템 설정 |

### 2.2 사용자 스토리

**요청자:**
- 기존 SO 번호를 기반으로 변경 요청을 등록할 수 있다
- 내가 등록한 요청의 진행 상태를 실시간으로 확인할 수 있다
- 검토자의 피드백을 확인하고 필요시 추가 정보를 제공할 수 있다

**검토자:**
- 나에게 배정된 요청을 확인하고 우선순위를 파악할 수 있다
- 요청의 가능 여부를 판단하고 상세한 검토 의견을 작성할 수 있다
- 요청 승인/거절 시 자동으로 요청자에게 알림이 전달된다

**관리자:**
- 모든 요청 건을 조회하고 통계를 확인할 수 있다
- 사용자 계정을 관리하고 권한을 부여할 수 있다

---

## 3. 주요 기능 명세

### 3.1 사용자 인증 (Authentication)

#### 3.1.1 회원가입
- **기능:** 이메일/비밀번호 기반 회원가입
- **기술:** Supabase Auth
- **필수 정보:**
  - 이메일 (Email) - 필수, 유효성 검증
  - 비밀번호 (Password) - 필수, 최소 8자 이상
  - 이름 (Full Name) - 필수
  - 부서 (Department) - 필수
  - 역할 (Role) - 관리자가 지정 (기본값: Requester)
- **프로세스:**
  1. 사용자 정보 입력
  2. 이메일 인증 링크 발송
  3. 이메일 인증 완료 후 로그인 가능

#### 3.1.2 로그인
- **기능:** 이메일/비밀번호로 로그인
- **추가 기능:**
  - "Remember Me" 옵션
  - 비밀번호 재설정 (이메일 링크)
- **보안:**
  - 세션 기반 인증
  - Supabase RLS(Row Level Security) 적용

### 3.2 PO 변경 요청 관리 (CRUD)

#### 3.2.1 요청 생성 (Create)

**화면 구성:**
- 단일 폼 형식
- 섹션별 그룹핑 (기본 정보, 변경 내용, 검토 정보)

**필드 상세:**

| 필드명 | 영문명 | 데이터 타입 | 필수 여부 | 설명 |
|--------|--------|-------------|-----------|------|
| 고객 | customer | TEXT | 필수 | 드롭다운 또는 자동완성 |
| 요청부서 | requesting_dept | TEXT | 필수 | 드롭다운 |
| 요청자 | requester | TEXT | 자동 | 로그인한 사용자명 |
| SO 번호 | so_number | TEXT | 필수 | 기존 SO 참조 |
| 출하일 | factory_shipment_date | DATE | 필수 | 날짜 선택기 |
| 요청일 | request_date | DATE | 자동 | 생성 시점 자동 입력 |
| 리드타임 | leadtime | INTEGER | 선택 | 일 단위 |
| 요청구분 | category_of_request | TEXT | 필수 | 드롭다운 (제품추가/수량변경/날짜변경/취소 등) |
| 품목코드 | erp_code | TEXT | 필수 | 검색 가능 |
| 품목명 | item_name | TEXT | 필수 | ERP 코드 선택 시 자동 입력 |
| 수량 | quantity | INTEGER | 필수 | 양수만 가능 |
| 요청사유 | reason_for_request | TEXT | 필수 | 드롭다운 + 기타 입력 |
| 요청상세 | request_details | TEXT (Long) | 선택 | 텍스트 에리어 |
| 가능여부 | feasibility | TEXT | 자동 | 검토자 입력 (가능/불가능/보류) |
| 검토상세 | review_details | TEXT (Long) | 자동 | 검토자 입력 |
| 검토부서 | reviewing_dept | TEXT | 자동 | 관리자 또는 자동 배정 |
| 검토자 | reviewer | TEXT | 자동 | 검토부서 담당자 |
| 완료여부 | completed | BOOLEAN | 자동 | 기본값 false |

**비즈니스 로직:**
- 동일한 SO 번호에 대한 중복 요청 확인 경고
- 출하일이 과거인 경우 경고 메시지
- 리드타임 자동 계산 (출하일 - 요청일)

**유효성 검증:**
- 필수 필드 누락 체크
- 날짜 형식 검증
- 수량 양수 검증
- SO 번호 형식 검증

#### 3.2.2 요청 조회 (Read)

**메인 목록 화면:**
- 테이블 형식으로 요청 목록 표시
- 페이지네이션 (기본 20건씩)
- 실시간 상태 업데이트 (Supabase Realtime)

**표시 컬럼 (기본):**
- 요청일
- SO 번호
- 고객
- 요청구분
- 품목명
- 수량
- 가능여부
- 완료여부
- 액션 버튼 (상세보기/수정/삭제)

**상세보기 화면:**
- 모든 필드 정보 표시
- 이력 타임라인 (생성, 수정, 검토, 완료 시점)
- 첨부파일 (향후 확장)

#### 3.2.3 요청 수정 (Update)

**권한별 수정 가능 필드:**

| 역할 | 수정 가능 필드 |
|------|----------------|
| 요청자 | 검토 완료 전까지 모든 요청 정보 수정 가능 |
| 검토자 | 가능여부, 검토상세, 검토부서, 검토자 |
| 관리자 | 모든 필드 |

**수정 로직:**
- 완료된 요청은 수정 불가 (관리자 제외)
- 수정 시 이력 자동 기록
- 수정 사항 변경 시 관련자에게 알림

#### 3.2.4 요청 삭제 (Delete)

**삭제 권한:**
- 요청자: 검토 시작 전까지만 삭제 가능
- 관리자: 모든 요청 삭제 가능

**삭제 로직:**
- Soft Delete (실제 삭제 대신 deleted 플래그 설정)
- 삭제 확인 모달 표시
- 삭제 시 이력 기록 유지

### 3.3 검색/필터/정렬 기능

#### 3.3.1 검색 (Search)
- **전체 검색:** 모든 텍스트 필드에서 키워드 검색
- **필드별 검색:** 특정 필드에 대한 정확한 검색
- **실시간 검색:** 타이핑 중 결과 즉시 표시 (디바운싱 적용)

#### 3.3.2 필터링 (Filter)

**필터 가능 필드:**
- 고객 (다중 선택)
- 요청부서 (다중 선택)
- 요청구분 (다중 선택)
- 가능여부 (가능/불가능/보류/미검토)
- 완료여부 (완료/미완료)
- 날짜 범위 (요청일, 출하일)

**필터 UI:**
- 사이드바 또는 상단 필터 패널
- 선택된 필터 태그로 표시
- "필터 초기화" 버튼

#### 3.3.3 정렬 (Sort)

**정렬 가능 필드:**
- 요청일
- 출하일
- 리드타임
- SO 번호
- 고객
- 완료여부

**정렬 옵션:**
- 오름차순 (ASC)
- 내림차순 (DESC)
- 기본 정렬: 요청일 내림차순

### 3.4 승인 워크플로우

#### 3.4.1 워크플로우 단계

```
[요청 생성] → [검토 대기] → [검토 중] → [승인/거절] → [완료]
```

**상태 값 (Status):**
- `pending`: 검토 대기
- `in_review`: 검토 중
- `approved`: 승인
- `rejected`: 거절
- `completed`: 완료

#### 3.4.2 알림 기능
- 요청 생성 시: 검토 담당자에게 알림
- 검토 완료 시: 요청자에게 알림
- 추가 정보 요청 시: 요청자에게 알림
- (구현: 이메일 또는 시스템 내 알림)

---

## 4. 화면 구성 및 UI/UX

### 4.1 화면 구조

```
/
├── /auth
│   ├── /login          # 로그인
│   └── /signup         # 회원가입
├── /dashboard          # 메인 대시보드
├── /requests
│   ├── /                # 요청 목록
│   ├── /new            # 새 요청 작성
│   ├── /[id]           # 요청 상세
│   └── /[id]/edit      # 요청 수정
└── /profile            # 사용자 프로필
```

### 4.2 주요 화면별 상세 설계

#### 4.2.1 로그인/회원가입 화면

**레이아웃:**
- 중앙 정렬 카드 형식
- 좌측: 브랜딩 영역 (로고, 슬로건)
- 우측: 로그인 폼

**컴포넌트:**
- Email Input (검증 포함)
- Password Input (표시/숨김 토글)
- Remember Me 체크박스
- 로그인 버튼
- 회원가입 링크
- 비밀번호 찾기 링크

#### 4.2.2 메인 대시보드

**레이아웃:**
- 상단: 네비게이션 바 (로고, 메뉴, 사용자 정보)
- 좌측: 사이드바 (주요 메뉴)
- 중앙: 주요 컨텐츠 영역
- 우측: 필터/알림 패널 (선택적)

**대시보드 위젯:**
- 내 요청 건 요약 (전체/대기/완료)
- 최근 요청 목록 (최근 5건)
- 긴급 요청 (리드타임 짧은 순)
- 빠른 액션 버튼 (새 요청 작성)

#### 4.2.3 요청 목록 화면

**주요 영역:**
1. **상단 액션 바:**
   - 새 요청 작성 버튼
   - 검색 바
   - 필터 버튼
   - Export 버튼 (CSV/Excel)

2. **필터 패널:**
   - 접기/펼치기 가능
   - 필드별 필터 옵션
   - 적용된 필터 태그
   - 필터 초기화 버튼

3. **데이터 테이블:**
   - 체크박스 (다중 선택)
   - 정렬 가능한 컬럼 헤더
   - 인라인 액션 버튼
   - 페이지네이션

**테이블 기능:**
- 컬럼 정렬 (클릭)
- 컬럼 보기/숨기기 설정
- 행 클릭 시 상세 페이지로 이동
- 상태 뱃지 (색상 구분)

#### 4.2.4 요청 작성/수정 화면

**폼 레이아웃:**
- 스텝 형식 또는 단일 페이지 스크롤
- 섹션별 구분 (카드 형식)

**섹션 구성:**
1. **기본 정보:**
   - 고객, 요청부서, SO 번호
   - 출하일, 리드타임

2. **변경 요청 내용:**
   - 요청구분
   - 품목코드, 품목명
   - 수량
   - 요청사유, 요청상세

3. **검토 정보** (검토자만 입력):
   - 가능여부
   - 검토상세
   - 검토부서, 검토자

**UX 고려사항:**
- 실시간 입력 검증
- 에러 메시지 인라인 표시
- 저장 전 확인 모달
- 임시 저장 기능 (Draft)

#### 4.2.5 요청 상세 화면

**레이아웃:**
- 상단: 요청 요약 (SO 번호, 상태, 요청일)
- 중앙: 요청 정보 (섹션별 구분)
- 우측: 액션 패널 (수정/삭제/검토)

**추가 기능:**
- 이력 타임라인 (Activity Log)
- 댓글 기능 (향후 확장)
- 첨부파일 (향후 확장)
- 인쇄/PDF 내보내기

### 4.3 디자인 시스템

#### 4.3.1 컬러 팔레트
- **Primary:** 기업 메인 컬러 (예: Blue #3B82F6)
- **Secondary:** 보조 컬러 (예: Gray #6B7280)
- **Success:** 승인/완료 (Green #10B981)
- **Warning:** 대기/보류 (Yellow #F59E0B)
- **Danger:** 거절/삭제 (Red #EF4444)

#### 4.3.2 타이포그래피
- **Font Family:** Inter, Pretendard (한글)
- **Headings:** 
  - H1: 2rem (32px), Bold
  - H2: 1.5rem (24px), SemiBold
  - H3: 1.25rem (20px), SemiBold
- **Body:** 1rem (16px), Regular

#### 4.3.3 컴포넌트 (Shadcn/ui 활용)
- Button (Primary, Secondary, Ghost)
- Input, Textarea, Select
- Table, Pagination
- Card, Badge, Alert
- Dialog (Modal), Toast
- DatePicker, Combobox

---

## 5. 기술 스택

### 5.1 프론트엔드

| 기술 | 버전 | 용도 |
|------|------|------|
| **Next.js** | 14+ (App Router) | React 프레임워크, SSR/SSG |
| **TypeScript** | 5+ | 타입 안정성 |
| **Tailwind CSS** | 3+ | 유틸리티 기반 스타일링 |
| **Shadcn/ui** | Latest | UI 컴포넌트 라이브러리 |
| **React Hook Form** | 7+ | 폼 관리 |
| **Zod** | 3+ | 스키마 검증 |
| **Tanstack Query** | 5+ | 서버 상태 관리 |
| **Zustand** | 4+ | 클라이언트 상태 관리 (선택적) |

### 5.2 백엔드

| 기술 | 용도 |
|------|------|
| **Supabase** | BaaS (Backend as a Service) |
| - Database | PostgreSQL 기반 |
| - Auth | 사용자 인증 |
| - Storage | 파일 저장소 (향후) |
| - Realtime | 실시간 업데이트 |
| - Edge Functions | 서버리스 함수 (필요시) |

### 5.3 개발 도구

- **Version Control:** Git, GitHub
- **Package Manager:** npm 또는 pnpm
- **Code Formatter:** Prettier
- **Linter:** ESLint
- **Testing:** Vitest, React Testing Library (선택적)

---

## 6. 데이터베이스 설계

### 6.1 테이블 스키마

#### 6.1.1 users (Supabase Auth 확장)

```sql
-- Supabase Auth의 auth.users 테이블 확장
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'requester' CHECK (role IN ('requester', 'reviewer', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);
```

#### 6.1.2 requests (PO 변경 요청)

```sql
CREATE TABLE public.requests (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 기본 정보
  customer TEXT NOT NULL,
  requesting_dept TEXT NOT NULL,
  requester_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL, -- 비정규화 (성능 및 이력 유지)
  
  -- SO 정보
  so_number TEXT NOT NULL,
  factory_shipment_date DATE NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  leadtime INTEGER GENERATED ALWAYS AS (
    EXTRACT(DAY FROM (factory_shipment_date - request_date))
  ) STORED,
  
  -- 요청 내용
  category_of_request TEXT NOT NULL,
  erp_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason_for_request TEXT NOT NULL,
  request_details TEXT,
  
  -- 검토 정보
  feasibility TEXT CHECK (feasibility IN ('approved', 'rejected', 'pending', NULL)),
  review_details TEXT,
  reviewing_dept TEXT,
  reviewer_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'approved', 'rejected', 'completed')
  ),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- 메타데이터
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  
  -- 인덱스
  CONSTRAINT valid_leadtime CHECK (leadtime IS NOT NULL)
);

-- 인덱스 생성
CREATE INDEX idx_requests_so_number ON requests(so_number);
CREATE INDEX idx_requests_requester_id ON requests(requester_id);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX idx_requests_deleted_at ON requests(deleted_at) WHERE deleted_at IS NULL;

-- RLS 정책
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- 요청자: 본인이 작성한 요청만 조회 가능
CREATE POLICY "Requesters can view their own requests"
  ON requests FOR SELECT
  USING (
    requester_id = auth.uid() 
    AND deleted_at IS NULL
  );

-- 검토자: 모든 요청 조회 가능
CREATE POLICY "Reviewers can view all requests"
  ON requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('reviewer', 'admin')
    )
    AND deleted_at IS NULL
  );

-- 요청자: 본인 요청 생성
CREATE POLICY "Requesters can create requests"
  ON requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- 요청자: 본인 요청 수정 (검토 전)
CREATE POLICY "Requesters can update their own pending requests"
  ON requests FOR UPDATE
  USING (
    requester_id = auth.uid() 
    AND status = 'pending'
    AND deleted_at IS NULL
  );

-- 검토자: 검토 정보 업데이트
CREATE POLICY "Reviewers can update review fields"
  ON requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('reviewer', 'admin')
    )
    AND deleted_at IS NULL
  );

-- 요청자: 본인 요청 삭제 (검토 전)
CREATE POLICY "Requesters can delete their own pending requests"
  ON requests FOR DELETE
  USING (
    requester_id = auth.uid() 
    AND status = 'pending'
  );
```

#### 6.1.3 request_history (요청 이력)

```sql
CREATE TABLE public.request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL, -- 'created', 'updated', 'reviewed', 'completed', 'deleted'
  changes JSONB, -- 변경 내용 저장
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_request_history_request_id ON request_history(request_id);
CREATE INDEX idx_request_history_created_at ON request_history(created_at DESC);

-- RLS 정책
ALTER TABLE request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of accessible requests"
  ON request_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id 
      AND (r.requester_id = auth.uid() OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role IN ('reviewer', 'admin')
      ))
    )
  );
```

### 6.2 관계도 (ERD)

```
user_profiles (Supabase Auth 확장)
├─ id (PK)
├─ full_name
├─ department
├─ role
└─ timestamps

requests (PO 변경 요청)
├─ id (PK)
├─ requester_id (FK → user_profiles)
├─ reviewer_id (FK → user_profiles)
├─ [기본 정보 필드들]
├─ [요청 내용 필드들]
├─ [검토 정보 필드들]
└─ timestamps

request_history (요청 이력)
├─ id (PK)
├─ request_id (FK → requests)
├─ user_id (FK → user_profiles)
└─ [이력 정보]
```

### 6.3 데이터베이스 함수 및 트리거

#### 6.3.1 Updated_at 자동 업데이트

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

#### 6.3.2 이력 자동 기록

```sql
CREATE OR REPLACE FUNCTION log_request_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
  v_action TEXT;
  v_changes JSONB;
BEGIN
  -- 사용자 이름 조회
  SELECT full_name INTO v_user_name
  FROM user_profiles
  WHERE id = auth.uid();

  -- 액션 결정
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_changes := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_changes := to_jsonb(OLD);
  END IF;

  -- 이력 기록
  INSERT INTO request_history (request_id, user_id, user_name, action, changes)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    COALESCE(v_user_name, 'System'),
    v_action,
    v_changes
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_request_insert
  AFTER INSERT ON requests
  FOR EACH ROW
  EXECUTE FUNCTION log_request_changes();

CREATE TRIGGER log_request_update
  AFTER UPDATE ON requests
  FOR EACH ROW
  EXECUTE FUNCTION log_request_changes();

CREATE TRIGGER log_request_delete
  AFTER DELETE ON requests
  FOR EACH ROW
  EXECUTE FUNCTION log_request_changes();
```

---

## 7. API 설계

### 7.1 Supabase 클라이언트 활용

Next.js에서 Supabase JavaScript 클라이언트를 활용하여 API 호출을 수행합니다.

#### 7.1.1 클라이언트 초기화

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 7.2 주요 API 작업

#### 7.2.1 인증 (Auth)

```typescript
// 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      full_name: 'John Doe',
      department: 'Sales',
      role: 'requester'
    }
  }
})

// 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// 로그아웃
const { error } = await supabase.auth.signOut()

// 세션 확인
const { data: { session } } = await supabase.auth.getSession()
```

#### 7.2.2 요청 관리 (Requests)

```typescript
// 요청 목록 조회 (필터, 정렬, 페이지네이션)
const { data, error, count } = await supabase
  .from('requests')
  .select('*', { count: 'exact' })
  .eq('status', 'pending') // 필터
  .order('created_at', { ascending: false }) // 정렬
  .range(0, 19) // 페이지네이션 (0-19: 첫 20건)

// 요청 생성
const { data, error } = await supabase
  .from('requests')
  .insert({
    customer: 'ABC Corp',
    requesting_dept: 'Sales',
    so_number: 'SO-2026-001',
    factory_shipment_date: '2026-02-15',
    category_of_request: '제품추가',
    erp_code: 'PROD-001',
    item_name: 'Product A',
    quantity: 10,
    reason_for_request: '긴급 주문',
    request_details: '상세 설명...'
  })
  .select()

// 요청 상세 조회
const { data, error } = await supabase
  .from('requests')
  .select(`
    *,
    requester:user_profiles!requester_id (full_name, department),
    reviewer:user_profiles!reviewer_id (full_name, department)
  `)
  .eq('id', requestId)
  .single()

// 요청 수정
const { data, error } = await supabase
  .from('requests')
  .update({
    quantity: 15,
    request_details: '수량 변경'
  })
  .eq('id', requestId)
  .select()

// 요청 삭제 (Soft Delete)
const { data, error } = await supabase
  .from('requests')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', requestId)

// 검색
const { data, error } = await supabase
  .from('requests')
  .select('*')
  .or(`customer.ilike.%${searchTerm}%,so_number.ilike.%${searchTerm}%,item_name.ilike.%${searchTerm}%`)

// 실시간 구독
const channel = supabase
  .channel('requests-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'requests'
    },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()
```

#### 7.2.3 이력 조회

```typescript
const { data, error } = await supabase
  .from('request_history')
  .select(`
    *,
    user:user_profiles (full_name)
  `)
  .eq('request_id', requestId)
  .order('created_at', { ascending: false })
```

### 7.3 에러 처리

```typescript
// 공통 에러 처리 유틸리티
export function handleSupabaseError(error: any) {
  if (error?.code === 'PGRST301') {
    return { message: '권한이 없습니다.', type: 'permission' }
  }
  if (error?.code === '23505') {
    return { message: '중복된 데이터입니다.', type: 'duplicate' }
  }
  return { message: error?.message || '알 수 없는 오류가 발생했습니다.', type: 'unknown' }
}
```

---

## 8. 보안 및 권한 관리

### 8.1 Row Level Security (RLS)

Supabase의 RLS를 활용하여 데이터 접근 권한을 데이터베이스 레벨에서 제어합니다. (6.1 참조)

### 8.2 클라이언트 사이드 권한 체크

```typescript
// hooks/useAuth.ts
export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    // 세션 체크
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // 프로필 조회
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return {
    user,
    profile,
    isRequester: profile?.role === 'requester',
    isReviewer: profile?.role === 'reviewer',
    isAdmin: profile?.role === 'admin'
  }
}
```

### 8.3 보안 Best Practices

1. **환경 변수 관리:**
   - `.env.local`에 민감한 정보 저장
   - Git에 커밋하지 않음 (`.gitignore`)
   - Public/Private Key 구분

2. **SQL Injection 방지:**
   - Supabase 클라이언트의 파라미터화된 쿼리 사용
   - 사용자 입력 검증

3. **XSS 방지:**
   - React의 기본 escaping 활용
   - `dangerouslySetInnerHTML` 사용 지양

4. **CSRF 방지:**
   - Supabase의 토큰 기반 인증 활용

---

## 9. 개발 단계 및 우선순위

### 9.1 Phase 1: MVP (4-6주)

**목표:** 핵심 기능 구현 및 내부 테스트

**주요 기능:**
- [ ] 프로젝트 초기 설정 (Next.js, Supabase, Tailwind)
- [ ] 데이터베이스 스키마 생성 및 RLS 설정
- [ ] 사용자 인증 (로그인, 회원가입, 로그아웃)
- [ ] 요청 CRUD 기능 (생성, 조회, 수정, 삭제)
- [ ] 기본 검색/필터/정렬 기능
- [ ] 요청 목록 및 상세 화면
- [ ] 기본 승인 워크플로우 (가능여부 체크)

**마일스톤:**
- Week 1-2: 프로젝트 설정, 인증, 데이터베이스
- Week 3-4: 요청 CRUD, 기본 UI
- Week 5-6: 검색/필터, 워크플로우, 내부 테스트

### 9.2 Phase 2: 고도화 (3-4주)

**목표:** 사용자 경험 개선 및 추가 기능

**주요 기능:**
- [ ] 고급 검색 및 필터링 (다중 필터, 날짜 범위)
- [ ] 이력 추적 시스템 (타임라인 UI)
- [ ] 실시간 알림 (Supabase Realtime)
- [ ] 대시보드 위젯 (통계, 차트)
- [ ] Export 기능 (CSV, Excel)
- [ ] 모바일 반응형 최적화
- [ ] 성능 최적화 (인덱싱, 캐싱)

**마일스톤:**
- Week 1-2: 고급 검색, 이력 시스템
- Week 3-4: 대시보드, Export, 최적화

### 9.3 Phase 3: 확장 기능 (선택적)

**목표:** 비즈니스 인텔리전스 및 통합

**주요 기능:**
- [ ] 고급 분석 대시보드
  - 고객별 요청 건수 집계
  - 요청 사유 분석 (차트, 그래프)
  - 리드타임 분석
  - 승인율 통계
- [ ] 첨부파일 지원 (Supabase Storage)
- [ ] 댓글 및 협업 기능
- [ ] 이메일 알림 (Edge Functions)
- [ ] 모바일 앱 (React Native, 선택적)
- [ ] ERP 연동 검토

---

## 10. 테스트 계획

### 10.1 테스트 유형

**단위 테스트:**
- 유틸리티 함수
- 비즈니스 로직

**통합 테스트:**
- API 연동
- 데이터베이스 작업

**E2E 테스트:**
- 주요 사용자 플로우
- 회원가입 → 요청 생성 → 승인

### 10.2 테스트 도구

- **Vitest:** 단위/통합 테스트
- **React Testing Library:** 컴포넌트 테스트
- **Playwright:** E2E 테스트 (선택적)

### 10.3 테스트 시나리오 (예시)

1. **사용자 인증:**
   - 회원가입 성공/실패 케이스
   - 로그인 성공/실패 케이스
   - 세션 유지 확인

2. **요청 관리:**
   - 요청 생성 (유효한 데이터)
   - 요청 생성 실패 (필수 필드 누락)
   - 요청 수정 권한 체크
   - 요청 삭제 권한 체크

3. **검색/필터:**
   - 키워드 검색 정확도
   - 다중 필터 조합
   - 정렬 결과 확인

---

## 11. 배포 및 운영

### 11.1 배포 환경

**프론트엔드:**
- **플랫폼:** Vercel (권장) 또는 Netlify
- **도메인:** 커스텀 도메인 설정

**백엔드:**
- **플랫폼:** Supabase (관리형 서비스)
- **환경:** Production, Staging (선택적)

### 11.2 환경 변수 설정

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (서버용)
```

### 11.3 CI/CD 파이프라인

**GitHub Actions 예시:**
```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

### 11.4 모니터링

- **에러 추적:** Sentry (선택적)
- **분석:** Vercel Analytics
- **로그:** Supabase Logs

---

## 12. 향후 확장 계획

### 12.1 단기 (3-6개월)

1. **고급 분석 기능:**
   - 고객별 요청 건수 대시보드
   - 요청 사유 Top 10 차트
   - 월별/분기별 트렌드 분석
   - 리드타임 분포 히스토그램

2. **협업 기능:**
   - 댓글 시스템
   - 멘션 기능
   - 첨부파일 지원

3. **알림 고도화:**
   - 이메일 알림 (자동 발송)
   - 슬랙 연동 (선택적)
   - 브라우저 푸시 알림

### 12.2 중장기 (6-12개월)

1. **ERP 연동:**
   - SO 번호 실시간 조회
   - 품목 정보 자동 불러오기
   - 재고 확인 기능

2. **모바일 앱:**
   - React Native 기반
   - 주요 기능 모바일 최적화

3. **AI/ML 기능:**
   - 요청 사유 자동 분류
   - 승인 가능성 예측
   - 이상 패턴 감지

4. **다국어 지원:**
   - 한국어, 영어, 일본어

---

## 13. 성공 지표 (KPI)

### 13.1 비즈니스 지표

- **요청 처리 시간 단축:** 기존 대비 50% 감소 목표
- **요청 추적 성공률:** 100% (모든 요청 이력 관리)
- **사용자 만족도:** NPS 70 이상

### 13.2 기술 지표

- **페이지 로딩 시간:** 3초 이내
- **API 응답 시간:** 500ms 이내
- **시스템 가용성:** 99.5% 이상
- **에러율:** 1% 미만

### 13.3 사용자 지표

- **일간 활성 사용자 (DAU):** 초기 목표 20명
- **월간 활성 사용자 (MAU):** 초기 목표 50명
- **평균 세션 시간:** 5분 이상

---

## 14. 리스크 및 완화 전략

### 14.1 기술 리스크

| 리스크 | 영향도 | 가능성 | 완화 전략 |
|--------|--------|--------|-----------|
| Supabase 서비스 장애 | 높음 | 낮음 | 백업 계획, 다운타임 알림 |
| 데이터베이스 성능 저하 | 중간 | 중간 | 인덱싱, 쿼리 최적화, 캐싱 |
| 보안 취약점 | 높음 | 낮음 | RLS 강화, 정기 보안 감사 |

### 14.2 비즈니스 리스크

| 리스크 | 영향도 | 가능성 | 완화 전략 |
|--------|--------|--------|-----------|
| 사용자 저항 (기존 프로세스 고수) | 중간 | 중간 | 교육, 점진적 도입, 피드백 수렴 |
| 요구사항 변경 | 중간 | 높음 | Agile 방법론, 빠른 이터레이션 |
| 리소스 부족 | 높음 | 중간 | 우선순위 명확화, MVP 접근 |

---

## 15. 부록

### 15.1 용어 정의

- **PO (Purchase Order):** 구매 주문서
- **SO (Sales Order):** 판매 주문서
- **ERP:** Enterprise Resource Planning (전사적 자원 관리)
- **CRUD:** Create, Read, Update, Delete
- **RLS:** Row Level Security (행 수준 보안)
- **BaaS:** Backend as a Service

### 15.2 참고 자료

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### 15.3 문의 및 피드백

프로젝트 관련 문의나 피드백은 다음 채널을 통해 제공해주세요:
- **이메일:** [프로젝트 담당자 이메일]
- **슬랙:** [프로젝트 채널]
- **GitHub Issues:** [레포지토리 링크]

---

**문서 이력**

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2026-01-14 | Jihee Lee | 초안 작성 |

---

**승인**

| 역할 | 이름 | 서명 | 날짜 |
|------|------|------|------|
| 프로젝트 오너 | | | |
| 기술 리드 | | | |
| 이해관계자 | | | |
