import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { brand } from "@/brands/performance/brand";
import { fontClassName } from "@/brands/performance/fonts";
import { BrandRoot } from "@/lib/brand/brand-root";
import { brandLayoutMetadata, brandViewport } from "@/lib/brand/metadata";

import "@/lib/brand/base.css";
import "@/brands/performance/theme.css";

export const metadata: Metadata = brandLayoutMetadata(brand);
export const viewport: Viewport = brandViewport(brand);

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <BrandRoot slug={brand.slug} defaultMode={brand.defaultMode} fontClassName={fontClassName}>
      {children}
    </BrandRoot>
  );
}
