import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "@/components/feedback/feedback.module.css";
import { PublicUnavailable } from "@/components/feedback/public-unavailable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadPublicPortal } from "@/lib/feedback/data";
import { groupRoadmap, STATUS_LABELS } from "@/lib/feedback/model";
import { FleetError } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Roadmap and changelog · SaaSassin Feedback",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Just published";
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(value));
}

export default async function PublicPortalPage({ params }: PageProps) {
  const { tenantId } = await params;
  let portal: Awaited<ReturnType<typeof loadPublicPortal>>;
  try {
    portal = await loadPublicPortal(tenantId);
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) notFound();
    return <PublicUnavailable message={error instanceof FleetError ? error.message : "This portal could not be loaded right now."} />;
  }
  const boardSlug = new Map(portal.boards.map((board) => [board.id, board.slug]));
  const columns = groupRoadmap(portal.posts);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}><span className={styles.mark}>FB</span><span>{portal.tenant.name}</span></span>
          <Link className="text-sm underline" href="/apps/feedback">Powered by SaaSassin Feedback</Link>
        </div>
      </header>
      <div className={styles.shell}>
        <p className={styles.eyebrow}>Public product feedback</p>
        <h1 className={styles.title}>{portal.tenant.name}</h1>
        <p className={styles.lede}>Suggest ideas, vote on what matters, follow what is planned, and see what shipped.</p>

        <Tabs defaultValue="roadmap" className={`${styles.tabs} mt-6`}>
          <TabsList>
            <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
            <TabsTrigger value="boards">Boards ({portal.boards.length})</TabsTrigger>
            <TabsTrigger value="changelog">Changelog ({portal.changelog.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="roadmap">
            <div className={styles.roadmap}>
              {columns.map((column) => (
                <section key={column.status} className={styles.roadmapColumn} aria-label={`${column.label} posts`}>
                  <div className={styles.roadmapHead} data-status={column.status}>
                    <span>{column.label}</span><span className={styles.mono}>{column.posts.length}</span>
                  </div>
                  {column.posts.length === 0 ? <p className="p-3 text-sm opacity-70">Nothing {STATUS_LABELS[column.status].toLowerCase()} yet.</p> : null}
                  {column.posts.map((post) => (
                    <Link key={post.id} className={styles.roadmapItem} href={`/apps/feedback/b/${tenantId}/${boardSlug.get(post.boardId) ?? ""}`}>
                      <strong className="block text-sm">{post.title}</strong>
                      <span className={`${styles.mono} opacity-70`}>#{post.number} · {post.voteCount} votes</span>
                    </Link>
                  ))}
                </section>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="boards">
            <div className={`${styles.stack} mt-4`}>
              {portal.boards.length === 0 ? <div className={styles.empty}>No public boards yet.</div> : null}
              {portal.boards.map((board) => (
                <Link key={board.id} href={`/apps/feedback/b/${tenantId}/${board.slug}`} className={`${styles.panel} block no-underline`}>
                  <strong className="text-lg">{board.name}</strong>
                  {board.description ? <p className={styles.muted}>{board.description}</p> : null}
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="changelog">
            <div className={`${styles.panel} mt-4`}>
              {portal.changelog.length === 0 ? <p className={styles.muted}>No releases announced yet.</p> : null}
              {portal.changelog.map((entry) => (
                <article key={entry.id} className={styles.changelogEntry}>
                  <p className={styles.eyebrow}>{formatDate(entry.publishedAt)}</p>
                  <h2 className="text-xl font-bold">{entry.title}</h2>
                  {entry.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.body}</p> : null}
                  {entry.posts.length ? (
                    <ul className="mt-3 grid gap-1 text-sm">
                      {entry.posts.map((post) => (
                        <li key={post.id}>
                          <Link className="underline" href={`/apps/feedback/b/${tenantId}/${boardSlug.get(post.boardId) ?? ""}`}>Completed: #{post.number} {post.title}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
