import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Lock, Mail, ShieldCheck } from "lucide-react";

import { TrustMark } from "@/brands/trust/mark";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { getPublicTrustCenter } from "@/lib/trust/public";

type PageProps = { params: Promise<{ tenantId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId } = await params;
  const center = await getPublicTrustCenter(tenantId);
  return {
    title: center ? `${center.displayName} trust center` : "Trust center",
    robots: { index: false, follow: false },
  };
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

const surface = "rounded-lg border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
      <div className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${value}%` }} />
    </div>
  );
}

export default async function PublicTrustCenterPage({ params }: PageProps) {
  const { tenantId } = await params;
  const center = await getPublicTrustCenter(tenantId);
  if (!center) notFound();
  const initial = center.displayName.trim().charAt(0).toUpperCase() || "T";
  const byFramework = new Map<string, NonNullable<typeof center.categories>>();
  for (const category of center.categories ?? []) byFramework.set(category.framework, [...(byFramework.get(category.framework) ?? []), category]);

  return (
    <div className="min-h-dvh bg-brand-subtle text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background" aria-hidden="true">{initial}</span>
          <span className="font-semibold">{center.displayName}</span>
          <span className="text-sm text-muted-foreground">Trust center</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
      </header>

      <main className="mx-auto grid w-full grid-cols-1 max-w-5xl gap-6 px-4 py-10 sm:px-6">
        <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"><ShieldCheck className="size-3.5" /> Security and compliance</p>
            <h1 className="brand-heading mt-3 text-3xl sm:text-4xl">How {center.displayName} protects your data</h1>
            {center.headline ? <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-muted-foreground">{center.headline}</p> : null}
          </div>
          {center.contactEmail ? (
            <a className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" href={`mailto:${center.contactEmail}`}>
              <Mail className="size-4" /> Contact security
            </a>
          ) : null}
        </section>

        {center.frameworks?.length || center.readiness ? (
          <section className="grid gap-4 md:grid-cols-2" aria-label="Program">
            {center.frameworks?.map((framework) => (
              <article key={framework.id} className={`${surface} p-5`}>
                <p className="text-xs font-medium text-muted-foreground">Framework</p>
                <p className="mt-1 font-semibold">{framework.name}</p>
                <p className="mt-2 text-xs text-muted-foreground">Readiness tracked against control library <span className="font-mono">{framework.libraryVersion}</span>. Tracking readiness is not the same as holding a certification or an audit report.</p>
              </article>
            ))}
            {center.readiness ? (
              <>
                <article className={`${surface} p-5`}>
                  <p className="text-xs font-medium text-muted-foreground">Control coverage</p>
                  <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{center.readiness.coveragePercent}%</p>
                  <Bar value={center.readiness.coveragePercent} label={`${center.readiness.coveragePercent}% control coverage`} />
                  <p className="mt-2 text-xs text-muted-foreground">of {center.readiness.applicableControls} applicable controls are implemented with current evidence</p>
                </article>
                <article className={`${surface} p-5`}>
                  <p className="text-xs font-medium text-muted-foreground">Evidence freshness</p>
                  <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{center.readiness.freshnessPercent}%</p>
                  <Bar value={center.readiness.freshnessPercent} label={`${center.readiness.freshnessPercent}% evidence freshness`} />
                  <p className="mt-2 text-xs text-muted-foreground">of tracked evidence is within its review window</p>
                </article>
              </>
            ) : null}
          </section>
        ) : null}
        {center.readiness ? <p className="-mt-3 text-xs text-muted-foreground">Figures are self-reported by {center.displayName} and not independently verified.</p> : null}

        {byFramework.size ? (
          <section className={surface} aria-label="Controls by area">
            <div className="border-b border-border px-5 py-3"><h2 className="text-sm font-semibold">Controls by area</h2></div>
            {[...byFramework].map(([framework, categories]) => (
              <div key={framework} className="border-b border-border last:border-b-0">
                <p className="px-5 pt-4 text-xs font-medium text-muted-foreground">{framework}</p>
                <ul className="grid gap-x-8 px-5 pb-4 pt-2 sm:grid-cols-2">
                  {categories.map((category) => {
                    const value = category.applicable ? Math.round((category.implemented / category.applicable) * 100) : 0;
                    return (
                      <li key={category.category} className="grid gap-1.5 py-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span>{category.category}</span>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">{category.implemented}/{category.applicable}</span>
                        </div>
                        <Bar value={value} label={`${category.category}: ${category.implemented} of ${category.applicable} implemented`} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        {center.policies.length ? (
          <section className={surface} aria-label="Policies">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Policies</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" /> Available on request</span>
            </div>
            <ul className="divide-y divide-border">
              {center.policies.map((policy) => (
                <li key={policy.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 font-medium">{policy.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">v{policy.version} · approved {formatDay(policy.approvedAt)}</span>
                </li>
              ))}
            </ul>
            {center.contactEmail ? (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                To review a policy, email <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`mailto:${center.contactEmail}`}>{center.contactEmail}</a>.
              </p>
            ) : null}
          </section>
        ) : null}
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 pb-10 text-xs text-muted-foreground sm:px-6">
        <span>Information on this page is provided by {center.displayName}.</span>
        <Link href="/apps/trust" className="inline-flex items-center gap-1.5 font-medium hover:text-foreground"><TrustMark size={14} /> Published with Trust</Link>
      </footer>
    </div>
  );
}
