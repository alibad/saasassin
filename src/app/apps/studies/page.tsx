import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StudiesHome } from "@/brands/studies/home";
import { StudiesWorkspace } from "@/components/studies/studies-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("studies");

export const dynamic = "force-dynamic";

export const metadata: Metadata = brandHomeMetadata();

export default async function StudiesAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <StudiesWorkspace user={{ email: user.email, name: user.name }} />;

  return <StudiesHome />;
}
