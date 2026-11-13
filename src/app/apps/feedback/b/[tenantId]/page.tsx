import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Layers, Megaphone, Rocket } from "lucide-react";

import { PortalChrome, type PortalTab } from "@/components/feedback/portal-chrome";
import { PublicUnavailable } from "@/components/feedback/public-unavailable";
import { EmptyState, PersonAvatar, StatusBadge, VoteCount } from "@/components/feedback/shared";
import { Progress } from "@/components/ui/progress";
import { loadPublicPortal, PRODUCT } from "@/lib/feedback/data";
import { STATUS_DISPLAY } from "@/lib/feedback/display";
import { groupByInitiative, groupRoadmap } from "@/lib/feedback/model";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ tab?: string | string[] }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId } = await params;
  const portal = await loadPublicPortal(tenantId).catch(() => null);
  return {
    title: portal ? `${portal.tenant.name} feedback` : "Feedback portal",
    robots: { index: false, follow: false },
  };
}

function formatDate(value: string | null) {
  if (!value) return "Just published";
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(value));
}

export default async function PublicPortalPage({ params, searchParams }: PageProps) {
  const { tenantId } = await params;
  const requested = (await searchParams).tab;
  const tab: PortalTab = requested === "ideas" || requested === "changelog" ? requested : "roadmap";
  let portal: Awaited<ReturnType<typeof loadPublicPortal>>;
  try {
    portal = await loadPublicPortal(tenantId);
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) notFound();
    return <PublicUnavailable message={error instanceof FleetError ? error.message : "This portal could not be loaded right now."} />;
  }
  const viewer = await getFleetUser(PRODUCT);
  const boardSlug = new Map(portal.boards.map((board) => [board.id, board.slug]));
  const postHref = (post: { id: string; boardId: string }) => `/apps/feedback/b/${tenantId}/${boardSlug.get(post.boardId) ?? ""}?post=${post.id}`;
  const columns = groupRoadmap(portal.posts);
  const initiatives = groupByInitiative(portal.posts, portal.initiatives).groups.filter((group) => group.total > 0);
  const firstBoard = portal.boards[0];
  const signInHref = `/apps/feedback/sign-in?next=${encodeURIComponent(firstBoard ? `/apps/feedback/b/${tenantId}/${firstBoard.slug}` : "/apps/feedback")}`;

  const intro: Record<PortalTab, { title: string; text: string }> = {
    ideas: { title: "Share an idea", text: `Tell the ${portal.tenant.name} team what would make the product better, and vote on what others asked for.` },
    roadmap: { title: "Roadmap", text: "What we're planning, building and have shipped. Every item links back to the ideas and votes behind it." },
    changelog: { title: "Changelog", text: "New features and improvements, with the ideas that asked for them." },
  };

  return (
    <PortalChrome tenantId={tenantId} companyName={portal.tenant.name} active={tab} signedIn={Boolean(viewer)} signInHref={signInHref}>
      <main className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="brand-heading text-3xl sm:text-4xl">{intro[tab].title}</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{intro[tab].text}</p>
          </div>
          {tab !== "ideas" && firstBoard ? (
            <Link href={`/apps/feedback/b/${tenantId}/${firstBoard.slug}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Suggest an idea <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>

        {tab === "ideas" ? (
          portal.boards.length === 0 ? (
            <EmptyState icon={<Layers />} title="No public boards yet">Check back soon: the team hasn&apos;t opened a board to the public yet.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {portal.boards.map((board) => (
                <Link key={board.id} href={`/apps/feedback/b/${tenantId}/${board.slug}`} className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-shadow hover:border-primary/40 hover:shadow-md">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Layers className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="brand-heading block text-lg">{board.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{board.description || "Ideas and requests for the team."}</span>
                  </span>
                  <ArrowRight className="mt-1 size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )
        ) : null}

        {tab === "roadmap" ? (
          <>
            {initiatives.length ? (
              <section aria-label="Releases and themes" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {initiatives.map((group) => (
                  <article key={group.initiative.id} className="rounded-2xl border border-border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      {group.initiative.kind === "release" ? <Rocket className="size-3.5" /> : <Layers className="size-3.5" />}
                      {group.initiative.kind === "release" ? "Release" : "Theme"}
                      {group.initiative.targetDate ? <><span aria-hidden="true">·</span><CalendarDays className="size-3.5" />{formatDate(group.initiative.targetDate)}</> : null}
                    </p>
                    <h2 className="brand-heading mt-1 text-base">{group.initiative.name}</h2>
                    <Progress value={group.progress} className="mt-3 h-2" aria-label={`${group.progress}% shipped`} />
                    <p className="mt-2 text-xs text-muted-foreground">{group.done} of {group.total} shipped</p>
                  </article>
                ))}
              </section>
            ) : null}
            <section aria-label="Roadmap" className="grid gap-4 md:grid-cols-3">
              {columns.map((column) => (
                <div key={column.status} className="rounded-2xl bg-muted/70 p-3">
                  <div className="flex items-center justify-between px-1 pb-3">
                    <StatusBadge status={column.status} />
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">{column.posts.length}</span>
                  </div>
                  <ul className="grid gap-2">
                    {column.posts.length === 0 ? <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Nothing {STATUS_DISPLAY[column.status].toLowerCase()} right now.</li> : null}
                    {column.posts.map((post) => (
                      <li key={post.id}>
                        <Link href={postHref(post)} className="flex gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm">
                          <VoteCount votes={post.voteCount} className="w-11 py-1" />
                          <span className="min-w-0 flex-1 self-center text-sm font-bold leading-snug">{post.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        ) : null}

        {tab === "changelog" ? (
          portal.changelog.length === 0 ? (
            <EmptyState icon={<Megaphone />} title="No announcements yet">When the team ships something you asked for, it shows up here.</EmptyState>
          ) : (
            <ol className="grid max-w-3xl gap-6">
              {portal.changelog.map((entry) => (
                <li key={entry.id} className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6">
                  <time className="pt-1 text-sm font-semibold text-muted-foreground" dateTime={entry.publishedAt ?? undefined}>{formatDate(entry.publishedAt)}</time>
                  <article className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="brand-heading text-xl">{entry.title}</h2>
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <PersonAvatar person={entry.author} size="xs" /> {entry.author.name}
                    </p>
                    {entry.body ? <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{entry.body}</p> : null}
                    {entry.posts.length ? (
                      <ul className="mt-4 grid gap-1.5">
                        {entry.posts.map((post) => (
                          <li key={post.id}>
                            <Link href={postHref(post)} className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-sm hover:bg-secondary">
                              <Check className="size-4 text-primary" aria-hidden="true" />
                              <span className="font-medium">{post.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </main>
    </PortalChrome>
  );
}
