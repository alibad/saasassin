import { X } from "lucide-react";

import { Faq } from "@/components/product-site/faq";
import { FinalCta } from "@/components/product-site/final-cta";
import { Hero } from "@/components/product-site/hero";
import { Ownership } from "@/components/product-site/ownership";
import { Kicker, Section, SectionHeading, type SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { TrustMark } from "./mark";
import { TrustPreview } from "./preview";
import { site } from "./site";

/** Precise and auditable: hairline grids, monospace identifiers, emerald only where something is verified. */
const look: SiteLook = { kicker: "tag", card: "outline", scale: "lg", align: "left" };

function GridBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_20%,black,transparent)] bg-[size:44px_44px] opacity-70"
    />
  );
}

function HeroFacts() {
  return (
    <dl className="mt-10 grid grid-cols-3 border-y border-border">
      {[
        ["SOC 2", "CC1–CC9 · 33"],
        ["ISO 27001", "Annex A · 15"],
        ["Export", "JSON · package"],
      ].map(([term, detail]) => (
        <div key={term} className="border-r border-border py-3 pr-3 last:border-r-0 [&:not(:first-child)]:pl-3">
          <dt className="text-xs font-semibold">{term}</dt>
          <dd className="brand-mono mt-0.5 text-[11px] text-muted-foreground">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Eight capabilities in a ruled grid, numbered like a control list. */
function FeatureGrid() {
  return (
    <Section id="features">
      <SectionHeading look={look} kicker={site.features.kicker} title={site.features.title} lede={site.features.lede} />
      <div className="mt-14 grid overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card gap-px">
        {site.features.items.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="p-6">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-brand-accent" aria-hidden="true" />
                <span className="brand-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="brand-heading mt-5 text-base">{feature.title}</h3>
              <p className="mt-2 text-[0.92rem] leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const notItems = [
  {
    title: "Not a certification",
    body: "Trust never says you are compliant. Readiness figures are computed from your own records, and the public page labels them as self-reported.",
  },
  {
    title: "Not your auditor",
    body: "An independent audit firm examines your controls and issues the report. Trust keeps their requests, findings and evidence organised.",
  },
  {
    title: "Not automated monitoring — yet",
    body: "There are no cloud or identity connectors and no automated checks today. Your team records evidence and its dates.",
  },
  {
    title: "No file uploads yet",
    body: "Evidence is a link or pasted text. File storage isn't connected, and the app says so where you'd expect an upload.",
  },
];

function WhatItIsNot() {
  return (
    <Section id="not" tone="card" className="border-y border-border">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <Kicker look={look} className="mb-4">
            plain language
          </Kicker>
          <h2 className="brand-heading text-3xl leading-[1.1] sm:text-[2.75rem] sm:leading-[1.08]">What Trust is not</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Compliance tools are easy to over-sell. Here is exactly where Trust stops, so nobody on your team is surprised in front of an auditor.
          </p>
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {notItems.map((item) => (
            <li key={item.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-5">
              <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-[var(--radius)] border border-border text-muted-foreground">
                <X className="size-3.5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function CtaArt() {
  return (
    <div className="absolute top-1/2 -right-10 -translate-y-1/2 opacity-[0.14] sm:right-10">
      <TrustMark size={320} colors={["#E5E7EB", "#34D399", "#0B0F17"]} />
    </div>
  );
}

export function TrustHome() {
  const links = productLinks(brand.slug);
  const mark = <TrustMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="split"
          emphasis="color"
          className="[&_h1]:lg:text-[3.6rem] [&_h1_span]:text-brand-accent"
          backdrop={<GridBackdrop />}
          aside={<HeroFacts />}
          preview={
            <ProductFrame
              slug={brand.slug}
              caption="Trust's readiness overview: control coverage, evidence freshness, the SOC 2 controls table and the gap-task queue."
            >
              <TrustPreview />
            </ProductFrame>
          }
        />
        <FeatureGrid />
        <Steps steps={site.steps} look={look} variant="timeline" tone="subtle" />
        <WhatItIsNot />
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} />
        <Faq faq={site.faq} look={look} variant="split" tone="subtle" />
        <FinalCta cta={site.cta} signInHref={links.signIn} variant="panel" art={<CtaArt />} />
      </main>
      <SiteFooter
        name={brand.name}
        mark={mark}
        homeHref={links.home}
        tagline={site.footer.tagline}
        links={site.nav}
        signInHref={links.signIn}
        repoUrl={productRepository(brand.slug)}
      />
    </>
  );
}
