import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/studies/brand";
import { StudiesMark } from "@/brands/studies/mark";
import { site } from "@/brands/studies/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("studies");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace for your team.`,
  robots: { index: false, follow: false },
};

/** A results card from a fictional study, drawn beside the form. */
function ResultsArt() {
  const outcomes = [
    ["Direct success", 58, "bg-primary"],
    ["Indirect success", 14, "bg-primary/45"],
    ["Failure", 21, "bg-brand-accent"],
    ["Skipped", 7, "bg-muted-foreground/30"],
  ] as const;
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.4)] border border-border bg-card p-6 text-card-foreground shadow-[0_24px_48px_-24px_rgb(0_0_0/0.3)]">
      <p className="text-xs font-semibold text-muted-foreground">Tree test · Task 2 · 38 sessions</p>
      <p className="brand-heading mt-2 text-xl leading-snug">Change the delivery address</p>
      <div className="mt-4 flex items-end gap-6">
        <div>
          <p className="brand-heading text-4xl tabular-nums">72%</p>
          <p className="text-xs text-muted-foreground">success</p>
        </div>
        <div>
          <p className="brand-heading text-4xl tabular-nums text-muted-foreground">24 s</p>
          <p className="text-xs text-muted-foreground">median time</p>
        </div>
      </div>
      <div className="mt-5 flex h-2.5 overflow-hidden rounded-full">
        {outcomes.map(([label, value, color]) => (
          <span key={label} className={color} style={{ width: `${value}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {outcomes.map(([label, value, color]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${color}`} />
            {label} <span className="ml-auto tabular-nums text-foreground">{value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function StudiesSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<StudiesMark />} homeHref={links.home} signIn={site.signIn} tone="subtle" side="right" art={<ResultsArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
