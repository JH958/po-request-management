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
- `app/(shell)/` 하위 페이지(`/` PO 현황 대시보드 — 영업관리팀·관리자만, 그 밖의 계정은 `/request`로 보내고 사이드바에서도 숨김, `/request` 요청접수, `/review` 검토대기, `/po-upload` 데이터 업로드, `/po-changes` PO 변경, `/admin-settings`)는 `components/common/AppShell.tsx`로 감싸짐. AppShell이 `useAuth`로 인증 확인(미로그인 시 `/login` 리다이렉트), 헤더·사이드바·알림 팝오버·제품 투어(driver.js, `lib/tours/`)·`RequestConfigProvider`를 제공.
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
- 변경 유형 고치기(2026-10-21, `update_po_tracker_change_type_edit.sql`): 영업관리팀이 변경 1건(stat_unit_key)의 유형을 PO 변경 유형 중 하나로 지정 — `po_change_type_overrides`/`set_change_types`(이력 `po_change_type_override_history`), 뷰의 `change_type_code`·`change_type_label`이 고친 유형을 우선(`is_type_overridden`은 고친 유형이 자동 판정과 다를 때만 — 품목 구분 등을 바꿔 같아진 기록은 `update_po_tracker_type_override_cleanup.sql`로 정리, 자동 판정 `rule_type_code`). 자동 판정과 같은 유형을 고르면 지움, 고친 유형을 끄면 자동 판정으로. 후보 묶음은 승인할 때 `review_change_group(…, p_type_code)`로 함께 저장(반려되면 각 라인은 자동 판정). 화면: 확인 필요 카드·사유 입력 창의 '변경 유형'. 같은 날 짝찾기만 함 — 'PO 간 이동' 유형·날짜가 다른 짝찾기·직접 묶기는 만들었다가 사용자 결정으로 원복
- 경유 고객처(2026-10-21): 인바디헬스케어·코르트(`po_via_customers`)는 판매주문조회의 도착항·국가/지역·이름2(`customer_so_map.dest_port/dest_country/customer_name2`)로 실제 고객처를 찾아 표시명 "주식회사 인바디헬스케어_미국(미국법인)"(`v_order_destinations.display_customer_name`, `v_do_change_events.display_customer_name`). 판단 순서: 건별 선택(`po_order_destinations`, `set_order_destination`) → 이름2 메모가 후보와 맞음 → `po_destination_map`(도착항 우선, 국가; 고정 또는 건별 선택 후보) → 국가명(`po_country_names`) → 도착항 빈칸이면 "_국내". 도착 정보를 아직 못 받은 주문은 고객처명 그대로. 조회 범위·담당자는 `customer_name` 기준 그대로. 관리자 설정 '경유 고객처·도착지'.
- 고객처 담당자: `customer_managers`(계정 번호 → 영업관리팀 담당자·메일, 관리자 설정 '고객처 담당자'). 담당자 메일 = 로그인 메일이라 PO 변경 페이지 "내 담당 고객처만" 필터에 씀. 미지정 고객처는 `v_customers_without_manager`. 판매주문조회의 담당자·코스트센터 열은 영업관리팀 담당과 달라 쓰지 않음.
- 변경 사유(2026-10-19): 모든 변경(통계 단위)에 영업관리팀이 사유(`request_reason_settings` 값)·상세 메모(필수)·요청 출처(고객처/본사·국내법인)를 `set_change_reasons`로 입력, 잘못 넣으면 `clear_change_reasons`로 지움(이력 source `cleared`)(`po_change_reasons`, 이력 `po_change_reason_history`). 후보 묶음은 `review_change_group`의 사유 인자로 승인·반려와 함께 저장하고, 반려되면 각 라인이 묶음 사유를 물려받음(뷰가 `group:` 키로 대체 조회). 요청 부서는 `po_request_origins`(분류 '회사구분_기능', 기능 '생산' = 생산부 필터 `function_group`), 관리자 설정 '요청 부서'. 화면은 `ReasonDialog`(여러 건 선택)·`ReasonOriginFields`.
- 품목 구분은 `item_class_overrides`(품목번호 예외)가 카테고리 구분보다 우선. 후보 승인/반려는 메모 필수이며 처리자 이름(`reviewed_by_name`)과 이력(`do_change_group_reviews`)을 DB 함수가 남긴다(다른 사용자 프로필은 RLS로 못 읽으므로 이름을 저장).
- 운영 DB 변경은 기본 파일(`add_po_tracker_do_tracking.sql`)을 고치고, 이미 실행된 DB용 후속 파일(`update_po_tracker_*.sql`)을 따로 만든다.

