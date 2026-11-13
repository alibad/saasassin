import type { ReactNode } from "react";
import Link from "next/link";

import { CreatorMark } from "@/brands/creator/mark";
import { cn } from "@/lib/utils";

import { PublicAccountArea } from "./public-account";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
}

/** The school's own monogram, so a school's pages carry its name rather than ours. */
export function SchoolMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--chart-1),var(--chart-3))] font-heading text-sm text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/**
 * The frame of every page a school shows its learners: the catalog, course pages, the lesson
 * player and certificates. The school's name leads; Creator signs off quietly in the footer.
 */
export function PublicChrome({
  schoolName,
  tenantId,
  signedIn,
  nextPath,
  children,
  extra,
}: {
  schoolName: string;
  tenantId?: string;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  nextPath: string;
  children: ReactNode;
  /** Links shown before the account area (e.g. "Course page"). */
  extra?: ReactNode;
}) {
  const catalog = tenantId ? `/apps/creator/s/${tenantId}` : null;
  const lockup = (
    <>
      <SchoolMark name={schoolName} />
      <span className="brand-heading truncate text-lg leading-none">{schoolName}</span>
    </>
  );
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {catalog ? (
            <Link href={catalog} className="flex min-w-0 items-center gap-3">{lockup}</Link>
          ) : (
            <span className="flex min-w-0 items-center gap-3">{lockup}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {extra}
            <PublicAccountArea signedIn={signedIn} nextPath={nextPath} />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} {schoolName}</span>
          <Link href="/apps/creator" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <CreatorMark size={16} /> Made with Creator
          </Link>
        </div>
      </footer>
    </div>
  );
}
