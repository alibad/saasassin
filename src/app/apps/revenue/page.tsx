import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RevenueHome } from "@/brands/revenue/home";
import { RevenueWorkspace } from "@/components/revenue/revenue-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("revenue");

export const metadata: Metadata = brandHomeMetadata();

export default async function RevenueAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (!user) {
    return <RevenueHome />;
  }
  return <RevenueWorkspace userEmail={user.email} userName={user.name} />;
}
