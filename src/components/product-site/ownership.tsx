import { ExternalLink, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { cardSurface, Section, SectionHeading, type SiteLook } from "./primitives";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Open source and data ownership: the licence, the repository and what leaves with you. */
export function Ownership({
  ownership,
  look,
  repoUrl,
  tone,
  id = "open-source",
}: {
  ownership: ProductSite["ownership"];
  look: SiteLook;
  repoUrl: string;
  tone?: "default" | "subtle" | "ink" | "card";
  id?: string;
}) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <SectionHeading look={look} kicker={ownership.kicker} title={ownership.title} lede={ownership.body} align="left" />
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="outline" className="h-10 px-4">
              <a href={repoUrl} target="_blank" rel="noreferrer">
                <GitHubIcon />
                Read the source
                <ExternalLink data-icon="inline-end" aria-hidden="true" />
              </a>
            </Button>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Scale className="size-4" aria-hidden="true" />
              Licensed AGPL-3.0
            </span>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {ownership.points.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className={cn(cardSurface[look.card === "flat" ? "outline" : look.card], "p-6")}>
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="brand-heading mt-4 text-base">{point.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{point.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

export { GitHubIcon };
