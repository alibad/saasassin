import type { ReactNode } from "react";
import { Check } from "lucide-react";

import type { ProductSite, SiteFeature } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { cardSurface, Section, SectionHeading, type SiteLook } from "./primitives";

function FeatureIcon({ feature, className }: { feature: SiteFeature; className?: string }) {
  const Icon = feature.icon;
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-[calc(var(--radius)*0.9)] bg-primary/10 text-primary dark:bg-primary/15",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function Points({ points }: { points?: string[] }) {
  if (!points?.length) return null;
  return (
    <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
      {points.map((point) => (
        <li key={point} className="flex gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The capabilities section. `grid`: cards in columns · `list`: two columns of icon + text, no
 * surfaces · `rows`: alternating feature rows, each with its own illustration from `visuals`.
 */
export function Features({
  features,
  look,
  variant,
  columns = 3,
  visuals,
  tone,
  id = "features",
}: {
  features: ProductSite["features"];
  look: SiteLook;
  variant: "grid" | "list" | "rows";
  columns?: 2 | 3;
  /** For `rows`: one illustration per feature, in order. */
  visuals?: ReactNode[];
  tone?: "default" | "subtle" | "ink" | "card";
  id?: string;
}) {
  const heading = <SectionHeading look={look} kicker={features.kicker} title={features.title} lede={features.lede} />;

  if (variant === "rows") {
    return (
      <Section id={id} tone={tone}>
        {heading}
        <div className="mt-16 grid gap-16 sm:gap-24">
          {features.items.map((feature, index) => (
            <div
              key={feature.title}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={cn("max-w-lg min-w-0", index % 2 === 1 && "lg:order-2")}>
                <FeatureIcon feature={feature} />
                <h3 className="brand-heading mt-5 text-2xl sm:text-[1.75rem]">{feature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{feature.body}</p>
                <Points points={feature.points} />
              </div>
              <div className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}>{visuals?.[index]}</div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (variant === "list") {
    return (
      <Section id={id} tone={tone}>
        {heading}
        <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {features.items.map((feature) => (
            <div key={feature.title} className="flex gap-5">
              <FeatureIcon feature={feature} className="shrink-0" />
              <div>
                <h3 className="brand-heading text-lg">{feature.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{feature.body}</p>
                <Points points={feature.points} />
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return (
    <Section id={id} tone={tone}>
      {heading}
      <div className={cn("mt-14 grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
        {features.items.map((feature) => (
          <div key={feature.title} className={cn(cardSurface[look.card], "p-6 sm:p-7")}>
            <FeatureIcon feature={feature} />
            <h3 className="brand-heading mt-5 text-lg">{feature.title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{feature.body}</p>
            <Points points={feature.points} />
          </div>
        ))}
      </div>
    </Section>
  );
}
