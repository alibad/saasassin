import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { fleetApps, getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";

export const dynamicParams = false;

export function generateStaticParams() {
  return fleetApps.filter((app) => app.slug !== "performance").map((app) => ({ appSlug: app.slug }));
}

type FleetAppPageProps = { params: Promise<{ appSlug: string }> };

export async function generateMetadata({ params }: FleetAppPageProps): Promise<Metadata> {
  const { appSlug } = await params;
  const app = getFleetApp(appSlug);
  if (!app) return { title: "Product not found" };

  return {
    title: `SaaSassin ${app.productName}`,
    description: app.promise,
    alternates: { canonical: getFleetAppUrl(app) },
    robots: { index: false, follow: false },
  };
}

export default async function FleetAppPage({ params }: FleetAppPageProps) {
  const { appSlug } = await params;
  const app = getFleetApp(appSlug);
  if (!app) notFound();
  if (app.slug === "performance") redirect("/lattice");
  return <FleetAppShell app={app} />;
}
