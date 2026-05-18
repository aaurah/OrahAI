import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { Toaster } from "@/components/ui/Toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "OrahAI — AI-First Development Platform",
    template: "%s | OrahAI",
  },
  description:
    "Build software 10x faster with OrahAI — an AI-powered browser IDE with intelligent coding assistance, instant deployment, and team collaboration.",
  keywords: ["AI coding", "browser IDE", "software development", "AI assistant"],
  openGraph: {
    title: "OrahAI",
    description: "AI-first software development platform",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "OrahAI",
    description: "AI-first software development platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
