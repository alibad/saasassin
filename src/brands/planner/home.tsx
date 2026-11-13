import { BarChart3, CalendarDays, FileDown, History, Repeat, UsersRound } from "lucide-react";

import { Faq } from "@/components/product-site/faq";
import { Features } from "@/components/product-site/features";
import { FinalCta } from "@/components/product-site/final-cta";
import { Hero } from "@/components/product-site/hero";
import { Importer } from "@/components/product-site/importer";
import { Ownership } from "@/components/product-site/ownership";
import { Container, type SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { productLinks, productRepository } from "@/lib/brand/links";

import { brand } from "./brand";
import { PlannerMark } from "./mark";
import { PlannerPreview } from "./preview";
import { site } from "./site";
import { FocusVisual, LockVisual, WhatIfVisual, WhyHereVisual } from "./visuals";

/** Crisp, fast and dense: calendar-led, tight headings, a hairline grid behind the hero. */
const look: SiteLook = { kicker: "accent", card: "outline", scale: "lg", align: "left" };

function GridBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:48px_48px] opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_30%_0%,black,transparent)]"
    />
  );
}

const extras = [
  { icon: Repeat, title: "Repeating tasks", body: "Daily, weekdays, weekly on chosen days or monthly — each occurrence planned on its own day." },
  { icon: BarChart3, title: "Insights from real work", body: "Planned vs completed hours, deadline hit rate, most-pushed tasks and estimate accuracy." },
  { icon: UsersRound, title: "Team lanes", body: "Admins set capacity and assign work; assigned tasks are planned in that person's lane." },
  { icon: History, title: "History and restore", body: "Every run is a version. Restore an earlier plan without touching the others." },
  { icon: CalendarDays, title: "Your plan as a calendar", body: "Export the plan as .ics, one event per block, to see it in any calendar app." },
  { icon: FileDown, title: "A complete export", body: "Tasks, plans, meetings, settings and audit as JSON, with webhook secrets redacted." },
];

function AlsoIncluded() {
  return (
    <section className="border-y border-border bg-card py-16 sm:py-20">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="brand-heading text-2xl sm:text-3xl">Also in Planner</h2>
          <p className="text-sm text-muted-foreground">Everything here works today, for individuals and teams.</p>
        </div>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {extras.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-card p-5">
              <p className="flex items-center gap-2.5 font-bold">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function PlannerHome() {
  const links = productLinks(brand.slug);
  const mark = <PlannerMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} ctaLabel="Plan your week" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="split"
          emphasis="color"
          backdrop={<GridBackdrop />}
          preview={
            <ProductFrame slug={brand.slug} caption="Planner's week view: tasks scheduled around meetings, a locked block, and the reason a block was placed where it is.">
              <PlannerPreview />
            </ProductFrame>
          }
        />
        <Features
          features={site.features}
          look={look}
          variant="rows"
          visuals={[<WhyHereVisual key="why" />, <LockVisual key="lock" />, <WhatIfVisual key="whatif" />, <FocusVisual key="focus" />]}
        />
        <AlsoIncluded />
        <Steps steps={site.steps} look={look} variant="columns" tone="subtle" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} tone="subtle" />
        <Faq faq={site.faq} look={look} variant="stacked" />
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
