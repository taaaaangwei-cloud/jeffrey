import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://echo-chat-pwa.taaaaangwei.chatgpt.site"),
  title: "回声 · 让每段对话都被温柔记住",
  description: "可安装、支持消息通知与智能记忆的现代 PWA 聊天应用。",
  applicationName: "回声",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "回声" },
  openGraph: {
    title: "回声",
    description: "让每段对话，都被温柔记住",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "回声 · 让每段对话，都被温柔记住" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "回声",
    description: "让每段对话，都被温柔记住",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
