import type { Comparison } from "./types";

/**
 * schema.org JSON-LD for the compare pages. Only facts the page itself states go in
 * here: no ratings, reviews or customer counts (none are verified).
 */

type JsonLd = Record<string, unknown>;

const AGPL_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

function absolute(siteUrl: string, path: string) {
  return new URL(path, siteUrl).toString();
}

export function breadcrumbJsonLd(siteUrl: string, trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(siteUrl, crumb.path),
    })),
  };
}

export function comparisonBreadcrumbTrail(comparison: Comparison) {
  return [
    { name: "Home", path: "/" },
    { name: "Compare", path: "/compare" },
    { name: comparison.competitorName, path: `/compare/${comparison.slug}` },
  ];
}

export function comparisonJsonLd(comparison: Comparison, siteUrl: string): JsonLd[] {
  const application: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: comparison.productName,
    description: comparison.seo.applicationDescription,
    applicationCategory: comparison.seo.applicationCategory,
    operatingSystem: "Web",
    url: comparison.productUrl,
    license: AGPL_URL,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    publisher: {
      "@type": "Organization",
      name: "SaaSassin",
      url: absolute(siteUrl, "/"),
    },
  };

  const faq: JsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: comparison.faq.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };

  return [application, faq, breadcrumbJsonLd(siteUrl, comparisonBreadcrumbTrail(comparison))];
}

/** Serialises JSON-LD for a <script> tag; `<` is escaped so text can never close the tag. */
export function serializeJsonLd(data: JsonLd) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
