import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { Wordmark } from "./wordmark";

const panelTones = {
  // On a primary panel the mark's primary-coloured shapes switch to the panel's foreground.
  primary: "bg-primary text-primary-foreground [--mark-1:var(--primary-foreground)] [&_[data-muted]]:text-primary-foreground/80",
  ink: "dark bg-brand-ink text-brand-ink-foreground [&_[data-muted]]:text-muted-foreground",
  subtle: "bg-brand-subtle text-foreground [&_[data-muted]]:text-muted-foreground",
} as const;

/**
 * The product's sign-in page: a brand panel (lockup, promise, what you get, optional art) beside
 * the auth form. The form is passed as children and keeps its own logic; the lockup lives here,
 * outside the form card.
 */
export function SignInLayout({
  name,
  mark,
  homeHref,
  signIn,
  tone = "subtle",
  side = "left",
  art,
  children,
}: {
  name: string;
  mark: ReactNode;
  homeHref: string;
  signIn: ProductSite["signIn"];
  tone?: keyof typeof panelTones;
  side?: "left" | "right";
  art?: ReactNode;
  children: ReactNode;
}) {
  const points = (
    <ul className="grid gap-3">
      {signIn.points.map((point) => (
        <li key={point} className="flex gap-3">
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-current/15">
            <Check className="size-3" aria-hidden="true" />
          </span>
          <span data-muted className="leading-relaxed">
            {point}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside
        className={cn(
          "relative hidden flex-col overflow-hidden p-10 lg:flex xl:p-14",
          panelTones[tone],
          side === "right" && "lg:order-2",
        )}
      >
        <Wordmark name={name} mark={mark} href={homeHref} size="md" className="text-current" />
        <div className="relative z-10 mt-auto max-w-lg pt-16">
          <h1 className="brand-heading text-4xl leading-[1.08] xl:text-5xl">{signIn.title}</h1>
          <p data-muted className="mt-5 text-lg leading-relaxed">
            {signIn.body}
          </p>
          <div className="mt-8">{points}</div>
        </div>
        {art ? (
          <div className="relative mt-12 -mr-10 xl:-mr-14" aria-hidden="true">
            {art}
          </div>
        ) : null}
      </aside>

      <main className="flex min-h-dvh flex-col px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-4">
          <Wordmark name={name} mark={mark} href={homeHref} size="sm" className="lg:invisible" />
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to {name}
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <h1 className="brand-heading mb-6 text-3xl leading-tight lg:hidden">{signIn.title}</h1>
          {children}
          <div className="mt-8 text-sm text-muted-foreground lg:hidden">{points}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {name} is free and open source (AGPL-3.0).
        </p>
      </main>
    </div>
  );
}
