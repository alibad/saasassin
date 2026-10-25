import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { FeedbackWorkspace } from "@/components/feedback/feedback-workspace";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("feedback");

export const dynamic = "force-dynamic";

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function FeedbackAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <FeedbackWorkspace user={{ email: user.email, name: user.name }} />;

  return (
    <>
      <div className="fleet-app" style={{ borderBottom: "1px solid #171715", background: app.accent, padding: "14px 16px" }}>
        <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <strong>Open-source Canny replacement: public boards, one-vote-per-person voting, roadmap, changelog, Canny import and a Fider-compatible export.</strong>
          <Link href="/apps/feedback/sign-in" style={{ border: "1px solid #171715", background: "#fffdf7", padding: "8px 14px", fontWeight: 700, color: "#171715" }}>
            Sign in / Create account
          </Link>
        </div>
      </div>
      <FleetAppShell app={app} />
    </>
  );
}
