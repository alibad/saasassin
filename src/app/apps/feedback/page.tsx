import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeedbackHome } from "@/brands/feedback/home";
import { FeedbackWorkspace } from "@/components/feedback/feedback-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("feedback");

export const dynamic = "force-dynamic";

export const metadata: Metadata = brandHomeMetadata();

export default async function FeedbackAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <FeedbackWorkspace user={{ email: user.email, name: user.name }} />;

  return <FeedbackHome />;
}
