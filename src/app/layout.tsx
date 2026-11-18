import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "おふろクエスト",
  description: "入浴を先延ばしにしがちな人のための、ゲーム型入浴習慣化アプリ（開発中）",
  robots: { index: false, follow: false },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#fdf6ec" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
