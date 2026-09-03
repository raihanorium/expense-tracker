import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import GoogleAuthProvider from "@/components/GoogleAuthProvider";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Offline-first expense tracking, synced to your Google Drive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorker />
        <GoogleAuthProvider>{children}</GoogleAuthProvider>
      </body>
    </html>
  );
}
