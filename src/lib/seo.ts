import type { Metadata } from "next";

import { siteConfig } from "@/lib/app-config";

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Ship the open replacement`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "open source SaaS alternatives",
    "AI-native builders",
    "self-hosted software",
    "SaaS replacement",
    "open source missions",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: `${siteConfig.name} — Ship the open replacement`,
    description:
      "Choose a target, join a mission, and help ship a credible open-source exit from closed SaaS.",
    url: "/",
    siteName: siteConfig.name,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — Ship the open replacement`,
    description:
      "A displacement foundry for AI-native builders, maintainers, and adopters.",
    images: ["/opengraph-image.png"],
  },
};
