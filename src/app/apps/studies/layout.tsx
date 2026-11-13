import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { brand } from "@/brands/studies/brand";
import { fontClassName } from "@/brands/studies/fonts";
import { BrandRoot } from "@/lib/brand/brand-root";
import { brandLayoutMetadata, brandViewport } from "@/lib/brand/metadata";

import "@/lib/brand/base.css";
import "@/brands/studies/theme.css";

export const metadata: Metadata = brandLayoutMetadata(brand);
export const viewport: Viewport = brandViewport(brand);

export default function StudiesLayout({ children }: { children: ReactNode }) {
  return (
    <BrandRoot slug={brand.slug} defaultMode={brand.defaultMode} fontClassName={fontClassName}>
      {children}
    </BrandRoot>
  );
}
