import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { brand } from "@/brands/trust/brand";
import { fontClassName } from "@/brands/trust/fonts";
import { BrandRoot } from "@/lib/brand/brand-root";
import { brandLayoutMetadata, brandViewport } from "@/lib/brand/metadata";

import "@/lib/brand/base.css";
import "@/brands/trust/theme.css";

export const metadata: Metadata = brandLayoutMetadata(brand);
export const viewport: Viewport = brandViewport(brand);

export default function TrustLayout({ children }: { children: ReactNode }) {
  return (
    <BrandRoot slug={brand.slug} defaultMode={brand.defaultMode} fontClassName={fontClassName}>
      {children}
    </BrandRoot>
  );
}
