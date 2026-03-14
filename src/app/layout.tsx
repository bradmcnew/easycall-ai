import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { StepIndicator } from "@/components/step-indicator";
import { LogoutButton } from "@/components/logout-button";
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
  title: "EasyCallAI",
  description: "Skip the hold. AI calls your ISP for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
          <LogoutButton />
          <StepIndicator />
          <div className="flex flex-1 flex-col items-center justify-center">
            {children}
          </div>
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
