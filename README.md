This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you save.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

## 환경 변수 (Environment variables)

로컬에서는 프로젝트 루트에 `.env.local` 파일을 만들고, Vercel에서는 **Settings → Environment Variables**에 동일한 키를 등록합니다.  
템플릿은 루트의 **`.env.example`**을 복사해 `.env.local`로 저장한 뒤 값만 채우면 됩니다.

### Supabase (필수)

| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(public) API 키 |

### 관리자 모드 비밀번호 (서버 전용, 권장)

관리자 화면(관리자 탭) 진입 시 사용하는 비밀번호는 **브라우저에 노출되지 않도록** 서버 API에서만 검증합니다.

| 변수명 | 설명 |
|--------|------|
| `ADMIN_PAGE_PASSWORD` | 관리자 모드용 비밀번호. **`NEXT_PUBLIC_` 접두사를 붙이지 마세요.** 빌드 결과물에 포함되지 않습니다. |
| `ADMIN_SESSION_SECRET` | 관리자 세션 쿠키(HMAC) 서명용 비밀 긴 문자열. 임의의 랜덤 문자열(32자 이상 권장)을 사용하세요. **`NEXT_PUBLIC_` 없음.** |

- 로컬 예시 (`.env.local`):

```env
ADMIN_PAGE_PASSWORD=여기에_강한_비밀번호
ADMIN_SESSION_SECRET=여기에_랜덤_긴_문자열
```

- 설정하지 않으면 `/api/admin/verify`는 **503**을 반환하고 관리자 비밀번호 로그인이 동작하지 않습니다.
- 과거에 사용하던 `NEXT_PUBLIC_ADMIN_PAGE_PASSWORD`는 **사용하지 않습니다.** 제거해도 됩니다.

### 관리자 세션 동작 요약

1. 사용자가 비밀번호를 입력하면 `POST /api/admin/verify`로 전송됩니다.
2. 서버가 `ADMIN_PAGE_PASSWORD`와 비교한 뒤, 성공 시 **HttpOnly** 쿠키(`po_admin_session`)를 발급합니다. (기본 유효 시간 약 8시간)
3. 새로고침 후에는 `GET /api/admin/session`으로 쿠키가 유효한지 확인해 관리자 인증 상태를 복원합니다.
4. 요청자/검토자 모드로 전환하면 `POST /api/admin/logout`으로 쿠키가 삭제됩니다.

---

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

배포 시 Vercel 환경 변수에 **`ADMIN_PAGE_PASSWORD`**, **`ADMIN_SESSION_SECRET`**, Supabase 변수를 모두 등록한 뒤 재배포하세요.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
