import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ParticipantRunner } from "@/components/studies/participant-runner";
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
        <main className="mx-auto grid min-h-screen max-w-2xl place-items-center bg-[#f6f1e7] px-4">
          <p>This study is temporarily unavailable.</p>
        </main>
      );
    }
    throw error;
  }
  return (
    <main className="min-h-screen bg-[#f6f1e7] px-4 py-8 text-[#111]">
      <div className="mx-auto grid max-w-2xl gap-6">
        <p className="text-xs font-semibold uppercase tracking-widest">SaaSassin Studies</p>
        <ParticipantRunner study={study} />
      </div>
    </main>
  );
}
