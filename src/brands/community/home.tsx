import { Check, Crown, ShieldCheck, Smile } from "lucide-react";

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
import { CommunityMark } from "./mark";
import { CommunityPreview } from "./preview";
import { site } from "./site";

/** Warm and social: soft lilac surfaces, generous rounding, a hand-drawn rose underline. */
const look: SiteLook = { kicker: "pill", card: "soft", scale: "xl", align: "center" };

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-[-14rem] left-1/2 h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]" />
      <div className="absolute top-56 right-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-accent)_22%,transparent),transparent)]" />
      <div className="absolute top-80 left-[-10rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--chart-3)_30%,transparent),transparent)]" />
      <span className="absolute top-36 left-[9%] hidden size-5 rounded-full bg-primary/70 lg:block" />
      <span className="absolute top-52 left-[13%] hidden size-3 rounded-full bg-brand-accent lg:block" />
      <span className="absolute top-28 right-[11%] hidden size-4 rounded-full bg-brand-accent/80 lg:block" />
      <span className="absolute top-48 right-[8%] hidden size-6 rounded-full bg-chart-3 lg:block" />
    </div>
  );
}

const roles = [
  {
    icon: Smile,
    title: "Members",
    body: "A friendly feed and a private profile.",
    points: [
      "Pick an @handle; post, reply, react, save and search",
      "RSVP to events and add them to a calendar",
      "Take courses and earn a certificate",
      "Mute or block anyone, privately",
      "Report a post, and appeal a removal once",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Moderators",
    body: "The tools to keep it kind, with reasons on record.",
    points: [
      "Pin posts, close and reopen comments",
      "Remove posts with a reason, and restore them",
      "Work the reports and appeals queues",
      "Check members in at events",
      "Exempt from the posting limit",
    ],
  },
  {
    icon: Crown,
    title: "Owners and admins",
    body: "Shape the place and decide who gets in.",
    points: [
      "Make spaces private to a list, cohorts or a plan",
      "Share, switch off or replace the invite link",
      "Change roles and remove members",
      "Run cohorts and drip course lessons",
      "Import from Circle and export everything",
    ],
  },
];

function Roles() {
  return (
    <Section id="roles">
      <SectionHeading
        look={look}
        kicker="Made for everyone in the room"
        title="Good communities need more than a feed"
        lede="Each role sees exactly what it should — checked on the server for every request."
      />
      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {roles.map(({ icon: Icon, title, body, points }, index) => (
          <div
            key={title}
            data-featured={index === 1 || undefined}
            className="group rounded-[calc(var(--radius)*1.4)] bg-card p-7 ring-1 ring-border data-featured:bg-primary data-featured:text-primary-foreground data-featured:ring-0 data-featured:shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
          >
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary group-data-featured:bg-primary-foreground/15 group-data-featured:text-primary-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="brand-heading mt-5 text-2xl">{title}</h3>
            <p className="mt-1.5 text-muted-foreground group-data-featured:text-primary-foreground/80">{body}</p>
            <ul className="mt-6 grid gap-2.5 text-[0.95rem]">
              {points.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <Check className="mt-1 size-4 shrink-0 text-primary group-data-featured:text-brand-accent" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CtaArt() {
  return (
    <div className="absolute -right-16 -bottom-24 opacity-25 sm:right-0 sm:-bottom-16">
      <CommunityMark size={360} colors={["#FFFFFF", "#F9A8D4", "#C4B5FD"]} />
    </div>
  );
}

export function CommunityHome() {
  const links = productLinks(brand.slug);
  const mark = <CommunityMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} variant="floating" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="centered"
          emphasis="underline"
          backdrop={<Backdrop />}
          preview={
            <ProductFrame
              slug={brand.slug}
              caption="Community's feed: spaces down the side, posts with reactions and replies, and the next event with RSVPs."
            >
              <CommunityPreview />
            </ProductFrame>
          }
        />
        <Roles />
        <Features features={site.features} look={look} variant="grid" tone="card" />
        <Steps steps={site.steps} look={look} variant="columns" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} tone="card" /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} />
        <Faq faq={site.faq} look={look} variant="stacked" tone="card" />
        <FinalCta cta={site.cta} signInHref={links.signIn} variant="primary" art={<CtaArt />} />
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
