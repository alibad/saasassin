import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Database, LockKeyhole, ShieldCheck } from "lucide-react";

import { FleetAuthForm } from "@/components/fleet-auth-form";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("creator");

export const metadata: Metadata = {
  title: `Sign in to SaaSassin ${app?.productName ?? "creator"}`,
  description: app?.promise,
  robots: { index: false, follow: false },
};

export default async function CreatorSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);

  return (
    <main className="lattice-auth-page fleet-app">
      <div className="shell lattice-auth-grid">
        <section className="lattice-auth-copy">
          <Link className="back-link" href={`/targets/${app.targetSlug}`}>
            <ArrowLeft aria-hidden="true" size={16} />
            Read the product decision
          </Link>
          <p className="eyebrow">SaaSassin {app.productName} / {app.category}</p>
          <h1>{app.promise}</h1>
          <p>{app.primaryJob}</p>
          <div className="lattice-auth-proof">
            <span><ShieldCheck /> Server-verified roles</span>
            <span><Database /> Tenant-isolated data</span>
            <span><LockKeyhole /> Product-only session</span>
          </div>
        </section>
        <FleetAuthForm
          product={app.slug}
          productName={app.productName}
          description={app.audience}
          next={`/apps/${app.slug}`}
        />
      </div>
    </main>
  );
}
