import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * How a product's homepage carries itself. Each brand's home.tsx picks one, so the ten sites share
 * components without sharing a look: kicker treatment, card surface, heading scale and alignment.
 */
export type SiteLook = {
  /** pill: soft rounded label · rule: hairline + text · accent: coloured text · tag: square tag */
  kicker: "pill" | "rule" | "accent" | "tag";
  /** outline: bordered · soft: tinted, borderless · elevated: card with shadow · flat: no surface */
  card: "outline" | "soft" | "elevated" | "flat";
  /** Section heading scale. */
  scale: "md" | "lg" | "xl";
  align: "left" | "center";
};

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

const tones = {
  default: "",
  subtle: "bg-brand-subtle",
  ink: "dark bg-brand-ink text-brand-ink-foreground",
  card: "bg-card",
} as const;

export function Section({
  id,
  tone = "default",
  className,
  children,
}: {
  id?: string;
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-20 sm:py-28", tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function Kicker({ look, children, className }: { look: SiteLook; children: ReactNode; className?: string }) {
  if (look.kicker === "pill") {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold text-foreground/80 shadow-xs backdrop-blur",
          className,
        )}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        {children}
      </p>
    );
  }
  if (look.kicker === "rule") {
    return (
      <p className={cn("flex items-center gap-3 text-sm font-semibold text-primary", className)}>
        <span aria-hidden="true" className="h-px w-8 bg-current" />
        {children}
      </p>
    );
  }
  if (look.kicker === "tag") {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground",
          className,
        )}
      >
        {children}
      </p>
    );
  }
  return <p className={cn("text-sm font-semibold text-primary", className)}>{children}</p>;
}

const titleScale = {
  md: "text-3xl sm:text-4xl",
  lg: "text-3xl sm:text-[2.75rem] sm:leading-[1.08]",
  xl: "text-4xl sm:text-5xl lg:text-[3.5rem] lg:leading-[1.04]",
} as const;

export function SectionHeading({
  look,
  kicker,
  title,
  lede,
  className,
  align,
}: {
  look: SiteLook;
  kicker?: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
  align?: SiteLook["align"];
}) {
  const centered = (align ?? look.align) === "center";
  return (
    <div className={cn("max-w-3xl", centered && "mx-auto text-center", className)}>
      {kicker ? (
        <Kicker look={look} className={cn("mb-4", centered && "justify-center")}>
          {kicker}
        </Kicker>
      ) : null}
      <h2 className={cn("brand-heading leading-[1.1]", titleScale[look.scale])}>{title}</h2>
      {lede ? <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{lede}</p> : null}
    </div>
  );
}

export const cardSurface: Record<SiteLook["card"], string> = {
  outline: "rounded-xl border border-border bg-card",
  soft: "rounded-xl bg-brand-subtle",
  elevated: "rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(0_0_0/0.18)]",
  flat: "",
};

/**
 * Renders `text` with `emphasis` (a substring) wrapped for the brand's treatment: a highlighter
 * stroke, the primary colour, an italic display cut, or a hand-drawn underline.
 */
export function Emphasis({
  text,
  emphasis,
  style,
}: {
  text: string;
  emphasis?: string;
  style: "highlight" | "color" | "italic" | "underline" | "none";
}) {
  if (!emphasis || style === "none" || !text.includes(emphasis)) return <>{text}</>;
  const [before, ...rest] = text.split(emphasis);
  const after = rest.join(emphasis);
  const classes = {
    highlight:
      "brand-highlight -mx-1 px-1",
    color: "text-primary",
    italic: "italic text-primary",
    underline:
      "underline decoration-brand-accent decoration-[0.12em] underline-offset-[0.14em] [text-decoration-skip-ink:none]",
  } as const;
  return (
    <>
      {before}
      <span className={classes[style]}>{emphasis}</span>
      {after}
    </>
  );
}
