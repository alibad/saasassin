import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EyeOff, Lock } from "lucide-react";

import { brand } from "@/brands/performance/brand";
import { PerformanceMark } from "@/brands/performance/mark";
import { site } from "@/brands/performance/site";
import { LatticeAuthForm } from "@/components/lattice-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getCurrentSessionUser } from "@/lib/lattice/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a performance workspace for your company.`,
  robots: { index: false, follow: false },
};

function PacketArt() {
  return (
    <div className="max-w-md rounded-[calc(var(--radius)*1.6)] bg-card p-6 text-card-foreground shadow-[0_30px_60px_-30px_rgb(0_0_0/0.5)]">
      <p className="text-xs text-muted-foreground">Review packet · Fall 2026</p>
      <p className="brand-heading mt-1 text-xl">Ana López</p>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-background px-3 py-2.5">
          <EyeOff className="size-4 text-primary" aria-hidden="true" />
          Peer 1 · Peer 2 · Peer 3
          <span className="ml-auto text-xs font-semibold text-primary">Anonymised</span>
        </div>
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-dashed border-brand-accent bg-brand-accent/10 px-3 py-2.5">
          <Lock className="size-4 text-primary" aria-hidden="true" />
          Upward · 2 of 3
          <span className="ml-auto text-xs font-semibold text-primary">Withheld</span>
        </div>
      </div>
    </div>
  );
}

export default async function LatticeSignInPage() {
  const user = await getCurrentSessionUser();
  if (user) redirect("/lattice");
  const links = productLinks(brand.slug);

  return (
    <SignInLayout
      name={brand.name}
      mark={<PerformanceMark />}
      homeHref={links.home}
      signIn={site.signIn}
      tone="primary"
      art={<PacketArt />}
    >
      <LatticeAuthForm />
    </SignInLayout>
  );
}
