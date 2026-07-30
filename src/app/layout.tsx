import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { OperationDialogProvider } from "@/components/operation-dialog";
import "./globals.css";

export const metadata: Metadata = {
  title: "筑记 | 装修进度与验收助手",
  description: "跟踪装修进度、验收细节、材料调研与现场记录。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={GeistSans.className}><OperationDialogProvider>{children}</OperationDialogProvider></body>
    </html>
  );
}
