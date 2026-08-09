import type { MetadataRoute } from "next";

import targetsSeed from "@/data/targets.json";
import { siteConfig } from "@/lib/app-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date("2026-08-09T00:00:00.000Z");

  return [
    { url: siteConfig.url, lastModified: updatedAt, changeFrequency: "weekly", priority: 1 },
    {
      url: `${siteConfig.url}/catalog`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/roadmap`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...targetsSeed.map((target) => ({
      url: `${siteConfig.url}/targets/${target.slug}`,
      lastModified: updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
