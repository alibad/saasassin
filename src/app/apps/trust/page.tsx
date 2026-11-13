import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrustHome } from "@/brands/trust/home";
import { TrustWorkspace } from "@/components/trust/trust-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("trust");

export const metadata: Metadata = brandHomeMetadata();

export default async function TrustAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <TrustWorkspace />;

  return <TrustHome />;
}
