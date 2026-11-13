import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/trust/brand";
import { TrustMark } from "@/brands/trust/mark";
import { site } from "@/brands/trust/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { Progress } from "@/components/ui/progress";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("trust");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a compliance workspace for your team.`,
  robots: { index: false, follow: false },
};

function ReadinessArt() {
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.6)] border border-border bg-card p-5 text-card-foreground shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">SOC 2 readiness</p>
        <span className="brand-mono text-[11px] text-muted-foreground">library 2026.10.0</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {[
          ["Control coverage", "72%", 72],
          ["Evidence fresh", "88%", 88],
        ].map(([label, value, progress]) => (
          <div key={String(label)}>
            <p className="brand-mono text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
            <p className="brand-heading mt-1 text-2xl tabular-nums">{value}</p>
            <Progress value={Number(progress)} className="mt-2 [&>div]:bg-brand-accent" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="brand-mono font-medium">CC6.1</span>
        <span className="text-muted-foreground">Logical access security</span>
        <span className="ml-auto rounded-[4px] bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">Needs evidence</span>
      </div>
    </div>
  );
}

export default async function TrustSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<TrustMark />} homeHref={links.home} signIn={site.signIn} tone="ink" side="right" art={<ReadinessArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
