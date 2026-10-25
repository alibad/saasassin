import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { RevenueWorkspace } from "@/components/revenue/revenue-workspace";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("revenue");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function RevenueAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (!user) {
    return (
      <>
        <div className="border-b border-[#171715] bg-[#3d7cff] px-4 py-3 text-center text-sm font-semibold text-[#171715]">
          Revenue is live: log consented call transcripts against deals and get deterministic, evidence-linked call analysis.{" "}
          <Link className="underline underline-offset-4" href={`/apps/${app.slug}/sign-in`}>
            Sign in / Create account
          </Link>
        </div>
        <FleetAppShell app={app} />
      </>
    );
  }
  return <RevenueWorkspace userEmail={user.email} userName={user.name} />;
}
