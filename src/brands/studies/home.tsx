import type { ReactNode } from "react";
import { Ban, CircleCheck, Flag, ListTree, Lock, Quote, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Faq } from "@/components/product-site/faq";
import { Features } from "@/components/product-site/features";
import { FinalCta } from "@/components/product-site/final-cta";
import { Hero } from "@/components/product-site/hero";
import { Importer } from "@/components/product-site/importer";
import { Ownership } from "@/components/product-site/ownership";
import type { SiteLook } from "@/components/product-site/primitives";
import { ProductFrame } from "@/components/product-site/product-frame";
import { SiteFooter } from "@/components/product-site/site-footer";
import { SiteNav } from "@/components/product-site/site-nav";
import { Steps } from "@/components/product-site/steps";
import { productLinks, productRepository } from "@/lib/brand/links";
import { cn } from "@/lib/utils";

import { brand } from "./brand";
import { StudiesMark } from "./mark";
import { StudiesPreview } from "./preview";
import { site } from "./site";

/** Playful but precise: geometric rings and dots, pill labels, measured result panels. */
const look: SiteLook = { kicker: "pill", card: "outline", scale: "lg", align: "left" };

/** Target rings and confetti dots in sky and coral, drawn behind the hero. */
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute -top-56 -right-48 size-[760px] text-primary opacity-[0.14]" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="48" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="24" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="absolute top-28 left-[46%] hidden size-3 rounded-full bg-brand-accent lg:block" />
      <span className="absolute top-[62%] left-[3%] hidden size-5 rounded-full border-[3px] border-primary/40 lg:block" />
      <span className="absolute top-16 left-[8%] size-2 rounded-full bg-primary/50" />
      <span className="absolute bottom-24 left-[38%] hidden size-2.5 rotate-45 bg-brand-accent/70 lg:block" />
      <span className="absolute top-[38%] right-[4%] hidden size-4 rounded-full bg-brand-accent/80 lg:block" />
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-y-4 inset-x-0 rounded-[calc(var(--radius)*3)] blur-2xl sm:-inset-6 bg-[radial-gradient(circle_at_85%_15%,color-mix(in_oklab,var(--brand-accent)_18%,transparent),transparent_55%),radial-gradient(circle_at_10%_90%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_60%)]" />
      <div
        inert
        className={cn(
          "relative rounded-[calc(var(--radius)*1.4)] border border-border bg-card p-5 text-[13px] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.35)] sm:p-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function BlocksVisual() {
  const rows = [
    ["Welcome & consent", "Intro"],
    ["How often do you order?", "Multiple choice"],
    ["Rate checkout today", "Opinion scale"],
    ["Find the delivery address", "Tree test"],
    ["Group the help topics", "Card sort"],
  ];
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Checkout navigation</span>
        <Badge variant="secondary" className="text-[10px]">
          <Lock aria-hidden="true" />
          v3 frozen at publish
        </Badge>
      </div>
      <ol className="mt-4 grid gap-2">
        {rows.map(([label, type], index) => (
          <li key={label} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span>
            <span className="truncate">{label}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{type}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-muted-foreground">Skip logic: if “Never” on block 2 → end with screen-out.</p>
    </Panel>
  );
}

function TreeVisual() {
  const tasks = [
    ["Find a return label", 86, 74, "18 s"],
    ["Change the delivery address", 72, 58, "24 s"],
    ["Contact support about a refund", 41, 29, "51 s"],
  ] as const;
  return (
    <Panel>
      <div className="flex items-center gap-2 font-semibold">
        <ListTree className="size-4 text-primary" aria-hidden="true" />
        Tree test results
      </div>
      <ul className="mt-4 grid gap-4">
        {tasks.map(([task, success, direct, time]) => (
          <li key={task}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate">{task}</span>
              <span className="brand-heading shrink-0 text-lg tabular-nums">{success}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${success}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              Success · {direct}% direct · median {time}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function QualityVisual() {
  const sessions = [
    { id: "#A3F2", reason: "Speeder — 38 s against a 2 min 10 s median", icon: Flag },
    { id: "#B71C", reason: "Straight-lining — same rating on 4 scales", icon: Flag },
    { id: "#C20E", reason: "Empty or junk open text", icon: TriangleAlert },
  ];
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Sessions needing a decision</span>
        <span className="text-[11px] text-muted-foreground">3 flagged of 38</span>
      </div>
      <ul className="mt-4 grid gap-2.5">
        {sessions.map(({ id, reason, icon: Icon }) => (
          <li key={id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-brand-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">Session {id}</p>
                <p className="text-[12px] text-muted-foreground">{reason}</p>
              </div>
              <div className="ml-auto flex shrink-0 gap-1.5 text-[11px]">
                <span className="rounded-md border border-border px-2 py-1">Keep</span>
                <span className="rounded-md bg-foreground px-2 py-1 text-background">Exclude…</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Ban className="size-3.5" aria-hidden="true" />
        Excluding asks for a reason, and both choices go in the audit log.
      </p>
    </Panel>
  );
}

function FindingVisual() {
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-brand-accent text-[10px] text-brand-accent-foreground">High severity</Badge>
        <Badge variant="outline" className="text-[10px]">Open</Badge>
      </div>
      <p className="brand-heading mt-3 text-[19px] leading-snug">The address change is buried under Orders</p>
      <p className="mt-2 text-muted-foreground">
        Most people looked under Account → Addresses first, and a fifth gave up on the task.
      </p>
      <p className="mt-4 text-[11px] font-semibold text-muted-foreground">Evidence</p>
      <ul className="mt-2 grid gap-2">
        <li className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2.5">
          <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Block 4 · Task 2 — 72% success, 58% direct</span>
        </li>
        <li className="flex gap-2.5 rounded-lg border border-border bg-background p-2.5">
          <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Session #D09A · Open text: <span className="italic">&ldquo;I went to Addresses and it only had my saved ones.&rdquo;</span>
          </span>
        </li>
      </ul>
    </Panel>
  );
}

export function StudiesHome() {
  const links = productLinks(brand.slug);
  const mark = <StudiesMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="split"
          emphasis="underline"
          backdrop={<Backdrop />}
          preview={
            <ProductFrame slug={brand.slug} caption="Studies' study builder: a tree-test task beside its success, directness and outcome results.">
              <StudiesPreview />
            </ProductFrame>
          }
        />
        <Features
          features={site.features}
          look={look}
          variant="rows"
          tone="subtle"
          visuals={[<BlocksVisual key="blocks" />, <TreeVisual key="tree" />, <QualityVisual key="quality" />, <FindingVisual key="finding" />]}
        />
        <Steps steps={site.steps} look={look} variant="columns" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} tone="subtle" /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} />
        <Faq faq={site.faq} look={look} variant="split" tone="subtle" />
        <FinalCta
          cta={site.cta}
          signInHref={links.signIn}
          variant="primary"
          art={
            <svg className="absolute -right-24 -bottom-32 size-[420px] text-primary-foreground opacity-15" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="2" />
              <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="2" />
              <circle cx="100" cy="100" r="32" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
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
