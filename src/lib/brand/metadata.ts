import type { Metadata, Viewport } from "next";

import { siteConfig } from "@/lib/app-config";

import type { Brand } from "./types";

/**
 * The public origin a product is served from: its saasassin.net subdomain, or, in a standalone
 * repository (STANDALONE_PRODUCT), the deployment's own NEXT_PUBLIC_SITE_URL.
 */
export function brandOrigin(brand: Brand) {
  return process.env.STANDALONE_PRODUCT ? siteConfig.url : `https://${brand.slug}.saasassin.net`;
}

export function brandTitle(brand: Brand) {
  return `${brand.name} — ${brand.descriptor}`;
}

/**
 * Metadata for a product's root layout. Titles read "<Product> — <what it does>" and child pages
 * read "<Page> — <Product>"; nothing says SaaSassin. Indexing is left to each page: sign-in and
 * workspace pages say noindex themselves, public pages (boards, course pages, trust centres) keep
 * their own choice, and the homepage opts in with `brandHomeMetadata`.
 */
export function brandLayoutMetadata(brand: Brand): Metadata {
  const title = brandTitle(brand);
  return {
    metadataBase: new URL(brandOrigin(brand)),
    title: { absolute: title, template: `%s — ${brand.name}` },
    description: brand.description,
    applicationName: brand.name,
    keywords: brand.keywords,
    // saasassin.net's web manifest names SaaSassin; a product page must not point at it.
    manifest: null,
    appleWebApp: { title: brand.name, statusBarStyle: brand.defaultMode === "dark" ? "black-translucent" : "default" },
    openGraph: {
      type: "website",
      siteName: brand.name,
      title,
      description: brand.description,
      url: "/",
    },
    twitter: { card: "summary_large_image", title, description: brand.description },
  };
}

/** The signed-out product homepage is the one product page search engines may index. */
export function brandHomeMetadata(): Metadata {
  return {
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
  };
}

/** Browser chrome follows the product's default canvas (the mode toggle is per visitor). */
export function brandViewport(brand: Brand): Viewport {
  return { themeColor: brand.defaultMode === "dark" ? brand.colors.canvasDark : brand.colors.canvas };
}
