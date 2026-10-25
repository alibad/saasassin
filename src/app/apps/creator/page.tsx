import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { CreatorWorkspace } from "@/components/creator/creator-workspace";
import { FleetAppShell } from "@/components/fleet-app-shell";
import { Button } from "@/components/ui/button";
import { listLearnerEnrollments } from "@/lib/creator/store";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("creator");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export const dynamic = "force-dynamic";

export default async function CreatorAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (!user) {
    return (
      <>
        <div className="fleet-app border-b-2 border-neutral-900 bg-[#ff3d93] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
            <p className="font-semibold">Build a course, publish it, enroll learners and track their progress — then export everything.</p>
            <Button asChild variant="secondary" className="ml-auto">
              <Link href={`/apps/${app.slug}/sign-in`}>Sign in / Create account <ArrowRight aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
        <FleetAppShell app={app} />
      </>
    );
  }

  const learnerCourses = await listLearnerEnrollments(user.uid).catch(() => []);
  return <CreatorWorkspace user={{ email: user.email, name: user.name }} learnerCourses={learnerCourses} />;
}
