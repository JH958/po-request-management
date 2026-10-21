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
- 주요 테이블: `requests`, `user_profiles`, `notifications`, `frozen_date_settings`, `request_reason_settings`(관리자 설정 'PO 변경 사유'). 요청구분은 PO 변경 유형(`po_change_type_settings`)과 통합되어 `request_type_settings`는 더 이상 쓰지 않음.
- 기본 스키마는 `schema.sql`, 이후 변경은 `migrations/*.sql` (수동으로 Supabase SQL Editor에서 실행하는 방식, 마이그레이션 러너 없음). 스키마 변경 시 새 migration 파일을 추가.
- 알림(`notifications`) 생성은 앱 코드가 아니라 **DB 트리거**(`migrations/create_notifications_system.sql`, `add_new_request_notifications.sql`)가 담당. 이메일/리마인더는 `supabase/functions/`의 Edge Functions(`send-email-notification`, `scheduled-reminder`, Deno)이며 `deploy-email-functions.{sh,ps1}`로 배포.
- DB 행 → `PORequest`(`types/request.ts`) 변환은 `lib/request-helpers.ts`의 `transformRequestData`; Supabase 오류는 `asApiError`로 정규화.
- 요청접수 카드(요청구분)는 사용 중인 PO 변경 유형(code = 카드 value, label = 요청에 저장되는 `category_of_request`, description = 툴팁). 조회 실패 시 `lib/request-constants.ts`의 기본값(`REQUEST_TYPES`, `REQUEST_REASONS`)으로 폴백 — `context/RequestConfigContext.tsx` 참고. 프로즌·추가 판정은 code(`product_add`/`material_add`/`material_delete`)로 한다.