### 요청 ↔ DO 변경 연결 (3단계, 2026-10-22, `update_po_tracker_request_matching.sql`·`update_po_tracker_request_untracked.sql`)
- 후보(`po_match_pairs`, 내부용): 요청 1건 × 품목(`po_request_items` — items 배열 우선, 없으면 단일 품목 칸, 수량 절댓값) ↔ 변경 1건(stat_unit_key). SO 같음(`po_norm_code`로 공백·대소문자 무시) + 품목 같음(변경 전·후 품목 포함) + 감지일이 요청일 −7 ~ +45일(`po_match_settings`, 관리자 설정 '요청 연결 기준'). 출하일정·운송방법 변경은 요청 단위(item_key 빈칸, 요청에 품목이 있으면 하나는 겹쳐야 함, 수량 비교 안 함). 일치 정도: 유형(요청구분 label = 변경 유형, 고친 유형 기준)·수량. 추적 제외·"변경 아님"·삭제된 요청·SO 없는 요청은 제외.
- 자동 연결(`po_run_auto_link`): 유형·수량까지 맞고 그 변경의 후보 요청이 하나, 그 요청 품목의 후보 변경도 하나일 때만(요청 단위는 여러 변경 가능). 반려된 요청·예외 처리한 변경·해제한 짝은 제외. 실행: DO 업로드 완료 트리거(`po_uploads_auto_link`), 요청 등록·수정 트리거(`po_requests_match_*`, 실패해도 저장은 막지 않음), '다시 매칭' 버튼(`rematch_change_requests`). 요청 삭제(소프트·완전) 시 연결 해제.
- 연결 `request_change_links`(auto/manual, linked/unlinked, request_date 복사 — 영업관리팀이 requests를 RLS로 못 읽을 수 있어서)·이력. 직접 연결 `link_change_request`, 해제 `unlink_change_request`(메모 필수). 연결되면 사유가 비어 있을 때만 요청서 사유·출처(요청 부서 목록 → 부서, 고객처 계정 → 고객처)·"[요청서 날짜 · 요청자] 상세"로 채움(`po_prefill_request_reason`, source `request`), 연결이 모두 풀리면 고치지 않은 요청서 사유는 지움.
- **용어(2026-10-23 확정)**: **요청일** = 요청 카드를 작성한 날(`requests.request_date`, 시스템이 정함·고칠 수 없음, 프로즌 판정 기준) / **등록일** = 요청이 DO에 반영된 날(연결된 변경의 마지막 감지일, `po_request_reflections.reflected_on`). '등록'을 요청서 저장의 뜻으로 쓰지 말 것.
- 요청 연결 상태(`v_do_change_events.registration_status`, DB 코드는 그대로): pre **사전 요청**(요청일 ≤ 감지일) / post **사후 요청** / exempt 예외 처리(`po_change_exemptions`, `set_change_exemptions`·`clear_change_exemptions`, 메모 필수 — "변경 아님"과 다름) / waiting 확인 대기(감지 후 5영업일 안, 토·일만 제외 `po_business_days_between`) / unregistered **요청 없음**. 묶음이 반려되면 각 라인이 묶음 연결·예외를 물려받음. **사전 요청률** = 사전 요청 ÷ 전체 변경.
- 조회 함수(영업관리팀): `po_change_links`, `po_match_candidates`(요청 요약 포함), `po_unreflected_requests`(승인·완료 + 출하일 지남 + 연결 없음, 추적 전 제외). 요청 화면용 `po_request_reflections`(본인 요청·검토자·관리자·영업관리팀만): reflected / partial / none / no_so / untracked(요청일+45일 < 첫 DO 업로드일 `po_tracking_start`).
- 화면: PO 변경 — 표의 '요청 연결' 칸 → `RequestLinkDialog`(연결·후보·예외), 요청 연결 필터, 사전 요청률 카드, '요청 없는 변경' 탭(`UnregisteredQueue`, 후보 3개 바로 연결, 미반영 요청). 요청접수·검토대기 표 '등록일 (DO 반영)'(`RegistrationDateCell` — 반영일·요청일부터 일수·상태, `useRequestReflections`). PO 현황 '사전 요청률' 지표. API `lib/po-request-links-api.ts`.
- 요청 등록 창: 주문번호는 영문 + 9자리 숫자(`validateSONumber` — SO·PO·ihcPO·bwaPO·TRO), 품목 구분 입력은 삭제(열 `product_category`는 남김, 예전 값만 표시).

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
- 목록 조회 필터는 `applyRequestListFilter`(모드: `request-intake` = 본인 부서가 요청한 건 / `review-history` = 관리자 전체, 고객처는 자기 customer + 본사 요청, 본사는 타 본사 부서 요청).
- **PO 현황 대시보드**(2026-10-22, `components/dashboard/PoDashboard.tsx`): 탭 'PO 변경 현황'·'요청 현황', 보기 전용(편집 없음). 데이터 `lib/po-dashboard-api.ts`(`po_dashboard_changes`/`po_dashboard_requests`, 직전 같은 길이 기간도 받아 건수 비교), 집계 `lib/po-dashboard-utils.ts`. 추이는 일(영업일)·주·월·분기·연 버튼(기본은 기간 길이로: 31일·120일·1년·3년 기준), 막대는 `RankedBars`(마우스를 올리면 나눠 보기: 유형·사유 = 고객처/생산부/기타 부서/미입력, 고객처 = 경유 고객처 꼬리표별 — 경유 고객처는 꼬리표 없이 하나로), 누르면 `/po-changes?from&to&type|customer|reason|origin`. 색: 추가 #1E40AF·삭제 #8B1538(PO 변경 표와 같음), 출처 고객처 크림슨·생산부 파랑·기타 부서 회색.
- 관리자 설정 화면 진입은 Supabase 인증과 별개로 비밀번호 기반 HttpOnly 쿠키(`po_admin_session`, HMAC 서명, 8시간; `lib/admin-session-cookie.ts`)를 `/api/admin/{verify,session,logout}`로 관리.

