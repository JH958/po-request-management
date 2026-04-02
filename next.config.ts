import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ngrok 등 외부 도메인에서 개발 서버 접근 허용
  allowedDevOrigins: [
    "https://bessie-bulbiferous-remissly.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok.io",
  ],
  // Turbopack 루트 디렉토리 명시 (Vercel 배포 시 lockfile 경고 해소)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
