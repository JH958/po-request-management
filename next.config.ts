import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // ngrok 등 외부 도메인에서 개발 서버 접근 허용
  allowedDevOrigins: [
    "https://bessie-bulbiferous-remissly.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok.io",
  ],
};

export default nextConfig;
