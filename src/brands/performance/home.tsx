import { EyeOff, Lock, UserRound } from "lucide-react";

import { Faq } from "@/components/product-site/faq";
import { Features } from "@/components/product-site/features";
import { FinalCta } from "@/components/product-site/final-cta";
import { Hero } from "@/components/product-site/hero";
import { Ownership } from "@/components/product-site/ownership";
import { Section, SectionHeading, type SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { PerformanceMark } from "./mark";
import { PerformancePreview } from "./preview";
import { site } from "./site";

/** Warm, human, fair: a soft serif, rounded cards, organic shapes, never cold dashboards. */
const look: SiteLook = { kicker: "pill", card: "elevated", scale: "xl", align: "left" };

function Leaves({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <PerformanceMark size={640} className="opacity-[0.07] dark:opacity-[0.1]" />
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 -left-40 h-[520px] w-[520px] rounded-full bg-brand-accent/25 blur-[110px]" />
      <div className="absolute top-40 right-[-12%] h-[560px] w-[640px] rounded-full bg-primary/15 blur-[120px]" />
    </div>
  );
}

const packet = [
  { who: "Manager review", by: "Priya Shah, Engineering Manager", icon: UserRound, note: "Attributed" },
  { who: "Self review", by: "Ana López", icon: UserRound, note: "Attributed" },
  { who: "Peer 1 · Peer 2 · Peer 3", by: "Three teammates", icon: EyeOff, note: "Anonymised" },
  { who: "Upward feedback", by: "2 of 3 responses received", icon: Lock, note: "Withheld" },
];

function FairPackets() {
  return (
    <Section id="fair" tone="subtle">
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <SectionHeading
          look={look}
          kicker="Built to protect people"
          title="Withheld, not averaged"
          lede="Averaging two answers can still identify who wrote them. When fewer people respond than the cycle's minimum, Performance withholds those responses entirely — and the packet says how many came in and how many were needed."
          align="left"
        />
        <div className="relative">
          <div className="absolute -inset-3 rounded-[2rem] bg-brand-accent/20 blur-2xl sm:-inset-6" aria-hidden="true" />
          <div className="relative rounded-[calc(var(--radius)*1.8)] border border-border bg-card p-6 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.35)] sm:p-8">
            <p className="text-sm text-muted-foreground">Review packet · Fall 2026</p>
            <p className="brand-heading mt-1 text-2xl">Ana López</p>
            <ul className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3">
              {packet.map((item) => {
                const Icon = item.icon;
                const withheld = item.note === "Withheld";
                return (
                  <li
                    key={item.who}
                    className={`flex items-center gap-3 rounded-[var(--radius)] border p-3 sm:gap-4 sm:p-4 ${withheld ? "border-dashed border-brand-accent bg-brand-accent/10" : "border-border bg-background"}`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{item.who}</span>
                      <span className="block truncate text-sm text-muted-foreground">{item.by}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-xs font-semibold text-primary">{item.note}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">Calibration notes are never part of a packet.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PerformanceHome() {
  const links = productLinks(brand.slug);
  const mark = <PerformanceMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} variant="floating" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="split"
          emphasis="italic"
          backdrop={<Backdrop />}
          preview={
            <ProductFrame
              slug={brand.slug}
              chrome="bare"
              caption="Performance's Reviews tab: a cycle in its writing phase, progress by direction and a preview of the next phase."
            >
              <PerformancePreview />
            </ProductFrame>
          }
        />
        <Features features={site.features} look={look} variant="grid" />
        <FairPackets />
        <Steps steps={site.steps} look={look} variant="timeline" />
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} tone="subtle" />
        <Faq faq={site.faq} look={look} variant="split" />
        <FinalCta
          cta={site.cta}
          signInHref={links.signIn}
          variant="primary"
          art={<Leaves className="absolute -right-24 -bottom-40 [&_svg]:opacity-20" />}
        />
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
