import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessagesSquare, Scale } from "lucide-react";

import { JsonLd } from "@/components/json-ld";
import { comparisons } from "@/data/comparisons";
import { siteConfig } from "@/lib/app-config";
import { breadcrumbJsonLd } from "@/lib/compare/structured-data";

const description =
  "Honest, dated comparisons between SaaSassin's open-source products and the closed SaaS they replace, with a source for every competitor fact.";

export const metadata: Metadata = {
  title: "Compare SaaSassin with closed SaaS",
  description,
  alternates: { canonical: "/compare" },
  openGraph: {
    type: "website",
    title: `Compare SaaSassin with closed SaaS | ${siteConfig.name}`,
    description,
    url: "/compare",
    siteName: siteConfig.name,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Compare SaaSassin with closed SaaS | ${siteConfig.name}`,
    description,
    images: ["/opengraph-image.png"],
  },
};

export default function CompareIndexPage() {
  return (
    <main className="compare-page">
      <JsonLd
        data={breadcrumbJsonLd(siteConfig.url, [
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
        ])}
      />
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <p className="eyebrow">Comparisons</p>
            <h1>Compared honestly.</h1>
          </div>
          <div className="page-hero-aside">
            <p>
              Each comparison cites the competitor&apos;s own public pages with the date we read them, and keeps the
              rows where they are ahead.
            </p>
            <span className="data-source-badge">
              <Scale aria-hidden="true" /> {comparisons.length}{" "}
              {comparisons.length === 1 ? "comparison" : "comparisons"} published
            </span>
          </div>
        </div>
      </section>

      <section className="section compare-index-section">
        <div className="shell">
          <ul className="compare-index-grid">
            {comparisons.map((comparison) => (
              <li key={comparison.slug}>
                <Link className="compare-index-card" href={`/compare/${comparison.slug}`}>
                  <p className="eyebrow">
                    {comparison.productName} vs {comparison.competitorName}
                  </p>
                  <h2>{comparison.hero.title}</h2>
                  <p>{comparison.summary}</p>
                  <span className="compare-index-meta">
                    Last verified <time dateTime={comparison.lastVerified}>{comparison.lastVerified}</time>
                  </span>
                  <span className="compare-index-cta">
                    Read the comparison
                    <ArrowRight aria-hidden="true" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="compare-index-note">
            <MessagesSquare aria-hidden="true" size={20} />
            <p>
              Want a comparison we haven&apos;t written, or spotted a fact that has changed?{" "}
              <Link href="/contact">Talk to us</Link>.
            </p>
          </div>

          <p className="compare-index-legal">
            Product names on this page are trademarks of their owners and identify the tools we compare against.
            SaaSassin is not affiliated with or endorsed by them.
          </p>
        </div>
      </section>
    </main>
  );
}
