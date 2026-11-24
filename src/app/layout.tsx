import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MY LIFE PLANNER", template: "%s · MY LIFE PLANNER" },
  description: "Lịch thông minh & theo dõi thói quen: lập kế hoạch, tích hoàn thành và xem hiệu suất hằng tuần.",
  applicationName: "MY LIFE PLANNER",
  appleWebApp: { capable: true, title: "Life Planner", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning className="h-full">
      <body className="min-h-full bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
