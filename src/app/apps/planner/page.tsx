import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";

const app = getFleetApp("planner");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default function PlannerAppPage() {
  if (!app) notFound();
  return <FleetAppShell app={app} />;
}
