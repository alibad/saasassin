import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import styles from "@/components/research/research.module.css";
import { Badge } from "@/components/ui/badge";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";
import { loadReport, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";
import { formatTimestamp } from "@/lib/research/transcript";

export const metadata: Metadata = {
  title: "Research report | SaaSassin Research",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ tenantId: string; projectId: string; reportId: string }> };

/** Read-only report for workspace members. Access and folder restrictions are checked on every view. */
export default async function ResearchReportPage({ params }: PageProps) {
  const { tenantId, projectId, reportId } = await params;
  const user = await getFleetUser(RESEARCH_SLUG);
  if (!user) redirect(`/apps/${RESEARCH_SLUG}/sign-in`);

  let data: Awaited<ReturnType<typeof loadReport>>;
  try {
    const { role } = await requireResearchMember(tenantId, user);
    data = await loadReport(tenantId, projectId, reportId, { uid: user.uid, role });
  } catch (error) {
    if (!(error instanceof FleetError)) throw error;
    return (
      <main className={`fleet-app ${styles.app}`}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.panelPad} grid gap-2`}>
            <h1 className="text-xl font-extrabold"><Lock className="inline" aria-hidden /> This report is not available to you</h1>
            <p className={styles.hint}>Reports are shared with members of the research workspace only. Ask a workspace admin to invite {user.email}.</p>
            <Link className="underline" href={`/apps/${RESEARCH_SLUG}`}>Go to SaaSassin Research</Link>
          </div>
        </div>
      </main>
    );
  }

  const { report, project, sections, missingInsights } = data;
  return (
    <main className={`fleet-app ${styles.app}`}>
      <article className={`${styles.shell} grid gap-5`}>
        <Link className="flex w-fit items-center gap-1 text-sm underline" href={`/apps/${RESEARCH_SLUG}`}><ArrowLeft className="size-4" aria-hidden /> SaaSassin Research</Link>
        <header className={`${styles.panel} ${styles.panelPad} ${styles.accentBar} grid gap-2`}>
          <p className={styles.eyebrow}>Research report · {project.name}</p>
          <h1 className="text-3xl font-extrabold break-words">{report.title}</h1>
          <p className={styles.hint}>By {report.createdByEmail} · {sections.length} insight{sections.length === 1 ? "" : "s"} · read-only, visible to workspace members</p>
          {report.intro ? <p className="whitespace-pre-wrap">{report.intro}</p> : null}
        </header>
        {missingInsights > 0 ? <p className={styles.hint}>{missingInsights} insight(s) in this report were deleted or sit in folders you cannot open.</p> : null}
        {sections.map(({ insight, theme, evidence }, index) => (
          <section key={insight.id} className={`${styles.panel} ${styles.panelPad} grid gap-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{index + 1}</Badge>
              {theme ? <Badge variant="outline">{theme}</Badge> : null}
            </div>
            <h2 className="text-xl font-extrabold break-words">{insight.title}</h2>
            {insight.body ? <p className="whitespace-pre-wrap">{insight.body}</p> : null}
            <p className={styles.eyebrow}>Evidence ({evidence.length})</p>
            {evidence.map(({ highlight, sourceTitle, participant, speaker, startMs }) => (
              <figure key={highlight.id} className="grid gap-1">
                <blockquote className={styles.quote}>“{highlight.quote}”</blockquote>
                <figcaption className={styles.hint}>
                  {speaker || participant} · {sourceTitle}{startMs !== null ? ` @ ${formatTimestamp(startMs)}` : ""}
                  {highlight.tags.length ? ` · #${highlight.tags.join(" #")}` : ""}
                </figcaption>
              </figure>
            ))}
            {insight.restrictedEvidence ? <p className={styles.hint}><Lock className="inline size-3" aria-hidden /> {insight.restrictedEvidence} more evidence link(s) are in restricted folders.</p> : null}
          </section>
        ))}
      </article>
    </main>
  );
}
