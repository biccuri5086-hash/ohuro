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
      // トークン付き URL を外部へ送らない。no-referrer だとフォーム送信の Origin が null になり同一オリジン検査に失敗するため same-origin を使う
      { source: "/confirm/:path*", headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
      { source: "/unsubscribe/:path*", headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
      { source: "/confirm", headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
      { source: "/unsubscribe", headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
    ];
  },
};

export default nextConfig;
