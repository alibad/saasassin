"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account/account-menu";
import { ThemeToggle } from "@/lib/brand/theme-toggle";

import { STUDIES_ACCOUNT_HREF, STUDIES_HREF, STUDIES_SIGN_IN_HREF, StudiesWordmark } from "./workspace-shell";

/** The bar on Studies pages outside the workspace (account settings). */
export function StudiesTopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href={STUDIES_HREF} className="rounded-md"><StudiesWordmark /></Link>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{children}</span>
        <ThemeToggle />
        <AccountMenu product="studies" accountHref={STUDIES_ACCOUNT_HREF} signInHref={STUDIES_SIGN_IN_HREF} />
      </div>
    </header>
  );
}
