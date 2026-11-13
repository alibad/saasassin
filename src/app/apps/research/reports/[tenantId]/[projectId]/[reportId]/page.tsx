import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { ResearchTopBar } from "@/components/research/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadProfiles } from "@/lib/fleet/platform/profiles";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";
import { loadReport, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";
import { formatTimestamp } from "@/lib/research/transcript";

export const metadata: Metadata = {
  title: "Report",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ tenantId: string; projectId: string; reportId: string }> };

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" });
}

/** Read-only report for workspace members. Access and folder restrictions are checked on every view. */
export default async function ResearchReportPage({ params }: PageProps) {
  const { tenantId, projectId, reportId } = await params;
  const user = await getFleetUser(RESEARCH_SLUG);
  if (!user) redirect(`/apps/${RESEARCH_SLUG}/sign-in?next=${encodeURIComponent(`/apps/${RESEARCH_SLUG}/reports/${tenantId}/${projectId}/${reportId}`)}`);

  let data: Awaited<ReturnType<typeof loadReport>>;
  try {
    const { role } = await requireResearchMember(tenantId, user);
    data = await loadReport(tenantId, projectId, reportId, { uid: user.uid, role });
  } catch (error) {
    if (!(error instanceof FleetError)) throw error;
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <ResearchTopBar />
        <main className="mx-auto grid max-w-xl justify-items-center gap-4 px-4 py-24 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary"><Lock className="size-5" aria-hidden="true" /></span>
          <h1 className="brand-heading text-3xl">This report isn&apos;t shared with you</h1>
          <p className="text-muted-foreground">Reports are visible to members of the research workspace they belong to. Ask someone on that team to invite {user.email}.</p>
          <Button asChild variant="outline"><Link href={`/apps/${RESEARCH_SLUG}`}><ArrowLeft /> Back to Research</Link></Button>
        </main>
      </div>
    );
  }

  const { report, project, sections, missingInsights } = data;
  const author = (await loadProfiles(RESEARCH_SLUG, [report.createdBy])).get(report.createdBy);
  const quoteCount = sections.reduce((sum, section) => sum + section.evidence.length, 0);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ResearchTopBar>{project.name}</ResearchTopBar>
      <article className="mx-auto w-full max-w-3xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <header className="border-b border-border pb-10">
          <p className="text-sm text-muted-foreground">Report · {project.name}</p>
          <h1 className="brand-heading mt-3 text-4xl leading-[1.1] break-words sm:text-5xl">{report.title}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <UserAvatar person={{ uid: report.createdBy, name: author?.name || report.createdByEmail, email: report.createdByEmail, photoURL: author?.photoURL ?? null }} size="lg" />
            <span>
              <span className="block font-medium text-foreground">{author?.name || report.createdByEmail}</span>
              <span>{formatDate(report.createdAt)} · {sections.length} {sections.length === 1 ? "insight" : "insights"} · {quoteCount} {quoteCount === 1 ? "quote" : "quotes"}</span>
            </span>
          </div>
          {report.intro ? <p className="mt-8 font-heading text-xl leading-relaxed whitespace-pre-wrap text-foreground/90">{report.intro}</p> : null}
        </header>

        {missingInsights > 0 ? (
          <p className="mt-6 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" /> {missingInsights} {missingInsights === 1 ? "insight in this report was" : "insights in this report were"} deleted or sit in folders you can&apos;t open.
          </p>
        ) : null}

        <ol className="mt-4">
          {sections.map(({ insight, theme, evidence }, index) => (
            <li key={insight.id} className="border-b border-border py-10 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">{index + 1}</span>
                {theme ? <Badge variant="secondary">{theme}</Badge> : null}
              </div>
              <h2 className="brand-heading mt-4 text-[1.85rem] leading-snug break-words">{insight.title}</h2>
              {insight.body ? <p className="mt-3 text-[17px] leading-relaxed whitespace-pre-wrap">{insight.body}</p> : null}
              <div className="mt-6 grid gap-5">
                {evidence.map(({ highlight, sourceTitle, participant, speaker, startMs }) => (
                  <figure key={highlight.id} className="grid gap-2">
                    <blockquote className="border-l-[3px] border-brand-accent pl-4 font-heading text-[19px] leading-relaxed italic">
                      “{highlight.quote}”
                    </blockquote>
                    <figcaption className="pl-4 text-sm text-muted-foreground">
                      — {speaker || participant}{sourceTitle && !sourceTitle.includes(speaker || participant) ? `, ${sourceTitle}` : ""}{startMs !== null ? ` · ${formatTimestamp(startMs)}` : ""}
                      {highlight.tags.length ? <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">{highlight.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}</span> : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {insight.restrictedEvidence ? (
                <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-3.5" aria-hidden="true" /> {insight.restrictedEvidence} more {insight.restrictedEvidence === 1 ? "quote sits" : "quotes sit"} in folders you can&apos;t open.</p>
              ) : null}
            </li>
          ))}
        </ol>
        <footer className="mt-6 text-sm text-muted-foreground">
          This report always shows the current wording of each insight and its quotes. Only members of the workspace can open it.
        </footer>
      </article>
    </div>
  );
}
