import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { Container } from "./primitives";

/**
 * The closing call to action. `panel`: a contained block in the brand's ink colour ·
 * `primary`: a block in the primary colour · `open`: centred on the canvas.
 */
export function FinalCta({
  cta,
  signInHref,
  variant = "panel",
  art,
}: {
  cta: ProductSite["cta"];
  signInHref: string;
  variant?: "panel" | "primary" | "open";
  /** Optional decoration drawn inside the panel (e.g. a large mark). */
  art?: ReactNode;
}) {
  const content = (
    <>
      <h2 className="brand-heading text-3xl leading-[1.08] sm:text-5xl">{cta.title}</h2>
      <p className={cn("mt-5 max-w-xl text-lg leading-relaxed", variant === "open" ? "text-muted-foreground" : "opacity-80")}>
        {cta.body}
      </p>
      <Button
        asChild
        size="lg"
        variant={variant === "primary" ? "secondary" : "default"}
        className="mt-9 h-11 px-5 text-[0.95rem]"
      >
        <Link href={signInHref}>
          {cta.label}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      </Button>
    </>
  );

  if (variant === "open") {
    return (
      <section className="py-24 sm:py-32">
        <Container className="flex flex-col items-center text-center">{content}</Container>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div
          className={cn(
            "relative overflow-hidden rounded-[calc(var(--radius)*2)] px-7 py-14 sm:px-14 sm:py-20",
            variant === "panel" ? "dark bg-brand-ink text-brand-ink-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {art ? <div className="pointer-events-none absolute inset-0" aria-hidden="true">{art}</div> : null}
          <div className="relative">{content}</div>
        </div>
      </Container>
    </section>
  );
}
