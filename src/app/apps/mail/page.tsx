import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Keyboard } from "lucide-react";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { Button } from "@/components/ui/button";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("mail");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function MailAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (user) return <MailWorkspace userEmail={user.email} userName={user.name} />;

  return (
    <>
      <aside className="fleet-app" style={{ background: "#11110f", color: "#fffdf7", padding: "14px 16px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <Keyboard aria-hidden="true" size={18} />
            Import .eml or .mbox mail and triage it entirely from the keyboard: splits, snooze, follow-ups, labels, drafts and search.
          </p>
          <Button asChild variant="secondary">
            <Link href="/apps/mail/sign-in">Sign in / Create account <ArrowRight /></Link>
          </Button>
        </div>
      </aside>
      <FleetAppShell app={app} />
    </>
  );
}
