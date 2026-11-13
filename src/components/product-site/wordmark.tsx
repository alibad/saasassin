import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const sizes = {
  sm: "gap-2 text-base [&_svg]:size-6",
  md: "gap-2.5 text-lg [&_svg]:size-7",
  lg: "gap-3 text-2xl [&_svg]:size-9",
} as const;

/** The product lockup: its abstract mark and its name in the display face. */
export function Wordmark({
  name,
  mark,
  href,
  size = "md",
  className,
}: {
  name: string;
  mark: ReactNode;
  href?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const content = (
    <>
      {mark}
      <span className="brand-heading leading-none">{name}</span>
    </>
  );
  const classes = cn("inline-flex shrink-0 items-center text-foreground", sizes[size], className);
  if (!href) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={classes} aria-label={`${name} home`}>
      {content}
    </Link>
  );
}
