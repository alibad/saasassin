import type { MetadataRoute } from "next";

import { comparisons } from "@/data/comparisons";
import targetsSeed from "@/data/targets.json";
import { siteConfig } from "@/lib/app-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date("2026-08-10T00:00:00.000Z");

  return [
    { url: siteConfig.url, lastModified: updatedAt, changeFrequency: "weekly", priority: 1 },
    {
      url: `${siteConfig.url}/apps`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    },
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
    {
      url: `${siteConfig.url}/missions/canny-fider`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${siteConfig.url}/targets/lattice/research`,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${siteConfig.url}/compare`,
      lastModified: latestComparisonUpdate(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...comparisons.map((comparison) => ({
      url: `${siteConfig.url}/compare/${comparison.slug}`,
      lastModified: new Date(`${comparison.lastVerified}T00:00:00.000Z`),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    {
      url: `${siteConfig.url}/contact`,
      lastModified: updatedAt,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    ...targetsSeed.map((target) => ({
      url: `${siteConfig.url}/targets/${target.slug}`,
      lastModified: updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}

function latestComparisonUpdate() {
  const dates = comparisons.map((comparison) => Date.parse(`${comparison.lastVerified}T00:00:00.000Z`));
  return new Date(Math.max(...dates));
}
