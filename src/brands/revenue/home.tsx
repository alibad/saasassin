import Link from "next/link";
import { ArrowRight, Fingerprint, Link2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Faq } from "@/components/product-site/faq";
import { Features } from "@/components/product-site/features";
import { FinalCta } from "@/components/product-site/final-cta";
import { Importer } from "@/components/product-site/importer";
import { Ownership } from "@/components/product-site/ownership";
import { Container, Section, SectionHeading, type SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { RevenueMark } from "./mark";
import { RevenuePreview } from "./preview";
import { site } from "./site";

/** Confident and data-led: a navy band, gold emphasis, spec-sheet definitions. */
const look: SiteLook = { kicker: "accent", card: "outline", scale: "lg", align: "left" };

const metrics = [
  ["Talk ratio", "Each speaker's share of the conversation, per call and averaged per rep."],
  ["Longest monologue", "The longest uninterrupted stretch by a single speaker."],
  ["Questions", "Questions asked in the call, counted per speaker."],
  ["Interactivity", "Speaker switches per minute, scaled from 0 to 10."],
  ["Next steps", "Commitments found by named phrase rules, each linked to its moment."],
  ["Tracker hits", "Your keywords and competitors, with the timestamp of every mention."],
];

const risks = [
  ["No calls", "An open deal has no logged call."],
  ["Gone quiet", "No call within the number of days you set."],
  ["No next step", "The latest call has no detected next step."],
  ["Competitor mentioned", "A competitor tracker fired in the latest call."],
  ["Close date passed", "The deal is open past its close date."],
  ["Single-threaded", "Calls have heard exactly one linked customer contact."],
  ["Stalled in stage", "Longer in one stage than your threshold (30 days by default)."],
];

function splitTitle(text: string, emphasis?: string) {
  if (!emphasis || !text.includes(emphasis)) return <>{text}</>;
  const [before, after] = text.split(emphasis);
  return (
    <>
      {before}
      <span className="text-brand-accent">{emphasis}</span>
      {after}
    </>
  );
}

function NavyHero({ signInHref }: { signInHref: string }) {
  const { hero } = site;
  return (
    <>
      <section className="relative overflow-hidden bg-brand-ink text-brand-ink-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-[-10%] size-[620px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-accent)_28%,transparent),transparent_65%)]"
        />
        <Container className="relative pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
            <div>
              <p className="text-sm font-semibold text-brand-accent">{hero.kicker}</p>
              <h1 className="brand-heading mt-5 text-[2.5rem] leading-[1.06] sm:text-6xl lg:text-[3.9rem]">
                {splitTitle(hero.title, hero.emphasis)}
              </h1>
            </div>
            <div>
              <p className="text-lg leading-relaxed text-brand-ink-foreground/75 sm:text-xl">{hero.lede}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 bg-brand-accent px-5 text-[0.95rem] text-brand-accent-foreground hover:bg-brand-accent/90">
                  <Link href={signInHref}>
                    {hero.primaryCta}
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Link>
                </Button>
                {hero.secondaryCta ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-11 border-white/25 bg-transparent px-5 text-[0.95rem] text-brand-ink-foreground hover:bg-white/10 hover:text-brand-ink-foreground dark:bg-transparent"
                  >
                    <a href={hero.secondaryCta.href}>{hero.secondaryCta.label}</a>
                  </Button>
                ) : null}
              </div>
              {hero.note ? <p className="mt-4 text-sm text-brand-ink-foreground/65">{hero.note}</p> : null}
            </div>
          </div>
        </Container>
      </section>
      <div className="bg-[linear-gradient(to_bottom,var(--brand-ink)_0,var(--brand-ink)_38%,var(--background)_38%)]">
        <Container>
          <ProductFrame
            slug={brand.slug}
            caption="Revenue's call page: talk ratio, call stats and a transcript with tracker hits beside the deal's risk signals."
          >
            <RevenuePreview />
          </ProductFrame>
        </Container>
      </div>
    </>
  );
}

function ProofStrip() {
  const proofs = [
    { icon: ShieldCheck, title: "Consent first", body: "No transcript is stored without a jurisdiction, a consent basis and an all-party confirmation." },
    { icon: Fingerprint, title: "Deterministic", body: "Rules, not guesses: the same transcript always produces the same analysis." },
    { icon: Link2, title: "Evidence-linked", body: "Every metric, risk and next step jumps to the moment in the call that caused it." },
  ];
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <ul className="grid gap-8 border-y border-border py-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
          {proofs.map(({ icon: Icon, title, body }) => (
            <li key={title} className="sm:px-8 sm:first:pl-0 sm:last:pr-0">
              <Icon className="size-5 text-chart-5" aria-hidden="true" />
              <p className="brand-heading mt-4 text-lg">{title}</p>
              <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Definitions() {
  return (
    <Section id="definitions" tone="subtle">
      <SectionHeading
        look={look}
        kicker="How the numbers work"
        title="Every metric and risk has a written definition"
        lede="The same definitions sit next to the numbers in the product, so a rep can see exactly why a deal is flagged."
      />
      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <p className="border-b border-border px-6 py-4 text-sm font-semibold">Call metrics</p>
          <dl className="divide-y divide-border">
            {metrics.map(([term, definition]) => (
              <div key={term} className="grid gap-1 px-6 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6">
                <dt className="brand-heading text-[0.95rem]">{term}</dt>
                <dd className="text-[0.95rem] leading-relaxed text-muted-foreground">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <p className="border-b border-border px-6 py-4 text-sm font-semibold">Deal risk rules</p>
          <dl className="divide-y divide-border">
            {risks.map(([term, definition]) => (
              <div key={term} className="grid gap-1 px-6 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6">
                <dt className="brand-heading flex items-center gap-2 text-[0.95rem]">
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-chart-5" />
                  {term}
                </dt>
                <dd className="text-[0.95rem] leading-relaxed text-muted-foreground">
                  <span className="sr-only">Fires when: </span>
                  {definition}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}

function WaveformArt() {
  const bars = [22, 38, 30, 52, 44, 66, 58, 80, 72, 96];
  return (
    <div className="absolute right-8 bottom-0 hidden items-end gap-3 opacity-90 md:flex">
      {bars.map((height, index) => (
        <span
          key={index}
          className={
            index === bars.length - 1
              ? "w-5 rounded-t-full bg-brand-accent dark:bg-primary-foreground"
              : "w-5 rounded-t-full bg-primary-foreground/12"
          }
          style={{ height: `${height * 2.4}px` }}
        />
      ))}
    </div>
  );
}

export function RevenueHome() {
  const links = productLinks(brand.slug);
  const mark = <RevenueMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} />
      <main>
        <NavyHero signInHref={links.signIn} />
        <ProofStrip />
        <Features features={site.features} look={look} variant="grid" columns={3} />
        <Definitions />
        <Steps steps={site.steps} look={look} variant="timeline" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} tone="subtle" /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} />
        <Faq faq={site.faq} look={look} variant="split" tone="subtle" />
        <FinalCta cta={site.cta} signInHref={links.signIn} variant="primary" art={<WaveformArt />} />
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
