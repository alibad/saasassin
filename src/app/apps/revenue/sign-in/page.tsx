import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/revenue/brand";
import { RevenueMark } from "@/brands/revenue/mark";
import { site } from "@/brands/revenue/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("revenue");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace for your sales team.`,
  robots: { index: false, follow: false },
};

/** A talk-ratio card from a fictional call, drawn on the navy panel. */
function TalkRatioArt() {
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.6)] border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
      <p className="text-xs font-semibold text-brand-ink-foreground/70">Discovery call · Fieldstone Logistics</p>
      <div className="mt-4 flex justify-between text-xs text-brand-ink-foreground/70">
        <span>Rep 42%</span>
        <span>Customer 58%</span>
      </div>
      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full">
        <span className="bg-[#9DBBEA]" style={{ width: "42%" }} />
        <span className="bg-brand-accent" style={{ width: "58%" }} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          ["Questions", "14"],
          ["Monologue", "1m 48s"],
          ["Interactivity", "6.2"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="brand-heading text-2xl tabular-nums">{value}</p>
            <p className="text-xs text-brand-ink-foreground/70">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-md bg-white/[0.06] px-3 py-2 text-xs text-brand-ink-foreground/80">
        Next step at 18:05 · “I&rsquo;ll send the security questionnaire by Friday”
      </p>
    </div>
  );
}

export default async function RevenueSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<RevenueMark />} homeHref={links.home} signIn={site.signIn} tone="ink" art={<TalkRatioArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
