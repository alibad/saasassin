import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogIn } from "lucide-react";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { ResearchApp } from "@/components/research/research-app";
import { Button } from "@/components/ui/button";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("research");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function ResearchAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <ResearchApp userEmail={user.email} />;

  return (
    <>
      <div className="fleet-app sticky top-0 z-20 flex flex-wrap items-center justify-center gap-3 border-b-2 border-foreground bg-background px-4 py-3 text-sm">
        <span>Interviews, consent, highlights and insights with evidence backlinks — exportable any time.</span>
        <Button asChild size="sm">
          <Link href={`/apps/${app.slug}/sign-in`}><LogIn /> Sign in / Create account</Link>
        </Button>
      </div>
      <FleetAppShell app={app} />
    </>
  );
}
