# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PO Tracker(구 Purchase On) — PO(Purchase Order) 변경 요청 접수·검토 및 변경 추적 웹 서비스. 화면 표시명만 PO Tracker이며 레포·Supabase·Vercel 프로젝트명과 localStorage 키(`purchaseOn*`)는 기존 이름을 유지합니다. 고객처(법인·대리점·지사)와 본사 부서가 PO 변경 요청을 등록하고, 유관부서가 검토(가능 여부·확정 출하일/수량)하는 흐름. 요구사항 원문은 `docs/PRD.md`. UI 텍스트, 주석, 커밋 메시지는 모두 한국어.

## Commands

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드 (타입 체크 포함)
npm run lint     # ESLint — 커밋 전 반드시 통과해야 함
```

테스트 프레임워크는 없습니다. 변경 검증은 `npm run lint` + `npm run build` + 실제 앱 실행으로 합니다.

환경 변수: `.env.example`을 `.env.local`로 복사. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(필수), `ADMIN_PAGE_PASSWORD`, `ADMIN_SESSION_SECRET`(서버 전용 — 절대 `NEXT_PUBLIC_` 접두사 금지). 미설정 시 `/api/admin/verify`는 503.

## Stack notes

- **Next.js 16** (App Router) + React 19, TypeScript, Tailwind v4, shadcn/ui(`components/ui/` — 생성된 컴포넌트, 직접 수정은 최소화).
- Next 16이므로 미들웨어는 `middleware.ts`가 아니라 루트 `proxy.ts`(`export const proxy`)이며, 모든 요청에서 `lib/supabase/middleware.ts`의 `updateSession`으로 Supabase 세션 쿠키를 갱신.
- `.cursor/rules/project-rules.mdc`에는 "Next.js 15, 서버 컴포넌트/Server Actions 우선"이라고 되어 있지만, 실제 코드는 **클라이언트 컴포넌트 + 브라우저 Supabase 클라이언트(`lib/supabase/client.ts`)로 직접 쿼리**하는 방식입니다. Server Actions는 사용하지 않으며, 서버 코드는 `app/api/admin/*` 라우트뿐입니다. 기존 패턴을 따르세요.

## Architecture

### 라우팅과 셸
- `app/(shell)/` 하위 페이지(`/` 대시보드, `/request` 요청접수, `/review` 검토대기, `/po-upload` 데이터 업로드, `/po-changes` PO 변경, `/admin-settings`)는 `components/common/AppShell.tsx`로 감싸짐. AppShell이 `useAuth`로 인증 확인(미로그인 시 `/login` 리다이렉트), 헤더·사이드바·알림 팝오버·제품 투어(driver.js, `lib/tours/`)·`RequestConfigProvider`를 제공.
- `app/login`, `app/signup`은 셸 밖.

### 데이터 계층 (Supabase)
- 주요 테이블: `requests`, `user_profiles`, `notifications`, `frozen_date_settings`, `request_type_settings`, `request_reason_settings`.
- 기본 스키마는 `schema.sql`, 이후 변경은 `migrations/*.sql` (수동으로 Supabase SQL Editor에서 실행하는 방식, 마이그레이션 러너 없음). 스키마 변경 시 새 migration 파일을 추가.
- 알림(`notifications`) 생성은 앱 코드가 아니라 **DB 트리거**(`migrations/create_notifications_system.sql`, `add_new_request_notifications.sql`)가 담당. 이메일/리마인더는 `supabase/functions/`의 Edge Functions(`send-email-notification`, `scheduled-reminder`, Deno)이며 `deploy-email-functions.{sh,ps1}`로 배포.
- DB 행 → `PORequest`(`types/request.ts`) 변환은 `lib/request-helpers.ts`의 `transformRequestData`; Supabase 오류는 `asApiError`로 정규화.
- 설정 테이블이 없을 때(`isTableMissingError`)는 `lib/request-constants.ts`의 하드코딩 기본값(`REQUEST_TYPES`, `REQUEST_REASONS`)으로 폴백 — `context/RequestConfigContext.tsx` 참고.

### PO Tracker DO 변경 추적 (`migrations/add_po_tracker_do_tracking.sql`)
- 영업일마다 판매주문조회 → DO등록현황조회 xlsx를 업로드. 브라우저가 엑셀을 파싱하고 비교·저장은 DB 함수(`start_po_upload` → `apply_so_snapshot` / `stage_po_upload_chunk` ×N → `apply_do_snapshot`)가 한 트랜잭션으로 처리. 서버 코드·service role 키 없음.
- 변경 판단 단위는 판매주문 라인(주문번호+라인번호, DO 합산). `do_order_lines`의 확정 상태 대비 순변경만 `do_change_events`에 기록. 판정 규칙은 함수 상단 주석 참고(DO 분할은 변경 아님, 재등록 대기 5영업일 등).
- 고객처·구분(제품/상품/자재/제외)·제외 여부는 이벤트에 저장하지 않고 `v_do_change_events` 뷰에서 조회 시점 설정으로 붙임.
- 판매주문조회 라인번호는 정수로 반올림되어 나오므로 DO↔SO 연결은 주문번호+품목번호로 함.
- 같은 날·같은 고객처·같은 품목의 삭제+추가는 `po_group_split_candidates`가 **분할/합배송 후보**(`do_change_groups`, group_type `split`)로 묶고 담당자가 `review_change_group`으로 승인/반려. **통계는 `v_do_change_events.stat_unit_key`로 distinct 집계**(반려되지 않은 분할 묶음 = 1건), 표시명은 `stat_label`.
- `/po-changes`(PO 변경): 기간별 변경 이벤트·후보 승인/반려·재등록 대기 화면. 데이터는 `lib/po-changes-api.ts`, 필터·통계 집계는 `lib/po-changes-utils.ts`(`countStatUnits`). 업로드 이력의 결과 칸이 `?date=` 로 연결됨.
- **변경 유형은 관리자 설정**(`po_change_type_settings` 이름·순서·사용, `po_change_type_rules` 판정 기준 → 유형). 판정 기준(rule_key)은 뷰가 계산하고(`change_rule`), 화면·통계는 `change_type_code`/`change_type_label` 사용. 연결 없거나 꺼진 유형은 기타(`other`, 삭제 불가). 반려되지 않은 분할/합배송·품목코드 변경 묶음은 각각 1건.
- 품목 구분은 `item_class_overrides`(품목번호 예외)가 카테고리 구분보다 우선. 후보 승인/반려는 메모 필수이며 처리자 이름(`reviewed_by_name`)과 이력(`do_change_group_reviews`)을 DB 함수가 남긴다(다른 사용자 프로필은 RLS로 못 읽으므로 이름을 저장).
- 운영 DB 변경은 기본 파일(`add_po_tracker_do_tracking.sql`)을 고치고, 이미 실행된 DB용 후속 파일(`update_po_tracker_*.sql`)을 따로 만든다.

### 화면 언어 (KOR/ENG)
- 헤더·로그인·회원가입의 `LanguageToggle`로 전환하며, 선택 언어는 localStorage `purchaseOnLanguage`에 저장(`context/LanguageContext.tsx`, `lib/i18n.ts`).
- 화면 문구는 키 없이 **`t('한국어', 'English')`** 로 두 언어를 나란히 적는다. 컴포넌트에서는 `const { t, lang } = useLanguage()`.
- 토스트·throw 오류처럼 렌더링 밖에서 만드는 문구는 `translateNow`(관례상 `tn`으로 import) 사용 — 데이터 조회 콜백의 의존성에 `t`를 넣지 않기 위함.
- lib의 라벨 함수는 `t: Translate`를 인자로 받는다(예: `getStatusLabel(status, t)`, `getDoChangeTypeLabels(t)`). 넘기지 않으면 `koreanOnly`로 한국어.
- **번역하지 않는 것**: DB에 저장되는 값(요청구분·요청사유·우선순위 '긴급/보통', 고객처, 상태 차트 키 '승인/반려/대기'), 엑셀 열 이름, 알림 메일 본문, 개발자용 console 로그.
- 새 화면 문구를 추가할 때도 반드시 `t()`로 영어를 함께 적는다.

### 권한/조회 범위 모델 (여러 파일에 걸친 핵심 규칙)
- `user_profiles.role`은 **콤마로 구분된 다중 역할 문자열**(예: `"reviewer,requester"`, `"admin"`). 항상 split해서 검사.
- 부서명으로 계정 유형 판별: 부서명이 `팀`으로 끝나면 **본사 부서**, 아니면 **고객처 계정**(`lib/request-access-scope.ts`).
- 관리자 = role에 `admin` 포함 **또는** 부서명에 `영업관리` 포함 (`canAccessAdminSettings`, `getDashboardScope` in `lib/dashboard-scope.ts`).
- 목록 조회 필터는 `applyRequestListFilter`(모드: `request-intake` = 본인 부서가 요청한 건 / `review-history` = 관리자 전체, 고객처는 자기 customer + 본사 요청, 본사는 타 본사 부서 요청). 대시보드는 `applyDashboardScope`로 클라이언트 측 필터링.
- 관리자 설정 화면 진입은 Supabase 인증과 별개로 비밀번호 기반 HttpOnly 쿠키(`po_admin_session`, HMAC 서명, 8시간; `lib/admin-session-cookie.ts`)를 `/api/admin/{verify,session,logout}`로 관리.

### 프로즌 데이트
- 출하일 기준 N주 전(옵션: 해당 주 월/금요일로 보정)을 프로즌 데이트로 계산하고, 요청일이 그 이후면 `after`(프로즌 이후 — 경고 대상). 규칙은 요청자 유형(고객처/본사)과 요청구분(자재 추가/삭제 여부)에 따라 `frozen_date_settings`에서 선택. 로직은 `lib/frozen-date.ts`, 조회는 `lib/frozen-date-api.ts` / `hooks/use-frozen-date-settings.ts`.

## 개발 규칙 (`.cursor/rules/project-rules.mdc` 통합)

> 아래는 Cursor 규칙 파일의 내용을 옮긴 것입니다. 규칙 파일의 "Next.js 15 / 서버 컴포넌트·Server Actions 우선" 항목은 현재 코드(Next 16, 클라이언트 컴포넌트 + 브라우저 Supabase 쿼리)와 다르므로, 충돌 시 **기존 코드 패턴을 우선**합니다(위 Stack notes 참고).

### 핵심 원칙: 사용자 경험
- **로딩 상태 UI**: 모든 비동기 작업에 로딩 상태를 시각적으로 표시.
- **빈 상태 UI**: 데이터가 없으면 빈 상태를 명확히 안내.
- **오류 상태 UI**: 오류 시 친절한 안내 메시지 제공.
- **상호작용 지연 최소화**: 낙관적 업데이트, 스켈레톤 UI 등으로 즉각적인 피드백.

### 핵심 원칙: 오류 처리
- 서버 측(API Route 등)에서 발생하는 모든 예외를 포착.
- 클라이언트 컴포넌트는 Error Boundary와 try-catch로 처리.
- 사용자 오류 메시지는 **한글로 친절하게**, `sonner` toast 사용.
- 개발 환경(`process.env.NODE_ENV === 'development'`)에서는 상세 오류 로그를 콘솔에 출력.

오류 처리 패턴 예시:

```typescript
/**
 * PO 변경 요청 제출 핸들러
 */