### 프로즌 데이트
- 출하일 기준 N주 전(옵션: 해당 주 월/금요일로 보정)을 프로즌 데이트로 계산하고, 요청일이 그 이후면 `after`(프로즌 이후 — 경고 대상). 규칙은 요청자 유형(고객처/본사)과 요청구분(자재 추가/삭제 여부)에 따라 `frozen_date_settings`에서 선택. 로직은 `lib/frozen-date.ts`, 조회는 `lib/frozen-date-api.ts` / `hooks/use-frozen-date-settings.ts`.

## 진행 상황과 다음 할 일 (2026-10-23 기준)

PO Tracker 전환은 4단계로 진행 중: 1) 표시명 변경 2) DO 업로드·비교 3) 요청↔DO 매칭·요청 없는 변경 큐 4) 요청일·등록일 정리(완료)·AI 분류·통계. 1~3단계와 보완 작업 A·B·C 완료. 4단계 남은 것: PO 직행률·업무 부하도(설계 중, 다음 작업) → AI 분류(보안 확인 후) / 업로드 자동화는 나중.

**완료**
- 1·2단계: 표시명 PO Tracker, 판매주문조회·DO등록현황조회 업로드와 DO 변경 이벤트, 분할/합배송·품목코드 변경 후보 승인/반려, PO 변경 페이지(`/po-changes`), 디자인 개편·KOR/ENG
- 관리자 설정 탭: 프로즌 데이트, PO 변경 유형(요청접수 요청구분과 통합), PO 변경 사유, 요청 부서, 고객처 계정, 조회 권한, 품목 구분 예외, 고객처 담당자, 경유 고객처·도착지
- A(10-15): 판정 규칙 보완(일정·운송방법 묶음, PO 분할 한 묶음, 같은 품목 삭제+추가 정리), 고객처별 영업관리팀 담당자(881곳)·"내 담당 고객처만" 필터
- B(10-19): 변경 1건마다 사유·상세 메모(필수)·요청 출처(고객처/본사·국내법인) 입력, 일괄·지우기·이력, 후보 승인·반려 시 사유 함께 저장, 사유·출처·생산부 필터
- 10/15 누락 재계산(10-20): `maintenance_po_rebuild_1_backup_reset.sql` → 날짜 순서대로 재업로드 → `maintenance_po_rebuild_2_restore.sql`. 날짜를 빠뜨리면 이 방식으로 다시 계산(확정 상태는 날짜별로 되돌릴 수 없음). 10-23 보완: 사유·묶음 외에 고친 유형·"변경 아님"·예외 처리·요청 연결(해제한 짝 포함)도 단위 서명(`po_rebuild_bak_unit_sigs`)으로 백업·복원(백업 값 우선), 다시 올리는 동안 자동 연결 트리거를 끄고 2번이 다시 켬, 끝나면 `maintenance_po_rebuild_cleanup.sql`로 백업·작업용 테이블 삭제(다음 재계산 전 필수)
- C-1(10-20): 관리자(role admin, jhee105만) = 업로드·관리자 설정 전체·조회 권한 부여 / 영업관리팀 = PO 변경·후보 승인·사유 입력·전체 조회. 계정 종류를 요청 부서·고객처 계정 목록으로 판단, 회원가입 부서 목록 DB화, 혈압계팀→생산관리팀·W팀→제조팀, 보안 보완(가입 시 role 무시, 본인 역할·부서 변경 금지)
- C-2(10-20): 업로드·변경 원본은 영업관리팀만 조회(RLS), 대시보드용 `po_dashboard_changes`·`po_dashboard_requests`(조회 범위 적용), 추가 조회 권한 `po_view_grants`(부서 단위, 관리자 설정 '조회 권한')
- 10-21: 판정 보완 2차(운송방법 빈칸→값 제외, 출하 완료 시 요청 배송일 갱신 제외, 주문 전체 삭제 1건)·"변경 아님(정정)" / 경유 고객처(인바디헬스케어·코르트) 실제 도착지 표시 / 변경 유형 고치기(확인 필요 카드·사유 입력 창) + 주문 전체 삭제(order:) 키 사유 입력 버그 수정
- 10-21 시도 후 원복: 'PO 간 이동' 유형, 날짜가 다른 짝찾기(5영업일), 직접 묶기 — 사용자가 분류는 사람이 유형을 고르는 방식으로 결정. 다시 제안하지 말 것(요청하면 그때)
- 10-22: 고친 변경 유형이 자동 판정과 같아지면 "수정" 표시 없음·겹치는 기록 정리(`update_po_tracker_type_override_cleanup.sql`) / C-3 PO 현황 대시보드 개편(커밋 8da389a) — 탭 'PO 변경 현황'·'요청 현황', 영업관리팀·관리자 전용(다른 계정은 메뉴 숨김·요청접수로), 보기 전용, 지표 4개(변경 건수 직전 대비·사유 입력률·확인 대기 후보·고객처/생산부 요청 비중), 추이 일·주·월·분기·연 전환, 유형·고객처 상위 10·사유·요청 출처 막대(툴팁: 고객처/생산부 비중, 경유 고객처는 꼬리표 없이 묶고 실제 도착지별), 막대 클릭 → PO 변경 페이지(같은 기간·조건). 구분(제품/상품/자재)은 필터만(막대 안 넣기로)
- 운영 데이터 정리(10-22, 사용자): 인그립 거치대 W9T400006 → 품목 구분 예외 '상품', PO 변경 사유에 '신규 품목 초도 발주' 추가. 사용자 담당 고객처(미국법인·멕시코법인) 8건 사유·유형 입력 완료, PO781→788은 분할/합배송으로 승인(사유 적재공간 과부족)
- 3단계 요청↔DO 변경 연결(10-22, 커밋 6a14a29): 사용자 결정 — SO 없는 요청은 매칭 제외("SO 없음"), 대기·검토 중·승인 요청 모두 매칭(반려는 후보만, 연결되면 "반려됐는데 변경됨"), 유예 5영업일·사전/사후 구분, 날짜 −7 ~ +45일, 수량 다르면 부분 반영, 사유는 비어 있을 때만 채움. 로컬 PGlite 46개 항목 + 운영 확인 완료. 시험 요청 1건(PO000000788 Z19902005 −60, 요청일 10/22) 운영에 남겨 둠 → 사후 등록·반영됨 10/20, 기존 사유 '기타' 유지. 2025-12 테스트 요청은 '추적 전'
- 10-23: 재계산 스크립트 보완·10/20 백업 테이블 삭제(`maintenance_po_rebuild_cleanup.sql` 운영 실행, 커밋 71e494f) / 4단계-1 요청일·등록일 정리(커밋 998c0e6) — 요청일 = 카드 작성일(고칠 수 없음, 프로즌 기준), 등록일 = DO 반영일, PO 변경 용어를 사전 요청·사후 요청·요청 없음·사전 요청률로
- 10-23 시도 후 원복: '최초 요청일'(요청자가 요청을 처음 받은 날을 입력, 그 날짜로 프로즌 판정, 판정이 바뀌면 지연 사유·관리자 수정·한도 설정) — 사용자가 날짜 조작 여지를 없애려고 요청일을 카드 작성일로 고정하기로 결정. `add_request_original_date.sql`은 운영에 실행됐다가 `update_request_original_date_revert.sql`로 원복(레포에는 원복 파일만). 다시 제안하지 말 것(요청하면 그때)
- 운영 DB: `update_request_original_date_revert.sql`까지 실행됨 (그 전 `update_po_tracker_request_untracked.sql`)(`update_po_tracker_po_move.sql`은 운영에 실행됐다가 `update_po_tracker_change_type_edit.sql`로 원복, 레포에는 없음). 업로드 10/12(기준선)~10/22. 10/13~10/22 변경 92건(요청 없음 51·확인 대기 40·사후 요청 1), 확인 필요 후보 15건 — 사용자 담당 외 고객처는 아직 사유·검토 전

