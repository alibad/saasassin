import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ParticipantRunner } from "@/components/studies/participant-runner";
import { StudiesMark } from "@/brands/studies/mark";
import { FleetError } from "@/lib/fleet/platform/session";
import { getPublicStudy } from "@/lib/studies/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Take part in a study",
  robots: { index: false, follow: false },
};

export default async function ParticipantPage({ params }: { params: Promise<{ tenantId: string; studyId: string }> }) {
  const { tenantId, studyId } = await params;
  let study: Awaited<ReturnType<typeof getPublicStudy>>;
  try {
    study = await getPublicStudy(tenantId, studyId);
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) notFound();
    if (error instanceof FleetError && error.status === 503) {
      return (
        <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 text-foreground">
          <div className="grid max-w-md justify-items-center gap-3 text-center">
            <StudiesMark size={36} />
            <h1 className="brand-heading text-2xl">This study is taking a short break</h1>
            <p className="text-muted-foreground">Please try the link again in a few minutes.</p>
          </div>
        </main>
      );
    }
    throw error;
  }
  return (
    <main className="min-h-dvh bg-brand-subtle px-4 py-8 text-foreground sm:py-14">
      <div className="mx-auto grid max-w-2xl gap-6">
        <ParticipantRunner study={study} />
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <StudiesMark size={14} /> Powered by Studies
        </p>
      </div>
    </main>
  );
}
