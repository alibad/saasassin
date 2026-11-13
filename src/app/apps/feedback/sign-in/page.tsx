import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/feedback/brand";
import { FeedbackMark } from "@/brands/feedback/mark";
import { StatusPill, VoteBox } from "@/brands/feedback/preview";
import { site } from "@/brands/feedback/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("feedback");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace for your boards.`,
  robots: { index: false, follow: false },
};

type SignInProps = { searchParams: Promise<{ next?: string | string[] }> };

/** Only same-product internal paths are honoured, so `next` can never become an open redirect. */
function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && /^\/apps\/feedback(\/[A-Za-z0-9_\-/]*)?$/.test(next) ? next : "/apps/feedback";
}

/** An idea card from the sample board, mid-loop. */
function IdeaArt() {
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.3)] border border-border bg-card p-5 text-card-foreground shadow-[0_24px_48px_-24px_rgb(0_0_0/0.3)]">
      <div className="flex gap-3">
        <VoteBox votes={142} voted />
        <div className="min-w-0">
          <p className="font-bold leading-snug">Offline mode for the mobile app</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <StatusPill status="Planned" />
            <span>38 comments</span>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-[10px] bg-brand-subtle p-3 text-sm">
        <p className="text-xs font-bold text-primary">Team update</p>
        <p className="mt-1 text-muted-foreground">On the roadmap for the winter release. Thanks for every vote.</p>
      </div>
    </div>
  );
}

export default async function FeedbackSignInPage({ searchParams }: SignInProps) {
  if (!app) notFound();
  const next = safeNext((await searchParams).next);
  const user = await getFleetUser(app.slug);
  if (user) redirect(next);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<FeedbackMark />} homeHref={links.home} signIn={site.signIn} tone="subtle" art={<IdeaArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={next} />
    </SignInLayout>
  );
}
