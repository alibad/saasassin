import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlannerHome } from "@/brands/planner/home";
import { PlannerApp } from "@/components/planner/planner-app";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("planner");

export const metadata: Metadata = brandHomeMetadata();

export default async function PlannerAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (user) return <PlannerApp email={user.email} accent={app.accent} />;

  return <PlannerHome />;
}
