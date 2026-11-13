"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account/account-menu";
import { ResearchMark } from "@/brands/research/mark";
import { ThemeToggle } from "@/lib/brand/theme-toggle";

import { RESEARCH_ACCOUNT_HREF, RESEARCH_HREF, RESEARCH_SIGN_IN_HREF } from "./workspace-shell";

/** The slim bar on Research pages that live outside the workspace sidebar (reports, account). */
export function ResearchTopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href={RESEARCH_HREF} className="flex items-center gap-2 rounded-md">
          <ResearchMark size={24} />
          <span className="font-heading text-lg leading-none">Research</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{children}</span>
        <ThemeToggle />
        <AccountMenu product="research" accountHref={RESEARCH_ACCOUNT_HREF} signInHref={RESEARCH_SIGN_IN_HREF} />
      </div>
    </header>
  );
}
