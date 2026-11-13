import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { brand } from "@/brands/planner/brand";
import { PlannerMark } from "@/brands/planner/mark";
import { site } from "@/brands/planner/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("planner");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace to plan your week.`,
  robots: { index: false, follow: false },
};

/** A morning from the sample week, as it appears in the product. */
function DayArt() {
  const blocks = [
    { time: "09:00", title: "Standup", meta: "Imported · 30m", kind: "meeting" },
    { time: "09:30", title: "Draft pricing page", meta: "Deep · placed in your focus hours", kind: "task" },
    { time: "11:30", title: "Review Q4 roadmap", meta: "Due Thu · after the draft", kind: "task" },
    { time: "13:00", title: "Customer call prep", meta: "Locked", kind: "locked" },
  ];
  return (
    <ol className="max-w-md rounded-[calc(var(--radius)*1.4)] border border-border bg-card p-4 text-card-foreground shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)]">
      {blocks.map((block) => (
        <li key={block.title} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
          <span className="pt-2 text-xs text-muted-foreground tabular-nums">{block.time}</span>
          <span
            className={
              block.kind === "task"
                ? "rounded-md border-l-[3px] border-[var(--chart-1)] bg-[color-mix(in_oklab,var(--chart-1)_16%,var(--card))] px-3 py-2"
                : block.kind === "locked"
                  ? "rounded-md bg-foreground px-3 py-2 text-background"
                  : "rounded-md border-l-[3px] border-foreground/30 bg-muted px-3 py-2 text-muted-foreground"
            }
          >
            <span className="flex items-center gap-1.5 font-semibold">
              {block.kind === "locked" ? <Lock className="size-3.5" aria-hidden="true" /> : null}
              {block.title}
            </span>
            <span className="block text-xs opacity-75">{block.meta}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function PlannerSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<PlannerMark />} homeHref={links.home} signIn={site.signIn} tone="ink" art={<DayArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