### PO Tracker DO 변경 추적 (`migrations/add_po_tracker_do_tracking.sql`)
- 영업일마다 판매주문조회 → DO등록현황조회 xlsx를 업로드. 브라우저가 엑셀을 파싱하고 비교·저장은 DB 함수(`start_po_upload` → `apply_so_snapshot` / `stage_po_upload_chunk` ×N → `apply_do_snapshot`)가 한 트랜잭션으로 처리. 서버 코드·service role 키 없음.
- 변경 판단 단위는 판매주문 라인(주문번호+라인번호, DO 합산). `do_order_lines`의 확정 상태 대비 순변경만 `do_change_events`에 기록. 판정 규칙은 함수 상단 주석 참고(DO 분할은 변경 아님, 재등록 대기 5영업일 등).
- 고객처·구분(제품/상품/자재/제외)·제외 여부는 이벤트에 저장하지 않고 `v_do_change_events` 뷰에서 조회 시점 설정으로 붙임.
- 판매주문조회 라인번호는 정수로 반올림되어 나오므로 DO↔SO 연결은 주문번호+품목번호로 함.
- 같은 날·같은 고객처·같은 품목의 삭제+추가는 `po_group_split_candidates`가 **분할/합배송 후보**(`do_change_groups`, group_type `split`)로 묶고 담당자가 `review_change_group`으로 승인/반려. **통계는 `v_do_change_events.stat_unit_key`로 distinct 집계**(반려되지 않은 분할 묶음 = 1건), 표시명은 `stat_label`.
- `/po-changes`(PO 변경): 기간별 변경 이벤트·후보 승인/반려·재등록 대기 화면. 데이터는 `lib/po-changes-api.ts`, 필터·통계 집계는 `lib/po-changes-utils.ts`(`countStatUnits`). 업로드 이력의 결과 칸이 `?date=` 로 연결됨.
- **변경 유형은 관리자 설정**(`po_change_type_settings` 이름·순서·사용, `po_change_type_rules` 판정 기준 → 유형). 판정 기준(rule_key)은 뷰가 계산하고(`change_rule`), 화면·통계는 `change_type_code`/`change_type_label` 사용. 연결 없거나 꺼진 유형은 기타(`other`, 삭제 불가). 반려되지 않은 분할/합배송·품목코드 변경 묶음은 각각 1건.
- 판정 보완(2026-10-15): 같은 주문·같은 품목의 삭제+추가는 `po_net_same_item_changes`가 차이만 남기고(같으면 변경 아님, 옮긴 수량의 일정·운송방법 변화는 따로 기록), 주문을 공유하는 분할 후보는 `po_merge_split_groups`가 한 묶음으로 합침. 같은 날·같은 주문·같은 DO의 같은 일정·운송방법 변경은 `stat_unit_key`가 1건으로 묶음. 화면은 `groupByStatUnit`으로 통계 단위별 행을 보여줌.
- 판정 보완 2차(2026-10-21): 납품 모드는 값 → 다른 값일 때만 변경(빈칸 → 값 입력 제외, 코르트 공장 물량이 운송방법을 비워 둠), 이번 업로드에서 출하 완료(미종료 → 종료)되는 라인의 **요청 배송일** 갱신은 기록하지 않음(운송방법 실제 변경은 기록), 같은 날 한 주문의 라인이 모두 삭제되면 `order:` 키로 1건. 실제 변경이 아닌 오입력 정정은 영업관리팀이 "변경 아님(정정)"으로 처리(`po_change_dismissals`, `dismiss_changes`/`restore_changes`, 메모 필수) — 변경 건수·통계·사유 입력·대시보드에서 빠짐.
- 고객처 담당자: `customer_managers`(계정 번호 → 영업관리팀 담당자·메일, 관리자 설정 '고객처 담당자'). 담당자 메일 = 로그인 메일이라 PO 변경 페이지 "내 담당 고객처만" 필터에 씀. 미지정 고객처는 `v_customers_without_manager`. 판매주문조회의 담당자·코스트센터 열은 영업관리팀 담당과 달라 쓰지 않음.
- 변경 사유(2026-10-19): 모든 변경(통계 단위)에 영업관리팀이 사유(`request_reason_settings` 값)·상세 메모(필수)·요청 출처(고객처/본사·국내법인)를 `set_change_reasons`로 입력, 잘못 넣으면 `clear_change_reasons`로 지움(이력 source `cleared`)(`po_change_reasons`, 이력 `po_change_reason_history`). 후보 묶음은 `review_change_group`의 사유 인자로 승인·반려와 함께 저장하고, 반려되면 각 라인이 묶음 사유를 물려받음(뷰가 `group:` 키로 대체 조회). 요청 부서는 `po_request_origins`(분류 '회사구분_기능', 기능 '생산' = 생산부 필터 `function_group`), 관리자 설정 '요청 부서'. 화면은 `ReasonDialog`(여러 건 선택)·`ReasonOriginFields`.
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
- 계정 유형 판별(2026-10-20~): 부서명이 **요청 부서 목록**(`po_request_origins.department`)에 있으면 **본사/국내법인 부서**, **고객처 계정 목록**(`po_customer_accounts`)에 있으면 **고객처 계정**. 화면은 `lib/account-directory.ts`(`isInternalDepartment`, `getCustomerAccounts` — `RequestConfigContext`가 채움, 못 읽으면 예전 '팀' 규칙)로, DB는 `user_profiles.origin_code`(부서 저장 시 트리거 `po_profile_guard`가 연결)로 판단. 관리자가 아니면 본인 역할·부서를 바꿀 수 없고, 회원가입은 항상 requester.
- **관리자** = role에 `admin`(우선 jhee105@inbody.com만): 데이터 업로드, 관리자 설정 전체, 조회 권한 부여 — 화면 `canAccessAdminSettings`, DB `is_po_tracker_admin()`.
- **영업관리팀** = 부서에 `영업관리` 또는 관리자: PO 변경 페이지, 후보 승인/반려, 사유 입력, 전체 조회 — 화면 `isSalesTeam`, DB `po_is_sales_team()`. `getDashboardScope`의 전체 범위도 영업관리팀.
- **PO 현황 조회 범위(C-2)**: 업로드·변경 원본 테이블(`do_change_events`, `v_do_change_events`, 사유, 고객처 담당자 등)은 RLS로 영업관리팀·관리자만 조회. 다른 사용자는 `po_dashboard_changes` / `po_dashboard_requests`(SECURITY DEFINER, `po_my_view_scope` 적용)로만 범위 안의 집계용 행을 받음 — 고객처 계정 = 자기 고객처, 본사/국내법인 부서 = 요청 출처·요청 부서가 자기 부서 + 추가 조회 권한(`po_view_grants`, 부서 단위, 관리자 설정 '조회 권한')으로 열린 고객처.
- 목록 조회 필터는 `applyRequestListFilter`(모드: `request-intake` = 본인 부서가 요청한 건 / `review-history` = 관리자 전체, 고객처는 자기 customer + 본사 요청, 본사는 타 본사 부서 요청). 대시보드는 `applyDashboardScope`로 클라이언트 측 필터링.
- 관리자 설정 화면 진입은 Supabase 인증과 별개로 비밀번호 기반 HttpOnly 쿠키(`po_admin_session`, HMAC 서명, 8시간; `lib/admin-session-cookie.ts`)를 `/api/admin/{verify,session,logout}`로 관리.

### 프로즌 데이트
- 출하일 기준 N주 전(옵션: 해당 주 월/금요일로 보정)을 프로즌 데이트로 계산하고, 요청일이 그 이후면 `after`(프로즌 이후 — 경고 대상). 규칙은 요청자 유형(고객처/본사)과 요청구분(자재 추가/삭제 여부)에 따라 `frozen_date_settings`에서 선택. 로직은 `lib/frozen-date.ts`, 조회는 `lib/frozen-date-api.ts` / `hooks/use-frozen-date-settings.ts`.

## 진행 상황과 다음 할 일 (2026-10-20 기준)

PO Tracker 전환은 4단계로 진행 중: 1) 표시명 변경 2) DO 업로드·비교 3) 요청↔DO 매칭·미등록 변경 큐 4) 원요청 수신일·프로즌 판정 기준·AI 분류·통계. 2단계를 다듬는 보완 작업 A·B·C를 3단계보다 먼저 진행하고 있다.

