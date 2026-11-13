import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CommunityHome } from "@/brands/community/home";
import { CommunityApp } from "@/components/community/community-app";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("community");

export const metadata: Metadata = brandHomeMetadata();

export const dynamic = "force-dynamic";

export default async function CommunityAppPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (!user) return <CommunityHome />;

  const { c } = await searchParams;
  return <CommunityApp userEmail={user.email} initialTenantId={typeof c === "string" ? c : null} />;
}
