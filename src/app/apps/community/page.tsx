import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogIn } from "lucide-react";

import { CommunityApp } from "@/components/community/community-app";
import { FleetAppShell } from "@/components/fleet-app-shell";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("community");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export const dynamic = "force-dynamic";

export default async function CommunityAppPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (!user) {
    return (
      <>
        <div className="fleet-app border-b-2 border-[var(--ink)] bg-[#a855f7] px-4 py-3 text-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              Spaces, threads, events and RSVPs for your members, with moderation, an audit trail and a full JSON export.
            </p>
            <Link
              href="/apps/community/sign-in"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-[var(--ink)] bg-[var(--paper-strong)] px-3 py-1.5 text-sm font-bold text-[var(--ink)]! no-underline shadow-[3px_3px_0_var(--ink)]"
            >
              <LogIn size={16} /> Sign in / Create account
            </Link>
          </div>
        </div>
        <FleetAppShell app={app} />
      </>
    );
  }

  const { c } = await searchParams;
  return <CommunityApp userEmail={user.email} initialTenantId={typeof c === "string" ? c : null} />;
}
