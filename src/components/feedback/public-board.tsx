"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronUp, LoaderCircle, MessageSquare, Search } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { loadPublicBoard, loadPublicPost } from "@/lib/feedback/data";
import { canAddVote, filterPosts, findSimilarPosts, POST_STATUSES, sortPosts, STATUS_LABELS, type PostFilter, type PostSort } from "@/lib/feedback/model";

import styles from "./feedback.module.css";
import { apiJson, formatDate, StatusBadge, TagChip } from "./shared";

type BoardData = Awaited<ReturnType<typeof loadPublicBoard>>;
type PostDetail = Awaited<ReturnType<typeof loadPublicPost>>;

export function PublicBoard({ initial, tenantId, initialPostId }: { initial: BoardData; tenantId: string; initialPostId?: string | null }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<NonNullable<PostFilter["status"]>>("active");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<PostSort>("votes");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(
    initialPostId && initial.posts.some((post) => post.id === initialPostId) ? initialPostId : null,
  );

  const base = `/api/feedback/public/${tenantId}`;
  const boardPath = `/apps/feedback/b/${tenantId}/${data.board.slug}`;
  const signInHref = `/apps/feedback/sign-in?next=${encodeURIComponent(boardPath)}`;
  const tagsById = useMemo(() => new Map(data.tags.map((entry) => [entry.id, entry])), [data.tags]);
  const similar = useMemo(() => (title.trim().length >= 4 ? findSimilarPosts(title, data.posts, { limit: 3 }) : []), [title, data.posts]);
  const voted = new Set(data.viewer?.votes ?? []);

  const visible = useMemo(
    () => sortPosts(filterPosts(data.posts, { status, tag: tag === "all" ? null : tag, query }), sort),
    [data.posts, status, tag, query, sort],
  );

  async function refresh() {
    setData(await apiJson<BoardData>(`${base}/boards/${data.board.slug}`));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiJson(`${base}/boards/${data.board.slug}`, { method: "POST", body: JSON.stringify({ title, description }) });
      setTitle("");
      setDescription("");
      setSort("newest");
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function vote(postId: string) {
    if (!data.viewer) {
      setError("Sign in to vote. Your vote is counted once, and you can take it back any time.");
      return;
    }
    setVoting(postId);
    setError(null);
    try {
      const result = await apiJson<{ voted: boolean; voteCount: number }>(`${base}/posts/${postId}/vote`, { method: "POST" });
      setData((current) => ({
        ...current,
        posts: current.posts.map((post) => (post.id === postId ? { ...post, voteCount: result.voteCount } : post)),
        viewer: current.viewer && {
          ...current.viewer,
          votes: result.voted ? [...current.viewer.votes, postId] : current.viewer.votes.filter((id) => id !== postId),
        },
      }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setVoting(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={`/apps/feedback/b/${tenantId}`}>
            <span className={styles.mark}>FB</span>
            <span>{data.tenant.name}</span>
          </Link>
          <div className={styles.row}>
            <Button asChild variant="outline" size="sm"><Link href={`/apps/feedback/b/${tenantId}`}>Roadmap &amp; changelog</Link></Button>
            {data.viewer ? (
              <span className={styles.muted}>Signed in as {data.viewer.name}</span>
            ) : (
              <Button asChild size="sm"><Link href={signInHref}>Sign in to post and vote</Link></Button>
            )}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <p className={styles.eyebrow}>Public feedback board</p>
        <h1 className={styles.title}>{data.board.name}</h1>
        {data.board.description ? <p className={styles.lede}>{data.board.description}</p> : null}

        {error ? (
          <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>
        ) : null}

        <div className={styles.grid2}>
          <section aria-label="Posts">
            <div className={styles.toolbar}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 size-4 opacity-50" aria-hidden="true" />
                <Input className="pl-8" placeholder="Search ideas or #number" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search posts" />
              </div>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  {POST_STATUSES.map((entry) => <SelectItem key={entry} value={entry}>{STATUS_LABELS[entry]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger aria-label="Filter by tag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {data.tags.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(value) => setSort(value as PostSort)}>
                <SelectTrigger aria-label="Sort posts"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="votes">Most votes</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="comments">Most discussed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={styles.stack}>
              {visible.length === 0 ? (
                <div className={styles.empty}>
                  {data.posts.length === 0 ? "No ideas yet. Be the first to suggest one." : "No posts match these filters."}
                </div>
              ) : null}
              {visible.map((post) => {
                const hasVote = voted.has(post.id);
                const closed = !canAddVote(post.status);
                return (
                  <article key={post.id} className={styles.postCard}>
                    <button
                      type="button"
                      className={styles.voteButton}
                      aria-pressed={hasVote}
                      aria-label={`${hasVote ? "Remove your vote from" : "Vote for"} ${post.title} (${post.voteCount} votes)`}
                      disabled={voting === post.id || (closed && !hasVote)}
                      onClick={() => vote(post.id)}
                    >
                      {voting === post.id ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronUp className="size-4" aria-hidden="true" />}
                      <span>{post.voteCount}</span>
                    </button>
                    <div>
                      <button type="button" className={styles.postTitle} onClick={() => setOpenPostId(post.id)}>{post.title}</button>
                      {post.description ? <p className={styles.postBody}>{post.description.length > 220 ? `${post.description.slice(0, 220)}…` : post.description}</p> : null}
                      <div className={styles.postMeta}>
                        <StatusBadge status={post.status} />
                        <span className={styles.mono}>#{post.number}</span>
                        <span>{post.author.name}</span>
                        <span>{formatDate(post.createdAt)}</span>
                        <span className={styles.row}><MessageSquare className="size-3" aria-hidden="true" /> {post.commentCount}</span>
                        {post.tags.map((id) => { const entry = tagsById.get(id); return entry ? <TagChip key={id} tag={entry} /> : null; })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.panel} aria-label="Suggest an idea">
            <h2 className="text-lg font-bold">Suggest an idea</h2>
            {data.viewer ? (
              <form className={`${styles.stack} mt-3`} onSubmit={submit}>
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-title">Title</Label>
                  <Input id="fb-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required minLength={4} placeholder="Short, specific summary" />
                </div>
                {similar.length ? (
                  <div className={styles.response} aria-live="polite">
                    <p className="text-xs font-bold">Similar ideas already here. Vote instead?</p>
                    <ul className="mt-1 grid gap-1">
                      {similar.map((post) => (
                        <li key={post.id}>
                          <button type="button" className="text-left text-sm underline" onClick={() => setOpenPostId(post.id)}>
                            #{post.number} {post.title} · {post.voteCount} votes
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-description">Details</Label>
                  <Textarea id="fb-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={5} placeholder="What problem would this solve for you?" />
                </div>
                <Button type="submit" disabled={submitting || title.trim().length < 4}>
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null} Post idea
                </Button>
                <p className={`${styles.muted} text-xs`}>Your post counts as your first vote.</p>
              </form>
            ) : (
              <div className={`${styles.stack} mt-3`}>
                <p className={styles.muted}>Reading is open to everyone. Sign in to post ideas, vote once per idea, and comment.</p>
                <Button asChild><Link href={signInHref}>Sign in or create account</Link></Button>
              </div>
            )}
          </aside>
        </div>
      </div>

      {openPostId ? <PostDialog
        key={openPostId}
        tenantId={tenantId}
        postId={openPostId}
        signedIn={Boolean(data.viewer)}
        signInHref={signInHref}
        onClose={() => setOpenPostId(null)}
        onCommented={refresh}
        tagsById={tagsById}
      /> : null}
    </main>
  );
}

function PostDialog({
  tenantId,
  postId,
  signedIn,
  signInHref,
  onClose,
  onCommented,
  tagsById,
}: {
  tenantId: string;
  postId: string;
  signedIn: boolean;
  signInHref: string;
  onClose: () => void;
  onCommented: () => Promise<void>;
  tagsById: Map<string, BoardData["tags"][number]>;
}) {
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/feedback/public/${tenantId}/posts/${postId}`;

  useEffect(() => {
    let active = true;
    apiJson<PostDetail>(url)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [url]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson(`${url}/comments`, { method: "POST", body: JSON.stringify({ content: comment }) });
      setComment("");
      setDetail(await apiJson<PostDetail>(url));
      await onCommented();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {!detail ? (
          <>
            <DialogHeader><DialogTitle>{error ? "Post unavailable" : "Loading post"}</DialogTitle><DialogDescription>{error ?? "Fetching the discussion."}</DialogDescription></DialogHeader>
            {!error ? <LoaderCircle className="size-5 animate-spin" /> : null}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{detail.post.title}</DialogTitle>
              <DialogDescription>
                #{detail.post.number} by {detail.post.author.name} · {formatDate(detail.post.createdAt)} · {detail.post.voteCount} votes
              </DialogDescription>
            </DialogHeader>
            <div className={styles.row}>
              <StatusBadge status={detail.post.status} />
              {detail.post.tags.map((id) => { const entry = tagsById.get(id); return entry ? <TagChip key={id} tag={entry} /> : null; })}
            </div>
            {detail.post.description ? <p className="whitespace-pre-wrap text-sm leading-6">{detail.post.description}</p> : null}
            {detail.original ? (
              <div className={styles.response}>Merged into <strong>#{detail.original.number} {detail.original.title}</strong>. Votes now count there.</div>
            ) : null}
            {detail.post.response ? (
              <div className={styles.response}>
                <strong>{detail.post.response.by?.name ?? "Team"}</strong> · {formatDate(detail.post.response.at)}
                <p className="mt-1 whitespace-pre-wrap">{detail.post.response.text}</p>
              </div>
            ) : null}
            <section className={styles.stack} aria-label="Comments">
              <h3 className="font-bold">Comments ({detail.comments.length})</h3>
              {detail.comments.length === 0 ? <p className={styles.muted}>No comments yet.</p> : null}
              {detail.comments.map((entry) => (
                <div key={entry.id} className={styles.comment}>
                  <div className="text-xs"><strong>{entry.author.name}</strong> · {formatDate(entry.createdAt)}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.content}</p>
                </div>
              ))}
              {error ? <p className={styles.error}>{error}</p> : null}
              {detail.post.status === "duplicate" ? null : signedIn ? (
                <form className={styles.stack} onSubmit={send}>
                  <Label htmlFor="fb-comment">Add a comment</Label>
                  <Textarea id="fb-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={5000} />
                  <Button type="submit" disabled={busy || !comment.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Comment</Button>
                </form>
              ) : (
                <Button asChild variant="outline"><Link href={signInHref}>Sign in to comment</Link></Button>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