**완료**
- 1·2단계: 표시명 PO Tracker, 판매주문조회·DO등록현황조회 업로드와 DO 변경 이벤트, 분할/합배송·품목코드 변경 후보 승인/반려, PO 변경 페이지(`/po-changes`), 디자인 개편·KOR/ENG
- 관리자 설정 탭: 프로즌 데이트, PO 변경 유형(요청접수 요청구분과 통합), PO 변경 사유, 요청 부서, 고객처 계정, 조회 권한, 품목 구분 예외, 고객처 담당자
- A(10-15): 판정 규칙 보완(일정·운송방법 묶음, PO 분할 한 묶음, 같은 품목 삭제+추가 정리), 고객처별 영업관리팀 담당자(881곳)·"내 담당 고객처만" 필터
- B(10-19): 변경 1건마다 사유·상세 메모(필수)·요청 출처(고객처/본사·국내법인) 입력, 일괄·지우기·이력, 후보 승인·반려 시 사유 함께 저장, 사유·출처·생산부 필터
- 10/15 누락 재계산(10-20): `maintenance_po_rebuild_1_backup_reset.sql` → 날짜 순서대로 재업로드 → `maintenance_po_rebuild_2_restore.sql`. 날짜를 빠뜨리면 이 방식으로 다시 계산(확정 상태는 날짜별로 되돌릴 수 없음). 백업·작업용 테이블(`po_rebuild_bak_*`, `po_rebuild_work_*`)은 아직 남아 있음 — 2번 파일 끝 DROP 문으로 지워도 됨
- C-1(10-20): 관리자(role admin, jhee105만) = 업로드·관리자 설정 전체·조회 권한 부여 / 영업관리팀 = PO 변경·후보 승인·사유 입력·전체 조회. 계정 종류를 요청 부서·고객처 계정 목록으로 판단, 회원가입 부서 목록 DB화, 혈압계팀→생산관리팀·W팀→제조팀, 보안 보완(가입 시 role 무시, 본인 역할·부서 변경 금지)
- C-2(10-20): 업로드·변경 원본은 영업관리팀만 조회(RLS), 대시보드용 `po_dashboard_changes`·`po_dashboard_requests`(조회 범위 적용), 추가 조회 권한 `po_view_grants`(부서 단위, 관리자 설정 '조회 권한')
- 운영 DB: `update_po_tracker_view_scope.sql`까지 실행됨. 업로드 10/12(기준선)~10/19(10/15 포함). 10/14~10/19 변경 58건·후보 13건은 아직 사유·검토 전. 10/13 묶음 1건만 승인됨

**다음 할 일 (내일 이어서)**
- C-3. PO 현황 대시보드 개편 — **먼저 실제 데이터 모양의 시안을 보여 주고 확정받은 뒤 개발**
  - 요청 접수 내역 표는 PO 현황에서 빼고 요청접수 페이지에만 둠. 탭 2개: "PO 변경 현황"(기본) / "요청 현황"
  - 데이터는 `po_dashboard_changes(시작, 끝)` / `po_dashboard_requests(시작, 끝)` rpc로 받음(조회 범위는 DB가 적용). 지금 `components/dashboard/*`는 `useRequests` + `applyDashboardScope`로 요청만 집계함 — 교체 대상
  - 구성: 필터(기간 이번 주/최근 4주/이번 달/분기/직접, 고객처(영업관리팀만), 구분, 요청 출처) → 핵심 지표 4개(변경 건수 직전 대비 ±, 사유 입력률, 확인 대기 후보, 생산부 요청 비중) → 주별 추이(유형별 누적 막대) → 유형·고객처 상위 10·사유·출처별 가로 막대 → 막대 클릭 시 PO 변경 페이지로(영업관리팀만). 요청 현황 탭: 상태·요청구분·사유·프로즌 이후 비율
  - 디자인: 슬레이트 기본 + 크림슨 강조, 원형·기울어진 세로 막대 정리, 카드 통일. 차트 작업 전 dataviz 스킬 참고
  - 완료 후 계정별(관리자·영업관리팀·제조관리팀·고객처) 숫자 확인
- 3단계: 요청↔DO 매칭(설계안 초안 있음 — 사용자가 다시 요청하면 보여줄 것), 미등록 변경 큐, 미반영 요청. 매칭되면 요청서의 사유·출처로 변경 사유를 미리 채움(`po_change_reasons.source = 'request'`). 현재 `requests` 데이터는 테스트용
- 4단계: 원요청 수신일, 프로즌 판정 기준일 변경, AI 분류(메모 → 사유), 통계
- 업로드 자동화: 엑셀 대신 판매주문·DO API 연동(사내 부서가 API 확인 중, 사용자가 요청하면 진행. 브라우저 없이 돌릴 서버 쪽 예약 작업 필요)
- 참고: 고객처 계정 중 독일(유럽법인_독일지사)·영국(유럽법인_영국지사)은 판매주문조회에 같은 이름이 없어 변경 통계가 0으로 보일 수 있음 — 사용자 확인 필요

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
