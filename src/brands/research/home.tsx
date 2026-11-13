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
import { ResearchMark } from "./mark";
import { ResearchPreview } from "./preview";
import { site } from "./site";

/** Editorial and calm: a big serif headline, ruled sections and a pull-quote, like a journal. */
const look: SiteLook = { kicker: "rule", card: "outline", scale: "xl", align: "left" };

function PullQuote() {
  return (
    <section className="border-y border-border bg-card py-20 sm:py-28">
      <Container className="grid gap-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-16">
        <ResearchMark size={72} className="hidden md:block" />
        <figure>
          <blockquote className="brand-heading max-w-4xl text-3xl leading-[1.18] italic sm:text-[2.6rem]">
            An insight without evidence is an opinion.{" "}
            <span className="brand-highlight not-italic">
              Research won&rsquo;t save one.
            </span>
          </blockquote>
          <figcaption className="mt-6 text-sm text-muted-foreground">
            Every insight must cite at least one highlight, and that link survives corrections, redactions and exports.
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}

export function ResearchHome() {
  const links = productLinks(brand.slug);
  const mark = <ResearchMark />;
  return (
    <>
      <SiteNav name={brand.name} mark={mark} homeHref={links.home} links={site.nav} signInHref={links.signIn} ctaLabel="Get started" />
      <main>
        <Hero
          hero={site.hero}
          look={look}
          signInHref={links.signIn}
          variant="editorial"
          emphasis="highlight"
          preview={
            <ProductFrame slug={brand.slug} caption="Research's project view: a transcript with tagged highlights beside the insight they support.">
              <ResearchPreview />
            </ProductFrame>
          }
        />
        <PullQuote />
        <Features features={site.features} look={look} variant="list" />
        <Steps steps={site.steps} look={look} variant="timeline" tone="subtle" />
        {site.importer ? <Importer importer={site.importer} look={look} signInHref={links.signIn} /> : null}
        <Ownership ownership={site.ownership} look={look} repoUrl={productRepository(brand.slug)} tone="subtle" />
        <Faq faq={site.faq} look={look} variant="split" />
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
