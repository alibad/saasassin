import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";

import { FindingsList } from "@/components/studies/findings-panel";
import { ResultsView } from "@/components/studies/results-view";
import { StudiesWordmark } from "@/components/studies/workspace-shell";
import { FleetError } from "@/lib/fleet/platform/session";
import { buildResultsPayload, getSharedResults } from "@/lib/studies/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Study results",
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
    payload = buildResultsPayload(await getSharedResults(tenantId, studyId, token), { audience: "shared" });
  } catch (error) {
    if (error instanceof FleetError) notFound();
    throw error;
  }
  // Whoever holds the link sees findings, not who on the team wrote them.
  const findings = payload.findings.map((finding) => ({ ...finding, createdBy: { uid: "", email: "" } }));

  return (
    <div className="min-h-dvh bg-brand-subtle text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <StudiesWordmark size={24} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Eye className="size-3.5" aria-hidden="true" /> Read-only results
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6">
        <header className="grid gap-2">
          <h1 className="brand-heading text-3xl break-words sm:text-4xl">{payload.study.title}</h1>
          {payload.study.description ? <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{payload.study.description}</p> : null}
        </header>
        {findings.length ? (
          <section className="grid gap-3" aria-labelledby="shared-findings">
            <h2 id="shared-findings" className="brand-heading text-xl">
              Findings
            </h2>
            <FindingsList findings={findings} />
          </section>
        ) : null}
        {payload.version && payload.results ? (
          <section className="grid gap-3" aria-labelledby="shared-results">
            <h2 id="shared-results" className="brand-heading text-xl">Results</h2>
            <ResultsView results={payload.results} version={payload.version} />
          </section>
        ) : (
          <p className="text-muted-foreground">This study hasn&apos;t been published yet. Results appear here once it is.</p>
        )}
        <footer className="text-xs text-muted-foreground">Shared by the study&apos;s team. They can turn this link off at any time.</footer>
      </main>
    </div>
  );
}
