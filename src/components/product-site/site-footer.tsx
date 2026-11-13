import type { ReactNode } from "react";
import Link from "next/link";

import { ThemeToggle } from "@/lib/brand/theme-toggle";
import type { NavLink } from "@/lib/brand/types";
import { getSaasassinSiteUrl } from "@/lib/fleet/site";
import { cn } from "@/lib/utils";

import { Container } from "./primitives";
import { Wordmark } from "./wordmark";

/**
 * The product footer. SaaSassin appears only here, as the quiet family line and the repository
 * link — never as the logo or the look.
 */
export function SiteFooter({
  name,
  mark,
  homeHref,
  tagline,
  links,
  signInHref,
  repoUrl,
  className,
}: {
  name: string;
  mark: ReactNode;
  homeHref: string;
  tagline: string;
  links: NavLink[];
  signInHref: string;
  repoUrl: string;
  className?: string;
}) {
  const columns: { title: string; items: { label: string; href: string; external?: boolean }[] }[] = [
    { title: "Product", items: [...links, { label: "Sign in", href: signInHref }] },
    {
      title: "Open source",
      items: [
        { label: "Source on GitHub", href: repoUrl, external: true },
        { label: "AGPL-3.0 licence", href: `${repoUrl}/blob/main/LICENSE`, external: true },
        { label: "Report an issue", href: `${repoUrl}/issues`, external: true },
      ],
    },
    { title: "Talk to us", items: [{ label: "Contact", href: getSaasassinSiteUrl("/contact"), external: true }] },
  ];

  return (
    <footer className={cn("border-t border-border bg-brand-subtle", className)}>
      <Container className="py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
          <div className="max-w-sm">
            <Wordmark name={name} mark={mark} href={homeHref} />
            <p className="mt-4 leading-relaxed text-muted-foreground">{tagline}</p>
            <ThemeToggle withLabel className="mt-5 -ml-2" />
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-semibold text-foreground">{column.title}</h2>
              <ul className="mt-4 grid gap-3 text-sm">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
                        {item.label}
                      </a>
                    ) : item.href.startsWith("#") ? (
                      <a href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{name} is free and open source under the AGPL-3.0.</p>
          <a href={getSaasassinSiteUrl("/")} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            Part of the SaaSassin open-source family
          </a>
        </div>
      </Container>
    </footer>
  );
}
