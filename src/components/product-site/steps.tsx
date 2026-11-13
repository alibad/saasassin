import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { cardSurface, Section, SectionHeading, type SiteLook } from "./primitives";

/**
 * How it works. `columns`: numbered steps side by side · `timeline`: a vertical line of steps
 * beside the heading.
 */
export function Steps({
  steps,
  look,
  variant,
  tone,
  id = "how-it-works",
}: {
  steps: ProductSite["steps"];
  look: SiteLook;
  variant: "columns" | "timeline";
  tone?: "default" | "subtle" | "ink" | "card";
  id?: string;
}) {
  if (variant === "timeline") {
    return (
      <Section id={id} tone={tone}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading look={look} kicker={steps.kicker} title={steps.title} lede={steps.lede} align="left" />
          </div>
          <ol className="relative grid gap-9 border-l border-border pl-8 sm:pl-10">
            {steps.items.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-0 -left-[calc(2rem+1px)] flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-primary sm:-left-[calc(2.5rem+1px)]"
                >
                  {index + 1}
                </span>
                <h3 className="brand-heading text-lg sm:text-xl">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    );
  }

  return (
    <Section id={id} tone={tone}>
      <SectionHeading look={look} kicker={steps.kicker} title={steps.title} lede={steps.lede} />
      <ol
        className={cn(
          "mt-14 grid gap-4 sm:grid-cols-2",
          steps.items.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
        {steps.items.map((step, index) => (
          <li key={step.title} className={cn(cardSurface[look.card === "flat" ? "outline" : look.card], "p-6")}>
            <span className="brand-heading text-sm text-primary">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="brand-heading mt-3 text-lg">{step.title}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
