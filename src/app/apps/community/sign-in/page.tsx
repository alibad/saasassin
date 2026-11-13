import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Check } from "lucide-react";

import { brand } from "@/brands/community/brand";
import { CommunityMark } from "@/brands/community/mark";
import { site } from "@/brands/community/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("community");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or start a community for your members.`,
  robots: { index: false, follow: false },
};

/** Only invite links may be resumed after sign-in; anything else lands on the workspace. */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && /^\/apps\/community\/join\/[A-Za-z0-9_-]+\/[A-Za-z0-9]+$/.test(value) ? value : "/apps/community";
}

function EventArt() {
  const people = [
    ["PN", "bg-[color-mix(in_oklab,var(--primary)_16%,var(--card))] text-primary"],
    ["TR", "bg-[color-mix(in_oklab,var(--brand-accent)_30%,var(--card))] text-accent-foreground"],
    ["JP", "bg-[color-mix(in_oklab,var(--chart-3)_45%,var(--card))] text-secondary-foreground"],
    ["KO", "bg-secondary text-secondary-foreground"],
  ];
  return (
    <div className="max-w-sm overflow-hidden rounded-[calc(var(--radius)*1.2)] bg-card text-card-foreground shadow-[0_30px_60px_-28px_rgb(0_0_0/0.45)]">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-[12px] bg-primary/10 px-2.5 py-1.5 text-center leading-none text-primary">
          <p className="text-[10px] font-semibold">NOV</p>
          <p className="brand-heading text-2xl">21</p>
        </div>
        <div>
          <p className="font-semibold">Open workshop night</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3" aria-hidden="true" />
            Thu · 6:30 pm · Workshop nights
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between p-4">
        <div className="flex -space-x-2">
          {people.map(([initials, tone]) => (
            <span key={initials} className={`flex size-8 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-card ${tone}`}>
              {initials}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Check className="size-3.5" aria-hidden="true" />
          Going
        </span>
      </div>
    </div>
  );
}

export default async function CommunitySignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (!app) notFound();
  const next = safeNext((await searchParams).next);
  const user = await getFleetUser(app.slug);
  if (user) redirect(next);
  const links = productLinks(brand.slug);
  // The panel (desktop only) is grape, so there the mark switches to light colours; on mobile it sits on the canvas.
  const mark = (
    <span className="contents lg:[--mark-1:#FFFFFF] lg:[--mark-2:#F9A8D4] lg:[--mark-3:#C4B5FD]">
      <CommunityMark />
    </span>
  );

  return (
    <SignInLayout name={brand.name} mark={mark} homeHref={links.home} signIn={site.signIn} tone="primary" art={<EventArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={next} />
    </SignInLayout>
  );
}
