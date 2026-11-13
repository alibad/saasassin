import Link from "next/link";
import { ArrowRight, Check, FileUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { cardSurface, Kicker, Section, type SiteLook } from "./primitives";

/** "Switching from <tool>?" — only rendered for products whose importer ships today. */
export function Importer({
  importer,
  look,
  signInHref,
  tone,
  id = "switch",
}: {
  importer: NonNullable<ProductSite["importer"]>;
  look: SiteLook;
  signInHref: string;
  tone?: "default" | "subtle" | "ink" | "card";
  id?: string;
}) {
  return (
    <Section id={id} tone={tone}>
      <div
        className={cn(
          cardSurface[look.card === "flat" ? "outline" : look.card],
          "grid gap-10 overflow-hidden p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16 lg:p-14",
        )}
      >
        <div>
          <Kicker look={look} className="mb-4">
            {importer.kicker}
          </Kicker>
          <h2 className="brand-heading text-3xl leading-[1.1] sm:text-4xl">{importer.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{importer.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {importer.formats.map((format) => (
              <Badge key={format} variant="secondary" className="h-6 px-2.5">
                <FileUp aria-hidden="true" />
                {format}
              </Badge>
            ))}
          </div>
          <Button asChild variant="outline" size="lg" className="mt-8 h-10 px-4">
            <Link href={signInHref}>
              Start an import
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <ul className="grid content-center gap-4">
          {importer.points.map((point) => (
            <li key={point} className="flex gap-3 rounded-[var(--radius)] bg-background/70 p-4 ring-1 ring-border">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
