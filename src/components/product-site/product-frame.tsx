import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A real screenshot of the product, when one has been captured into
 * public/products/<slug>/hero.webp; null until then.
 */
function heroScreenshot(slug: string) {
  const relative = `/products/${slug}/hero.webp`;
  return fs.existsSync(path.join(process.cwd(), "public", relative)) ? relative : null;
}

/**
 * Shows the product's main screen. It renders the captured screenshot when it exists; otherwise
 * the brand's HTML preview, which is built from the same UI primitives as the product and is inert
 * (not focusable, hidden from assistive tech) with a plain-language caption instead.
 */
export function ProductFrame({
  slug,
  caption,
  chrome = "browser",
  host,
  className,
  children,
}: {
  slug: string;
  caption: string;
  /** browser: window bar with the product URL · bare: rounded panel only */
  chrome?: "browser" | "bare";
  host?: string;
  className?: string;
  children: ReactNode;
}) {
  const screenshot = heroScreenshot(slug);
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-border/80 bg-card text-card-foreground shadow-[0_2px_4px_rgb(0_0_0/0.04),0_40px_80px_-32px_rgb(0_0_0/0.35)]",
        className,
      )}
    >
      {chrome === "browser" ? (
        <div className="flex h-9 items-center gap-3 border-b border-border/80 bg-brand-subtle px-3.5" aria-hidden="true">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="mx-auto truncate rounded-md bg-background/80 px-3 py-0.5 text-[11px] text-muted-foreground">
            {host ?? `${slug}.saasassin.net`}
          </span>
          <span className="w-10" />
        </div>
      ) : null}
      {screenshot ? (
        <Image src={screenshot} alt={caption} width={2400} height={1500} className="h-auto w-full" priority />
      ) : (
        <>
          <div inert className="select-none">
            {children}
          </div>
          <figcaption className="sr-only">{caption}</figcaption>
        </>
      )}
    </figure>
  );
}