**다음 할 일**
- C-3 후속: PO 현황 대시보드는 사용자가 쓰면서 추가 수정 요청 예정. 고객처·본사 부서 계정에서 메뉴가 숨겨지는지 실제 계정으로 확인 필요(관리자 계정으로만 확인함). 요청 현황 탭 숫자는 아직 테스트 요청 데이터
- 3단계 후속: 실제 요청이 쌓이면 자동 연결·후보 정확도 확인(날짜 범위·유예 기간 조정은 관리자 설정). 현재 `requests`는 시험 1건 외 테스트 데이터
- **4단계-3 PO 직행률·업무 부하도 (설계 중, 다음에 사용자 답변 받고 최종안 → 개발)** — 요청 접수 통계(반영 소요일·검토 소요일 등)는 아직 PO Tracker로 요청을 받지 않아 보류(사용자 결정 10-23)
  - **PO 직행률(출하월 기준, 월별 리포트)** = 변경 없는 DO ÷ 전체 DO. 확정: 최종 출하일 = DO의 '요청받은 배송 일자'(`do_lines.requested_delivery_date`, DO마다 하나 — 연기되면 다음 달로), 묶음 = 전체 / Regular·Parcel 제외 전체 / Ocean / Air / 특송(DHL·UPS·Fedex·EMS) / Truck / Parcel / Regular(국내 정기 배송, DO 1,455건으로 최다) / 기타(Pickup·HC·Direct·빈칸), 이전(TRO) DO는 분모·분자 제외, 10월은 '부분 추적' 표시(변경 이력이 10/12부터라), 그달 DO가 모두 종료되면 '확정'·아니면 '잠정'
  - 함께 볼 지표(같은 출하월·모수): 긴급변경률 = 출하 예정일 **D-3 이내(달력일)** 변경이 있었던 DO ÷ 출하 DO / 건당 평균 변경 횟수 = 출하 DO에 걸린 변경 1건 수 ÷ 출하 DO / 고객처별 직행률(경유 고객처는 하나로 묶고 도착지별 나눠 보기). 본사 부서별 직행률은 계산하지 않음(DO에 부서 없음) → '요청 출처별 변경 DO 수·비중'으로
  - 모수 검토안(제안, 사용자 확인 전): 종료된 DO만 / TRO 제외 / 추적 제외 고객처·제외 품목만 담긴 DO 제외 / **10/12 이전에 이미 종료된 DO 제외**(변경을 관찰 못 함). 변경 있는 DO = DO에 든 판매주문 라인에 변경(변경 아님·추적 제외 빼고, 출하 전) — 삭제돼 사라진 라인은 변경 기록의 DO 번호로도 연결, 여러 주문 합친 DO(296건)는 한 주문이라도 변경이면 변경
  - **사용자 답변 대기 3가지**: ① 취소된 DO(출하 없이 사라짐)를 마지막 출하 예정월 분모에 '변경 있음(취소)'으로 넣을지(제안: 넣고 취소 DO 수 따로 표시) ② 출하 부족(마감 시 등록 수량 부족)도 변경으로 셀지(제안: 예) ③ 경중 기본 '중 ×1', 상 ×2, 하 ×0.5로 시작·관리자 설정에서 변경(제안)
  - **업무 부하도(변경 발생월 기준, 직행률과 따로)**: 비율이 아니라 가중 변경 건수(주·월별, 고객처 담당자별). 확정: 가중치 = D-day 3구간(출하 예정일 D-3 이내 ×3 / D-4 ~ 프로즌 데이트 ×2 / 프로즌 데이트 이전 ×1, 프로즌은 고객처별 프로즌 설정의 제품·자재 규칙, 관리자 설정에서 구간·배수 변경) × 담당자가 사유 입력 창에서 고르는 **경중(상·중·하)**. 변경 유형 배수는 쓰지 않음. 장기 이슈(예: 380 가방 납품 지연 2~3개월)는 '누적 지연일'(최초 출하 예정일 → 최종)·'변경 반복 횟수' 상위 목록으로 보완
  - 개발 시 DB 필요: 변경 기록 때 **그 시점의 출하 예정일**을 이벤트에 저장(지금은 DO의 현재 날짜만 있음 — 10/13~ 기존 변경은 일정 변경 전 날짜·현재 날짜로 근사 채움), 가중치 설정 테이블, 경중 칸(`po_change_reasons`), 직행률 집계 함수(DB에서 집계). 데이터 참고(10/22 DO 파일): DO 3,136건, 모드별 Regular 1,455·Parcel 415·Ocean 379·Air 241·빈칸 244·Truck 207·DHL 100, 월 종료 DO 약 300건
