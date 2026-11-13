"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { FeedbackMark } from "@/brands/feedback/mark";
import { AccountMenu } from "@/components/account/account-menu";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export type PortalTab = "ideas" | "roadmap" | "changelog";

export function portalHref(tenantId: string, tab: PortalTab = "roadmap") {
  const base = `/apps/feedback/b/${tenantId}`;
  return tab === "roadmap" ? base : `${base}?tab=${tab}`;
}

/** A company's monogram until portals can carry their own logo. */
function Monogram({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "F";
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-base font-extrabold text-background" aria-hidden="true">
      {letter}
    </span>
  );
}

/**
 * The frame of a company's public feedback portal: their name, Ideas / Roadmap / Changelog,
 * and sign-in (or the visitor's own avatar once signed in). Feedback itself stays in the footer.
 */
export function PortalChrome({
  tenantId,
  companyName,
  active,
  signedIn,
  signInHref,
  children,
}: {
  tenantId: string;
  companyName: string;
  active: PortalTab;
  signedIn: boolean;
  signInHref: string;
  children: ReactNode;
}) {
  const tabs: Array<{ id: PortalTab; label: string }> = [
    { id: "ideas", label: "Ideas" },
    { id: "roadmap", label: "Roadmap" },
    { id: "changelog", label: "Changelog" },
  ];
  return (
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
            <Link href={portalHref(tenantId)} className="flex min-w-0 items-center gap-3">
              <Monogram name={companyName} />
              <span className="brand-heading truncate text-lg">{companyName}</span>
            </Link>
            <nav aria-label="Portal" className="order-3 -mx-1 flex w-full gap-1 sm:order-none sm:w-auto">
              {tabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={portalHref(tenantId, tab.id)}
                  aria-current={active === tab.id ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    active === tab.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              {signedIn ? (
                <AccountMenu product="feedback" accountHref="/apps/feedback/account" signInHref={signInHref} />
              ) : (
                <Button asChild className="rounded-full"><Link href={signInHref}>Sign in</Link></Button>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
            <span>Ideas, votes and updates from the {companyName} team.</span>
            <Link href="/apps/feedback" className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground">
              <FeedbackMark size={16} /> Powered by Feedback
            </Link>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
