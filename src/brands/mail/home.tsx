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
import { MailMark } from "./mark";
import { Key, MailPreview } from "./preview";
import { site } from "./site";

/** Sleek and keyboard-led: dark by default, red only where it matters, keys everywhere. */
const look: SiteLook = { kicker: "accent", card: "outline", scale: "lg", align: "left" };

const shortcuts: { keys: string[]; action: string }[] = [
  { keys: ["j", "k"], action: "Next and previous thread" },
  { keys: ["e"], action: "Mark done" },
  { keys: ["h"], action: "Snooze until…" },
  { keys: ["f"], action: "Follow up if no reply" },
  { keys: ["m"], action: "Mute the thread" },
  { keys: ["l"], action: "Label" },
  { keys: ["x"], action: "Select, then act on many" },
  { keys: ["#"], action: "Trash (with a confirm)" },
  { keys: ["r"], action: "Reply" },
  { keys: ["/"], action: "Search with operators" },
  { keys: ["z"], action: "Undo, exactly" },
  { keys: ["⌘", "K"], action: "Everything else" },
];

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 right-[-10%] h-[520px] w-[720px] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_5%,transparent)_1px,transparent_1px)] bg-[size:72px_100%] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
    </div>
  );
}

function HeroKeys() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
      {[
        [["j", "k"], "move"],
        [["e"], "done"],
        [["h"], "snooze"],
        [["/"], "search"],
      ].map(([keys, label]) => (
        <span key={String(label)} className="flex items-center gap-1.5">
          {(keys as string[]).map((key) => (
            <Key key={key} className="h-6 min-w-6 text-xs">
              {key}
            </Key>
          ))}
          <span>{String(label)}</span>
        </span>
      ))}
    </div>
  );
}

function Shortcuts() {
  return (
    <Section id="shortcuts" tone="subtle">
      <SectionHeading
        look={look}
        kicker="Shortcuts"
        title="Your hands never leave the keyboard"
        lede="Every action has a key. The command palette lists all of them, so you never have to memorise more than j, k and e on day one."
      />
      <div className="mt-12 grid gap-px overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.action} className="flex items-center gap-4 bg-background px-5 py-4">
            <span className="flex min-w-16 gap-1">
              {shortcut.keys.map((key) => (
                <Key key={key} className="h-7 min-w-7 text-[13px]">
                  {key}
                </Key>
              ))}
            </span>
            <span className="text-[0.95rem]">{shortcut.action}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function MailHome() {
  const links = productLinks(brand.slug);
  const mark = <MailMark />;
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
          backdrop={<Backdrop />}
          aside={<HeroKeys />}
          preview={
            <ProductFrame slug={brand.slug} caption="Mail's inbox: split tabs, a keyboard-selected thread, the reading pane and the command palette.">
              <MailPreview />
            </ProductFrame>
          }
        />
        <Shortcuts />
        <Features features={site.features} look={look} variant="grid" />
        <Steps steps={site.steps} look={look} variant="columns" tone="subtle" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} tone="subtle" />
        <Faq faq={site.faq} look={look} variant="stacked" />
        <FinalCta
          cta={site.cta}
          signInHref={links.signIn}
          variant="panel"
          art={
            <>
              <div className="absolute -right-24 -bottom-40 h-96 w-[560px] rounded-full bg-primary/35 blur-[100px]" />
              <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-border" />
            </>
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
