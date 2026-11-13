import { Award, Check, PlayCircle } from "lucide-react";

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
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { CreatorMark } from "./mark";
import { CreatorPreview } from "./preview";
import { site } from "./site";

/** Expressive and warm: big serif display type, soft peach and fuchsia light, rounded soft cards. */
const look: SiteLook = { kicker: "pill", card: "soft", scale: "xl", align: "center" };

function GlowBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-48 left-1/2 h-[640px] w-[1000px] -translate-x-[72%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-accent)_50%,transparent),transparent)]" />
      <div className="absolute -top-32 left-1/2 h-[600px] w-[900px] -translate-x-[18%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--chart-1)_24%,transparent),transparent)]" />
    </div>
  );
}

/** What learners see: a course landing page and the certificate at the end. Sample data. */
function LearnerShowcase() {
  return (
    <Section id="learners" tone="subtle">
      <SectionHeading
        look={look}
        kicker="What your learners get"
        title="A course that feels like yours"
        lede="A landing page to enroll from, lessons that unlock on schedule, and a certificate when they finish."
      />
      <div inert className="mt-14 grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-border bg-card shadow-[0_24px_48px_-28px_rgb(0_0_0/0.3)]">
          <div className="h-36 bg-[radial-gradient(120%_120%_at_10%_0%,var(--brand-accent)_0%,transparent_60%),radial-gradient(90%_120%_at_95%_100%,var(--chart-1)_0%,transparent_55%),linear-gradient(var(--secondary),var(--secondary))] sm:h-44" />
          <div className="p-6 sm:p-7">
            <p className="text-xs font-semibold text-muted-foreground">Studio Juniper · course</p>
            <p className="brand-heading mt-1 text-3xl">Watercolour Basics</p>
            <p className="mt-2 text-muted-foreground">Six lessons from your first wash to a finished piece. New lessons unlock every few days.</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {["Your first wash", "Mixing colours", "Painting skies"].map((lesson) => (
                <li key={lesson} className="flex items-center gap-2">
                  <PlayCircle className="size-4 text-primary" aria-hidden="true" />
                  {lesson}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 items-center rounded-[12px] bg-primary px-5 font-medium text-primary-foreground">Enroll for free</span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-4" aria-hidden="true" />
                Join the email list (optional)
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-[calc(var(--radius)*1.6)] border-2 border-[color-mix(in_oklab,var(--brand-accent)_70%,transparent)] bg-card p-8 text-center shadow-[0_24px_48px_-28px_rgb(0_0_0/0.3)]">
          <Award className="mx-auto size-9 text-primary" aria-hidden="true" />
          <p className="mt-4 text-xs font-semibold text-muted-foreground">Certificate of completion</p>
          <p className="brand-heading mt-3 text-4xl italic">Priya Shah</p>
          <p className="mt-3 text-muted-foreground">has completed every lesson of</p>
          <p className="brand-heading mt-1 text-2xl">Watercolour Basics</p>
          <div className="mx-auto mt-6 h-px w-24 bg-border" />
          <p className="mt-3 text-xs text-muted-foreground">Studio Juniper</p>
        </div>
      </div>
    </Section>
  );
}

export function CreatorHome() {
  const links = productLinks(brand.slug);
  const mark = <CreatorMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} variant="floating" ctaLabel="Start teaching" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="centered"
          emphasis="italic"
          backdrop={<GlowBackdrop />}
          preview={
            <ProductFrame slug={brand.slug} caption="Creator's course builder: a curriculum with drip days, a lesson with video and a quiz, and learner progress.">
              <CreatorPreview />
            </ProductFrame>
          }
        />
        <Features features={site.features} look={look} variant="grid" />
        <LearnerShowcase />
        <Steps steps={site.steps} look={look} variant="columns" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} tone="card" />
        <Faq faq={site.faq} look={look} variant="stacked" tone="subtle" />
        <FinalCta cta={site.cta} signInHref={links.signIn} variant="primary" />
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
