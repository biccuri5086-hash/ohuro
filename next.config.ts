import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // 事前登録 LP ではカメラ等を使わない
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    ];
    return [
      { source: "/:path*", headers: common },
      // トークン付き URL を外部へ送らない
      { source: "/confirm/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/unsubscribe/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/confirm", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/unsubscribe", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
