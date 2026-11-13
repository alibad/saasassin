"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronUp, Lightbulb, LoaderCircle, MessageSquare, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { loadPublicBoard, loadPublicPost } from "@/lib/feedback/data";
import { canAddVote, filterPosts, findSimilarPosts, POST_STATUSES, sortPosts, type PostFilter, type PostSort } from "@/lib/feedback/model";
import type { PersonRef } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

import { PortalChrome } from "./portal-chrome";
import { apiJson, EmptyState, formatDate, PersonAvatar, STATUS_DISPLAY, StatusBadge, TagChip, timeAgo } from "./shared";

type BoardData = Awaited<ReturnType<typeof loadPublicBoard>>;
type PostDetail = Awaited<ReturnType<typeof loadPublicPost>>;

function Byline({ person, at, className }: { person: PersonRef; at: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <PersonAvatar person={person} size="xs" />
      <span className="font-medium text-foreground/80">{person.name}</span>
      {person.team ? <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Team</Badge> : null}
      <span>· {timeAgo(at)}</span>
    </span>
  );
}

/** A company's public board: search and filter ideas, vote once each, post, and read the thread. */
export function PublicBoard({ initial, tenantId, initialPostId }: { initial: BoardData; tenantId: string; initialPostId?: string | null }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<NonNullable<PostFilter["status"]>>("active");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<PostSort>("votes");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
    setFormError(null);
    try {
      await apiJson(`${base}/boards/${data.board.slug}`, { method: "POST", body: JSON.stringify({ title, description }) });
      setTitle("");
      setDescription("");
      setSort("newest");
      setStatus("active");
      toast({ title: "Thanks! Your idea is posted", description: "It counts as your first vote." });
      await refresh();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function vote(postId: string) {
    if (!data.viewer) {
      toast({ title: "Sign in to vote", description: "Your vote counts once, and you can take it back any time." });
      return;
    }
    setVoting(postId);
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
      toast({ title: "Your vote didn't count", description: (cause as Error).message, variant: "destructive" });
    } finally {
      setVoting(null);
    }
  }

  return (
    <PortalChrome tenantId={tenantId} companyName={data.tenant.name} active="ideas" signedIn={Boolean(data.viewer)} signInHref={signInHref}>
      <main className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h1 className="brand-heading text-3xl sm:text-4xl">{data.board.name}</h1>
          {data.board.description ? <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{data.board.description}</p> : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="h-10 rounded-full pl-9" placeholder="Search ideas" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search ideas" />
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as PostSort)}>
              <SelectTrigger className="h-10 w-36 rounded-full" aria-label="Sort ideas"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="votes">Top</SelectItem>
                <SelectItem value="newest">New</SelectItem>
                <SelectItem value="comments">Most discussed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className="h-10 w-36 rounded-full" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Open ideas</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
                {POST_STATUSES.filter((entry) => entry !== "duplicate").map((entry) => <SelectItem key={entry} value={entry}>{STATUS_DISPLAY[entry]}</SelectItem>)}
              </SelectContent>
            </Select>
            {data.tags.length ? (
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger className="h-10 w-36 rounded-full" aria-label="Filter by tag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics</SelectItem>
                  {data.tags.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <ul className="mt-5 grid gap-3">
            {visible.length === 0 ? (
              <li>
                <EmptyState icon={<Lightbulb />} title={data.posts.length === 0 ? "Be the first to share an idea" : "No ideas match"}>
                  {data.posts.length === 0 ? "What would make the product better for you? Your idea starts with your own vote." : "Try another filter, or post it as a new idea."}
                </EmptyState>
              </li>
            ) : null}
            {visible.map((post) => {
              const hasVote = voted.has(post.id);
              const closed = !canAddVote(post.status);
              return (
                <li key={post.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-sm">
                  <button
                    type="button"
                    className={cn(
                      "flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-xl border py-2 font-bold tabular-nums transition-colors",
                      hasVote ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary hover:text-primary",
                      closed && !hasVote && "opacity-60",
                    )}
                    aria-pressed={hasVote}
                    aria-label={`${hasVote ? "Remove your vote from" : "Vote for"} ${post.title} (${post.voteCount} votes)`}
                    disabled={voting === post.id || (closed && !hasVote)}
                    onClick={() => vote(post.id)}
                  >
                    {voting === post.id ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronUp className="size-5" aria-hidden="true" />}
                    <span className="text-sm leading-none">{post.voteCount}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-left text-base font-bold leading-snug hover:text-primary" onClick={() => setOpenPostId(post.id)}>{post.title}</button>
                    {post.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.description}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                      {post.status !== "open" ? <StatusBadge status={post.status} className="h-5 text-[11px]" /> : null}
                      <Byline person={post.author} at={post.createdAt} />
                      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setOpenPostId(post.id)}>
                        <MessageSquare className="size-3.5" aria-hidden="true" /> {post.commentCount}
                      </button>
                      {post.tags.map((id) => { const entry = tagsById.get(id); return entry ? <TagChip key={id} tag={entry} className="h-5 text-[11px]" /> : null; })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Suggest an idea">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_-28px_rgb(0_0_0/0.4)]">
            <h2 className="brand-heading text-lg">Suggest an idea</h2>
            {data.viewer ? (
              <form className="mt-4 grid gap-3" onSubmit={submit}>
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-title">Title</Label>
                  <Input id="fb-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required minLength={4} placeholder="Short, specific summary" />
                </div>
                {similar.length ? (
                  <div className="rounded-xl bg-secondary/70 p-3" aria-live="polite">
                    <p className="text-xs font-bold text-secondary-foreground">Already asked? Vote instead:</p>
                    <ul className="mt-1.5 grid gap-1">
                      {similar.map((post) => (
                        <li key={post.id}>
                          <button type="button" className="text-left text-sm font-medium hover:underline" onClick={() => setOpenPostId(post.id)}>
                            {post.title} <span className="text-muted-foreground">· {post.voteCount} votes</span>
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
                {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
                <Button type="submit" className="h-10" disabled={submitting || title.trim().length < 4}>
                  {submitting ? <LoaderCircle className="animate-spin" /> : null} Post idea
                </Button>
                <p className="text-xs text-muted-foreground">Your idea counts as your first vote.</p>
              </form>
            ) : (
              <div className="mt-3 grid gap-4">
                <p className="text-sm text-muted-foreground">Anyone can read this board. Sign in to post ideas, vote once on each, and join the conversation.</p>
                <Button asChild className="h-10"><Link href={signInHref}>Sign in to post and vote</Link></Button>
              </div>
            )}
          </div>
        </aside>
      </main>

      {openPostId ? (
        <PostDialog
          key={openPostId}
          tenantId={tenantId}
          postId={openPostId}
          signedIn={Boolean(data.viewer)}
          signInHref={signInHref}
          onClose={() => setOpenPostId(null)}
          onCommented={refresh}
          tagsById={tagsById}
        />
      ) : null}
    </PortalChrome>
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {!detail ? (
          <DialogHeader>
            <DialogTitle>{error ? "This idea isn't available" : "Loading…"}</DialogTitle>
            <DialogDescription>{error ?? "Fetching the conversation."}</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader className="text-left">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.post.status} />
                {detail.post.tags.map((id) => { const entry = tagsById.get(id); return entry ? <TagChip key={id} tag={entry} /> : null; })}
              </div>
              <DialogTitle className="brand-heading pt-2 text-2xl leading-snug">{detail.post.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Byline person={detail.post.author} at={detail.post.createdAt} />
                  <span>{detail.post.voteCount} votes</span>
                </div>
              </DialogDescription>
            </DialogHeader>
            {detail.post.description ? <p className="whitespace-pre-wrap text-[15px] leading-7">{detail.post.description}</p> : null}
            {detail.original ? (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm">This was merged into <strong>{detail.original.title}</strong>, where its votes now count.</p>
            ) : null}
            {detail.post.response ? (
              <div className="rounded-xl border border-primary/25 bg-secondary/60 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <PersonAvatar person={detail.post.response.by} size="sm" />
                  <strong>{detail.post.response.by.name}</strong>
                  <Badge variant="secondary" className="h-5 bg-primary text-[10px] text-primary-foreground">Team</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(detail.post.response.at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.post.response.text}</p>
              </div>
            ) : null}
            <section className="grid gap-4" aria-label="Comments">
              <h3 className="text-sm font-bold">{detail.comments.length ? `${detail.comments.length} comments` : "Comments"}</h3>
              {detail.comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet. Add the detail that would help the team.</p> : null}
              <ol className="grid gap-4">
                {detail.comments.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <PersonAvatar person={entry.author} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <strong>{entry.author.name}</strong>
                        {entry.author.team ? <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Team</Badge> : null}
                        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
              {detail.post.status === "duplicate" ? null : signedIn ? (
                <form className="grid gap-2" onSubmit={send}>
                  <Label htmlFor="fb-comment" className="sr-only">Add a comment</Label>
                  <Textarea id="fb-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={5000} placeholder="Add a comment" />
                  <Button type="submit" className="justify-self-end" disabled={busy || !comment.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : null} Comment</Button>
                </form>
              ) : (
                <Button asChild variant="outline" className="justify-self-start"><Link href={signInHref}>Sign in to comment</Link></Button>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
