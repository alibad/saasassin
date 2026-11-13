import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NavLink } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { Container } from "./primitives";
import { Wordmark } from "./wordmark";

/**
 * The product's top bar: wordmark, section links, Sign in and Get started. `floating` sits as a
 * rounded pill over the hero; `bar` is a full-width sticky strip.
 */
export function SiteNav({
  name,
  mark,
  homeHref,
  links,
  signInHref,
  ctaLabel = "Get started",
  variant = "bar",
  className,
}: {
  name: string;
  mark: ReactNode;
  homeHref: string;
  links: NavLink[];
  signInHref: string;
  ctaLabel?: string;
  variant?: "bar" | "floating";
  className?: string;
}) {
  const inner = (
    <div className="flex h-16 items-center gap-6">
      <Wordmark name={name} mark={mark} href={homeHref} />
      <nav aria-label="Sections" className="hidden flex-1 items-center justify-center gap-7 md:flex">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {link.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <Button asChild variant="ghost" size="lg" className="hidden px-3 sm:inline-flex">
          <Link href={signInHref}>Sign in</Link>
        </Button>
        <Button asChild size="lg" className="px-3.5">
          <Link href={signInHref}>
            {ctaLabel}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );

  if (variant === "floating") {
    return (
      <header className={cn("sticky top-3 z-40 px-3 sm:px-6", className)}>
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-border/70 bg-background/80 px-4 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl sm:px-5">
          {inner}
        </div>
      </header>
    );
  }

  return (
    <header className={cn("sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl", className)}>
      <Container>{inner}</Container>
    </header>
  );
}
