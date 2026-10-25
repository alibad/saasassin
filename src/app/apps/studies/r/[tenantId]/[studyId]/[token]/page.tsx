import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsView } from "@/components/studies/results-view";
import { FleetError } from "@/lib/fleet/platform/session";
import { buildResultsPayload, getSharedResults } from "@/lib/studies/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared study results",
  robots: { index: false, follow: false },
};

/** Read-only results behind an unguessable, revocable share token. No raw export, no editing. */
export default async function SharedResultsPage({
  params,
}: {
  params: Promise<{ tenantId: string; studyId: string; token: string }>;
}) {
  const { tenantId, studyId, token } = await params;
  let payload: ReturnType<typeof buildResultsPayload>;
  try {
    payload = buildResultsPayload(await getSharedResults(tenantId, studyId, token));
  } catch (error) {
    if (error instanceof FleetError) notFound();
    throw error;
  }
  return (
    <main className="min-h-screen bg-[#f6f1e7] px-4 py-8 text-[#111]">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest">SaaSassin Studies · read-only results</p>
          <h1 className="break-words text-3xl font-semibold">{payload.study.title}</h1>
          {payload.study.description ? <p className="text-[#444]">{payload.study.description}</p> : null}
        </header>
        {payload.version && payload.results ? (
          <ResultsView results={payload.results} version={payload.version} />
        ) : (
          <p>This study has not been published yet.</p>
        )}
      </div>
    </main>
  );
}
