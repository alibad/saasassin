import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

// scripts/export-product.mjs drops every line marked standalone:omit from single-product repositories.
import { SiteFooter } from "@/components/site-footer"; // standalone:omit
import { SiteHeader } from "@/components/site-header"; // standalone:omit
import { rootMetadata } from "@/lib/seo";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = rootMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <SiteHeader />{/* standalone:omit */}
        {children}
        <SiteFooter />{/* standalone:omit */}
      </body>
    </html>
  );
}
