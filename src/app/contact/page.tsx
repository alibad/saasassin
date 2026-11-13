import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CodeXml, Mail } from "lucide-react";

import { InterestForm } from "@/components/interest-form";
import { comparisons } from "@/data/comparisons";
import { siteConfig, sourceRepositories } from "@/lib/app-config";
import { CONTACT_PAGE_SOURCE, GENERAL_INTEREST_TARGET } from "@/lib/contact";

const description =
  "Talk to the SaaSassin team about evaluating a product for your team, a migration, contributing, or a comparison that needs updating.";

export const metadata: Metadata = {
  title: "Talk to us",
  description,
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    title: `Talk to us | ${siteConfig.name}`,
    description,
    url: "/contact",
    siteName: siteConfig.name,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Talk to us | ${siteConfig.name}`,
    description,
    images: ["/opengraph-image.png"],
  },
};

export default function ContactPage() {
  return (
    <main className="contact-page">
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <p className="eyebrow">Contact</p>
            <h1>Talk to us.</h1>
          </div>
          <div className="page-hero-aside">
            <p>
              Evaluating a SaaSassin product for your team, planning a migration, or want to build with us? Send a
              note and we will reply by email.
            </p>
            <span className="data-source-badge">
              <Mail aria-hidden="true" /> Replies by email
            </span>
          </div>
        </div>
      </section>

      <section className="section contact-section">
        <div className="shell contact-grid">
          <div className="contact-aside">
            <p className="eyebrow">Other ways in</p>
            <ul>
              <li>
                <a href={sourceRepositories.saasassin} target="_blank" rel="noreferrer">
                  <CodeXml aria-hidden="true" size={16} />
                  Read the source or open an issue on GitHub
                </a>
              </li>
              {comparisons.map((comparison) => (
                <li key={comparison.slug}>
                  <Link href={`/compare/${comparison.slug}`}>
                    <ArrowRight aria-hidden="true" size={16} />
                    {comparison.productName} vs {comparison.competitorName}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/apps">
                  <ArrowRight aria-hidden="true" size={16} />
                  Browse the product fleet
                </Link>
              </li>
            </ul>
          </div>
          <div className="contact-form-panel">
            <p className="eyebrow">Send a message</p>
            <h2>What can we help with?</h2>
            <InterestForm
              target={GENERAL_INTEREST_TARGET}
              targetName="SaaSassin"
              source={CONTACT_PAGE_SOURCE}
              variant="contact"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