const handleSubmitRequest = async () => {
  try {
    const { error } = await supabase.from('requests').insert(data);
    if (error) {
      toast.error('요청 생성에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    toast.success('요청이 성공적으로 제출되었습니다.');
  } catch (error) {
    console.error(error);
    toast.error('예기치 않은 오류가 발생했습니다. 관리자에게 문의해주세요.');
  }
};
```

서버 측 처리 결과는 `{ success: true, data }` / `{ success: false, error: '<한글 메시지>' }` 형태로 반환하는 것을 원칙으로 합니다.

### 컴포넌트 작성
- 함수형 컴포넌트 + React Hooks만 사용, 클래스 컴포넌트 금지.
- **화살표 함수**로 선언: `const RequestList = () => { ... };` (`function RequestList()` ❌). 단, Next의 `page.tsx`/`layout.tsx` default export는 기존 코드처럼 function 선언 사용.

### 파일 명명
- 컴포넌트: PascalCase (`RequestForm.tsx`)
- 유틸리티: kebab-case (`date-utils.ts`)
- 훅: `use-` 접두사 + kebab-case (`use-requests.ts`)

### 주석
- 모든 함수/컴포넌트 상단에 **한글 한 문장 개요**, 필요한 경우 JSDoc(`@param`, `@returns`)으로 한글 상세 설명.
- 복잡한 알고리즘·비즈니스 로직에는 한글 설명 주석 추가.

### ESLint
- 모든 린트 규칙 준수, 커밋 전 `npm run lint` 실행 후 오류 해결.
- 자주 위반하는 항목: `any` 타입 사용(→ 명시적 타입 또는 `unknown`), 사용하지 않는 변수, 조건문 안에서 Hook 호출(Hook은 항상 최상위에서 호출).

### 타입
- TypeScript strict, 모든 컴포넌트·함수에 명시적 타입. `any` 금지(불가피하면 `unknown`).
- 객체 형태는 `interface`, 유니온·교차 타입은 `type`.

### 스타일링 / UI
- Tailwind 유틸리티 클래스 우선, 커스텀 클래스 최소화, 반응형은 Tailwind breakpoint 사용.
- shadcn/ui 기존 컴포넌트 재사용 우선, 필요 시 커스터마이징. 접근성(a11y) 고려.
- 브랜드 색상은 Tailwind 임의값으로 직접 사용(예: `#971B2F` 주 색상, `#101820`, `#67767F`, 배경 `#F8F9FA`).

### 코드 구조 / 상태 관리
- 단일 책임 원칙. 재사용 컴포넌트는 `components/`(도메인별 하위 폴더), 페이지 전용 컴포넌트는 해당 페이지 디렉토리에 배치.
- 공통 유틸은 `lib/`, 훅은 `hooks/`, 타입은 `types/`.
- 클라이언트 상태는 `useState`/`useReducer`, 전역 상태는 필요한 경우에만 Context API(예: `RequestConfigContext`). 상태 관리 라이브러리 도입은 신중히.

### 기타 권장 사항
- 성능: 이미지는 `next/image`, 동적 import로 코드 스플리팅, `useMemo`/`useCallback` 적절히 활용.
- 접근성: 시맨틱 HTML, ARIA 속성, 키보드 네비게이션 지원.
- 테스트: 선택사항(현재 테스트 프레임워크 없음).
