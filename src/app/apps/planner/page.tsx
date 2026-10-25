import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { PlannerApp } from "@/components/planner/planner-app";
import styles from "@/components/planner/planner.module.css";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("planner");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function PlannerAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (user) return <PlannerApp email={user.email} accent={app.accent} />;

  return (
    <>
      <div className={`fleet-app ${styles.landingBar}`} style={{ "--planner-accent": app.accent } as CSSProperties}>
        <div className={styles.landingBarInner}>
          <span>Planner is live: capture tasks, block meetings, and auto-schedule an explainable week.</span>
          <Link href={`/apps/${app.slug}/sign-in`}>
            Sign in / Create account <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </div>
      <FleetAppShell app={app} />
    </>
  );
}
