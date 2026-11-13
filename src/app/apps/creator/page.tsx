import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreatorHome } from "@/brands/creator/home";
import { CreatorWorkspace } from "@/components/creator/creator-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { listLearnerEnrollments } from "@/lib/creator/store";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("creator");

export const metadata: Metadata = brandHomeMetadata();

export const dynamic = "force-dynamic";

export default async function CreatorAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (!user) return <CreatorHome />;

  const learnerCourses = await listLearnerEnrollments(user.uid).catch(() => []);
  return <CreatorWorkspace user={{ email: user.email, name: user.name }} learnerCourses={learnerCourses} />;
}
