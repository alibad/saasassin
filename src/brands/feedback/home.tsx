import { Faq } from "@/components/product-site/faq";
import { Features } from "@/components/product-site/features";
import { FinalCta } from "@/components/product-site/final-cta";
import { Hero } from "@/components/product-site/hero";
import { Importer } from "@/components/product-site/importer";
import { Ownership } from "@/components/product-site/ownership";
import { Section, SectionHeading, type SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { Progress } from "@/components/ui/progress";
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { FeedbackMark } from "./mark";
import { FeedbackPreview, StatusPill, VoteBox } from "./preview";
import { site } from "./site";

/** Friendly and open: centred, airy, rounded elevated cards, teal with a sunny accent. */
const look: SiteLook = { kicker: "pill", card: "elevated", scale: "lg", align: "center" };

function SunBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-56 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--chart-1)_16%,transparent),transparent)]" />
    </div>
  );
}

/** The public roadmap, grouped into a release with shipped progress. Sample data. */
function RoadmapShowcase() {
  const columns = [
    {
      status: "Planned" as const,
      cards: [
        { title: "Offline mode for the mobile app", votes: 142 },
        { title: "Templates for meeting notes", votes: 48 },
      ],
    },
    {
      status: "In progress" as const,
      cards: [
        { title: "Share a notebook with a read-only link", votes: 97 },
        { title: "Faster search in large notebooks", votes: 39 },
      ],
    },
    {
      status: "Completed" as const,
      cards: [
        { title: "Markdown tables", votes: 64 },
        { title: "Dark mode on Android", votes: 58 },
      ],
    },
  ];
  return (
    <Section id="roadmap" tone="subtle">
      <SectionHeading
        look={look}
        kicker="Public roadmap"
        title="A roadmap people can follow"
        lede="Every roadmap item links back to the idea and its votes. Group work into releases and the public page shows how much has shipped."
      />
      <div inert className="mx-auto mt-14 max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[calc(var(--radius)*1.2)] border border-border bg-card px-5 py-4 shadow-xs">
          <p className="brand-heading">Release · Winter update</p>
          <p className="text-sm text-muted-foreground">Target Dec 15</p>
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <Progress value={50} className="flex-1" />
            <span className="text-sm font-semibold tabular-nums">2 of 4 shipped</span>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.status} className="rounded-[calc(var(--radius)*1.2)] bg-card/60 p-3 ring-1 ring-border">
              <div className="flex items-center justify-between px-1 pb-3">
                <StatusPill status={column.status} />
                <span className="text-xs text-muted-foreground">{column.cards.length} ideas</span>
              </div>
              <ul className="grid gap-2.5">
                {column.cards.map((card) => (
                  <li key={card.title} className="flex items-center gap-3 rounded-[12px] border border-border bg-card p-3 text-sm shadow-xs">
                    <VoteBox votes={card.votes} className="w-11" />
                    <span className="font-semibold leading-snug">{card.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function FeedbackHome() {
  const links = productLinks(brand.slug);
  const mark = <FeedbackMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} ctaLabel="Create your board" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="centered"
          emphasis="color"
          backdrop={<SunBackdrop />}
          preview={
            <ProductFrame slug={brand.slug} caption="A Feedback board: ideas with vote counts and statuses beside the public roadmap.">
              <FeedbackPreview />
            </ProductFrame>
          }
        />
        <Features features={site.features} look={look} variant="grid" />
        <RoadmapShowcase />
        <Steps steps={site.steps} look={look} variant="columns" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} tone="subtle" /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} />
        <Faq faq={site.faq} look={look} variant="stacked" tone="subtle" />
        <FinalCta cta={site.cta} signInHref={links.signIn} variant="panel" />
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
