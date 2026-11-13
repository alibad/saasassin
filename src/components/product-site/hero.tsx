import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { Container, Emphasis, Kicker, type SiteLook } from "./primitives";

type HeroProps = {
  hero: ProductSite["hero"];
  look: SiteLook;
  signInHref: string;
  preview: ReactNode;
  /** split: copy beside the preview · centered: copy over a full-width preview · editorial: oversized headline, preview below */
  variant: "split" | "centered" | "editorial";
  emphasis: "highlight" | "color" | "italic" | "underline" | "none";
  /** Optional background art (gradients, shapes) drawn behind the hero. */
  backdrop?: ReactNode;
  /** Optional row under the CTAs (keyboard hints, format chips). */
  aside?: ReactNode;
  className?: string;
};

function Actions({ hero, signInHref, centered }: { hero: ProductSite["hero"]; signInHref: string; centered: boolean }) {
  return (
    <div className={cn("mt-9 flex flex-wrap items-center gap-3", centered && "justify-center")}>
      <Button asChild size="lg" className="h-11 px-5 text-[0.95rem]">
        <Link href={signInHref}>
          {hero.primaryCta}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      </Button>
      {hero.secondaryCta ? (
        <Button asChild size="lg" variant="outline" className="h-11 px-5 text-[0.95rem]">
          <a href={hero.secondaryCta.href}>{hero.secondaryCta.label}</a>
        </Button>
      ) : null}
    </div>
  );
}

export function Hero({ hero, look, signInHref, preview, variant, emphasis, backdrop, aside, className }: HeroProps) {
  const title = <Emphasis text={hero.title} emphasis={hero.emphasis} style={emphasis} />;
  const note = hero.note ? <p className="mt-4 text-sm text-muted-foreground">{hero.note}</p> : null;

  if (variant === "split") {
    return (
      <section className={cn("relative overflow-hidden pt-14 pb-20 sm:pt-20 lg:pb-28", className)}>
        {backdrop}
        <Container className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="max-w-xl min-w-0">
            <Kicker look={look} className="mb-6">
              {hero.kicker}
            </Kicker>
            <h1 className="brand-heading text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.1rem]">{title}</h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">{hero.lede}</p>
            <Actions hero={hero} signInHref={signInHref} centered={false} />
            {note}
            {aside}
          </div>
          <div className="relative min-w-0 lg:-mr-24 xl:-mr-40">{preview}</div>
        </Container>
      </section>
    );
  }

  if (variant === "editorial") {
    return (
      <section className={cn("relative overflow-hidden pt-16 pb-20 sm:pt-24", className)}>
        {backdrop}
        <Container className="relative">
          <Kicker look={look} className="mb-8">
            {hero.kicker}
          </Kicker>
          <h1 className="brand-heading max-w-5xl text-[2.9rem] leading-[1.02] sm:text-7xl lg:text-[5.6rem]">{title}</h1>
          <div className="mt-10 grid gap-8 border-t border-border pt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{hero.lede}</p>
            <div>
              <Actions hero={hero} signInHref={signInHref} centered={false} />
            </div>
          </div>
          {note}
          {aside}
          <div className="mt-14 sm:mt-20">{preview}</div>
        </Container>
      </section>
    );
  }

  return (
    <section className={cn("relative overflow-hidden pt-16 pb-20 sm:pt-24", className)}>
      {backdrop}
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Kicker look={look} className="mb-6 justify-center">
            {hero.kicker}
          </Kicker>
          <h1 className="brand-heading text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.25rem]">{title}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{hero.lede}</p>
          <Actions hero={hero} signInHref={signInHref} centered />
          {note}
          {aside}
        </div>
        <div className="mx-auto mt-14 max-w-[1080px] sm:mt-16">{preview}</div>
      </Container>
    </section>
  );
}
