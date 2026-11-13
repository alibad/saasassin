import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResearchHome } from "@/brands/research/home";
import { ResearchApp } from "@/components/research/research-app";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("research");

export const metadata: Metadata = brandHomeMetadata();

export default async function ResearchAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <ResearchApp userEmail={user.email} />;

  return <ResearchHome />;
}
