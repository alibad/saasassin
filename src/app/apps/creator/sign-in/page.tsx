import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/creator/brand";
import { CreatorMark } from "@/brands/creator/mark";
import { site } from "@/brands/creator/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { Progress } from "@/components/ui/progress";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("creator");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a school for your courses.`,
  robots: { index: false, follow: false },
};

/** Only same-app paths are accepted, so the sign-in page can never become an open redirect. */
function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (next && /^\/apps\/creator(\/[A-Za-z0-9_\-/]*)?$/.test(next) && !next.includes("//")) return next;
  return "/apps/creator";
}

/** A course card from the sample school, as a learner sees it. */
function CourseArt() {
  return (
    <div className="max-w-sm overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-card text-card-foreground shadow-[0_30px_60px_-24px_rgb(0_0_0/0.45)]">
      <div className="h-28 bg-[radial-gradient(120%_120%_at_10%_0%,var(--brand-accent)_0%,transparent_60%),radial-gradient(90%_120%_at_95%_100%,var(--chart-1)_0%,transparent_55%),linear-gradient(var(--secondary),var(--secondary))]" />
      <div className="p-5">
        <p className="brand-heading text-2xl">Watercolour Basics</p>
        <p className="mt-1 text-sm text-muted-foreground">Next up: Mixing colours · unlocks in 2 days</p>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Your progress</span>
          <span className="font-semibold text-foreground">2 of 6 lessons</span>
        </div>
        <Progress value={33} className="mt-1.5" />
      </div>
    </div>
  );
}

export default async function CreatorSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!app) notFound();
  const next = safeNext((await searchParams).next);
  const user = await getFleetUser(app.slug);
  if (user) redirect(next);
  const links = productLinks(brand.slug);

  return (
    // On the fuchsia panel the mark switches to white and peach so it stays visible.
    <div className="[&_aside]:[--mark-1:#FFFFFF] [&_aside]:[--mark-2:var(--brand-accent)]">
      <SignInLayout name={brand.name} mark={<CreatorMark />} homeHref={links.home} signIn={site.signIn} tone="primary" side="right" art={<CourseArt />}>
        <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={next} />
      </SignInLayout>
    </div>
  );
}
