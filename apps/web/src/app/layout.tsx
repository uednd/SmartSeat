import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientToastProvider } from "@/lib/toast-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartSeat | 智能图书馆座位管理",
  description: "SmartSeat 校园图书馆座位预约管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClientToastProvider>{children}</ClientToastProvider>
      </body>
    </html>
  );
}
