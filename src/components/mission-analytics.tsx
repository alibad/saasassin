"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";

import { captureAnalytics } from "@/lib/analytics";

export function MissionView({ mission }: { mission: string }) {
  useEffect(() => {
    captureAnalytics("mission_viewed", { mission });
  }, [mission]);

  return null;
}

export function TrackedLink({
  children,
  className,
  event,
  href,
  properties,
}: {
  children: ReactNode;
  className?: string;
  event: string;
  href: string;
  properties?: Record<string, boolean | number | string>;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => captureAnalytics(event, properties)}
    >
      {children}
    </Link>
  );
}