- 4단계-2 AI 분류 (설계안만, 보류): 사유 입력 창의 상세 메모 → PO 변경 사유·요청 출처 **제안**(저장은 사람), 서버 API `/api/ai/suggest-reason`(Claude Opus 5.5·effort low·구조화 출력으로 목록 값만, 1건 약 13원), 정확도는 기존 입력분으로 먼저 검증. **사내 보안 정책(외부 AI API로 메모 전송 가능 여부)·Anthropic API 키 확인 후 진행** — 키는 채팅 말고 Vercel·`.env.local`에 `ANTHROPIC_API_KEY`(NEXT_PUBLIC 금지). 범위 (가) 제안 버튼만 제안, (나) 입력된 사유 점검은 나중
- 업로드 자동화(API) — **기존 계획 순서대로 나중에** (사용자 결정 10/21)
  - 사내 DX팀이 필요한 열로 판매주문조회·DO등록현황조회 API를 만들어 줌. 사용법: 사내 데이터센터 사이트에서 API 키 발급 → 요청 헤더에 넣어 호출
  - 판매주문 API에 도착항(·선적항)이 아직 없음 → DX팀 추가 요청 필요. 국가/지역·이름2 포함 여부도 응답으로 확인(경유 고객처 도착지 판단에 씀)
  - 진행 방식: API 키는 채팅에 받지 않음 — 사용자가 `.env.local`에 `DX_API_KEY`로 넣고, 확인용 스크립트(키 출력 안 함)를 사용자가 직접 실행 → 저장된 응답으로 열 대응·행 수·형식을 엑셀과 비교. 필요한 것: API 주소, GET/POST, 조회 조건 파라미터, 키 헤더 이름, 응답 예시
  - 구조: API → 지금 파서와 같은 데이터 묶음으로 변환 → 같은 DB 함수(`start_po_upload` → `apply_so_snapshot` / `stage_po_upload_chunk` → `apply_do_snapshot`) — 판정 로직은 그대로. 실행 위치는 API가 사내망 전용이면 사내 서버·상시 PC의 예약 작업(추천), 외부 접근 가능하면 Supabase Edge Function + pg_cron. 업로드 전용 계정·역할(`uploader`), 이력의 자동/수동 구분, 원본 JSON 보관, 실패 시 관리자 메일, 엑셀 업로드는 비상용으로 유지, 전환 전 5영업일 병행 검증
- 참고: 고객처 계정 독일(유럽법인_독일지사, HC006733)·영국(유럽법인_영국지사, HC009468)은 2026년 판매주문조회에 계정 번호·이름 모두 없음(유럽 물량은 네덜란드(유럽법인) HC005180, 도착국 NLD·ESP·POL) → 변경 통계 0이 맞음. 두 계정이 직접 주문하기 시작하면 이름이 다를 수 있어 조회 범위를 계정 번호로도 맞추는 보완 검토

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
