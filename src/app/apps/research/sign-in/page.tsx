import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/research/brand";
import { ResearchMark } from "@/brands/research/mark";
import { site } from "@/brands/research/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("research");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace for your team.`,
  robots: { index: false, follow: false },
};

function QuoteArt() {
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.4)] border border-border bg-card p-6 text-card-foreground shadow-[0_24px_48px_-24px_rgb(0_0_0/0.3)]">
      <p className="text-xs font-semibold text-muted-foreground">Insight · cites 4 quotes</p>
      <p className="brand-heading mt-2 text-xl leading-snug">People abandon checkout when the deposit appears late</p>
      <p className="mt-4 border-l-2 border-brand-accent pl-3 font-heading text-[15px] italic text-muted-foreground">
        “…and{" "}
        <mark className="rounded-[3px] bg-brand-accent/70 px-0.5 text-foreground not-italic dark:bg-brand-accent/25">only then saw a deposit on every bike</mark>
        .”
      </p>
    </div>
  );
}

export default async function ResearchSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<ResearchMark />} homeHref={links.home} signIn={site.signIn} tone="subtle" art={<QuoteArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
