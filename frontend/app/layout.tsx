import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cargo Ops",
    template: "%s | Cargo Ops",
  },
  description: "FIXED ROOM 기반 편명 조회 및 모바일 요약 화면",
  applicationName: "Cargo Ops",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cargo Ops",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07152b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Cargo Ops" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#07152b" />
      </head>
      <body>{children}</body>
    </html>
  );
}
