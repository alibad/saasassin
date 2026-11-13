"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, EyeOff, GitMerge, LoaderCircle, Lock, MessageSquare, Pencil, RotateCcw, StickyNote, Undo2, X } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { allowedTransitions, findSimilarPosts, type PostStatus } from "@/lib/feedback/model";
import type { Comment, PersonView, Post, Vote, VoterProfile } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

import type { AdminData } from "./feedback-workspace";
import { apiJson, formatDateTime, PersonAvatar, plural, STATUS_DISPLAY, StatusBadge, TagChip, timeAgo, VoteCount } from "./shared";

type Detail = { comments: Comment[]; voters: Vote[] | null; people: Record<string, PersonView> };

type TimelineItem =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "status"; at: string; event: Post["statusHistory"][number] };

/**
 * One post, as the team sees it: the request and who asked, its status, owner, release and
 * tags, the whole thread (team-only notes included), voters with their company, and the
 * admin tools to merge, reword or hide it. What each role can change mirrors the server.
 */
export function PostDetail({
  tenantId,
  post,
  data,
  isAdmin,
  canTriage,
  onChanged,
  onOpenPost,
  onClose,
}: {
  tenantId: string;
  post: Post;
  data: AdminData;
  isAdmin: boolean;
  canTriage: boolean;
  onChanged: () => Promise<void>;
  onOpenPost: (postId: string) => void;
  onClose?: () => void;
}) {
  const url = `/api/feedback/tenants/${tenantId}/posts/${post.id}`;
  const transitions = allowedTransitions(post.status);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Suggest the next step forward (open → planned → in progress → completed).
  const forward = ({ open: "planned", planned: "started", started: "completed" } as Partial<Record<PostStatus, PostStatus>>)[post.status];
  const [nextStatus, setNextStatus] = useState<PostStatus | "">(forward && transitions.includes(forward) ? forward : transitions[0] ?? "");
  const [note, setNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [hiding, setHiding] = useState<{ kind: "post" | "comment"; id: string; restore: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<Detail>(url)
      .then((result) => { if (active) { setDetail(result); setLoadError(null); } })
      .catch((cause: Error) => { if (active) setLoadError(cause.message); });
    return () => { active = false; };
  }, [url, version, post.commentCount, post.status]);

  const people = useMemo(() => ({ ...data.people, ...(detail?.people ?? {}) }), [data.people, detail?.people]);
  const board = data.boards.find((entry) => entry.id === post.boardId);
  const profilesByUid = useMemo(() => new Map(data.profiles.map((profile) => [profile.uid, profile])), [data.profiles]);
  const authorProfile = profilesByUid.get(post.author.uid);
  const original = post.originalId ? data.posts.find((entry) => entry.id === post.originalId) : null;
  const initiative = data.initiatives.find((entry) => entry.id === post.initiativeId);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...(detail?.comments ?? []).map((comment) => ({ kind: "comment" as const, at: comment.createdAt ?? "", comment })),
      ...post.statusHistory.map((event) => ({ kind: "status" as const, at: event.at, event })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [detail?.comments, post.statusHistory]);

  async function act(key: string, body: unknown, success: string, target = url, method = "POST") {
    setBusy(key);
    try {
      await apiJson(target, { method, body: JSON.stringify(body) });
      toast({ title: success });
      setVersion((value) => value + 1);
      await onChanged();
      return true;
    } catch (cause) {
      toast({ title: "That didn't go through", description: (cause as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function toggleTag(tagId: string) {
    const next = post.tags.includes(tagId) ? post.tags.filter((id) => id !== tagId) : [...post.tags, tagId];
    void act(`tag-${tagId}`, { action: "tags", tagIds: next }, "Tags updated");
  }

  return (
    <article className="flex flex-col" aria-label={`Post ${post.number}: ${post.title}`}>
      <header className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
        <VoteCount votes={post.voteCount} className="w-14 py-2 text-base" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1">{board?.isPublic === false ? <Lock className="size-3" aria-hidden="true" /> : null}{board?.name ?? "Board"}</span>
            <span aria-hidden="true">·</span>
            <span>#{post.number}</span>
            {post.hidden ? <Badge variant="destructive" className="ml-1">Hidden from public</Badge> : null}
          </p>
          <h2 className="brand-heading mt-1 text-xl leading-snug sm:text-2xl">{post.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <PersonAvatar person={post.author} people={people} size="sm" />
            <span className="font-semibold">{people[post.author.uid]?.name || post.author.name}</span>
            {authorProfile?.company ? <Badge variant="secondary">{authorProfile.company}</Badge> : null}
            {authorProfile?.segment ? <Badge variant="outline">{authorProfile.segment}</Badge> : null}
            <span className="text-muted-foreground">{timeAgo(post.createdAt)}</span>
          </div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 hidden lg:inline-flex" onClick={onClose} aria-label="Close post">
            <X />
          </Button>
        ) : null}
      </header>

      <div className="grid gap-6 p-5 sm:p-6">
        {post.description ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{post.description}</p> : <p className="text-sm text-muted-foreground">No details were added.</p>}

        {original ? (
          <button type="button" onClick={() => onOpenPost(original.id)} className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-left text-sm hover:bg-muted">
            <GitMerge className="size-4 text-muted-foreground" aria-hidden="true" />
            Merged into <strong>#{original.number} {original.title}</strong>
          </button>
        ) : null}

        <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <dt className="text-xs font-semibold text-muted-foreground">Status</dt>
            <dd><StatusBadge status={post.status} /></dd>
          </div>
          <div className="grid gap-1.5">
            <dt className="text-xs font-semibold text-muted-foreground">Owner</dt>
            <dd>
              <Select
                value={post.owner?.uid ?? "none"}
                disabled={!canTriage || busy !== null}
                onValueChange={(value) => void act("owner", { action: "assign", ownerUid: value === "none" ? null : value }, value === "none" ? "Owner cleared" : "Owner assigned")}
              >
                <SelectTrigger className="h-9 w-full" aria-label="Owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {data.members.map((member) => (
                    <SelectItem key={member.uid} value={member.uid}>
                      <PersonAvatar person={{ uid: member.uid, name: member.name || member.email }} people={people} size="xs" />
                      {people[member.uid]?.name || member.name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
          </div>
          <div className="grid gap-1.5">
            <dt className="text-xs font-semibold text-muted-foreground">Release or theme</dt>
            <dd>
              <Select
                value={post.initiativeId ?? "none"}
                disabled={!isAdmin || busy !== null}
                onValueChange={(value) => void act("initiative", { action: "initiative", initiativeId: value === "none" ? null : value }, "Roadmap grouping updated")}
              >
                <SelectTrigger className="h-9 w-full" aria-label="Release or theme"><SelectValue placeholder="None">{initiative?.name ?? "None"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {data.initiatives.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.kind === "release" ? "Release · " : ""}{entry.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </dd>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <dt className="text-xs font-semibold text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1.5">
              {data.tags.length === 0 ? <span className="text-sm text-muted-foreground">Create tags in Settings.</span> : null}
              {data.tags.map((tag) => {
                const on = post.tags.includes(tag.id);
                return canTriage ? (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={on}
                    disabled={busy !== null}
                    onClick={() => toggleTag(tag.id)}
                    className={cn("rounded-full transition-opacity", on ? "" : "opacity-45 hover:opacity-80")}
                  >
                    <TagChip tag={tag} className={on ? "border-foreground/25" : "border-dashed"} />
                  </button>
                ) : on ? <TagChip key={tag.id} tag={tag} /> : null;
              })}
            </dd>
          </div>
        </dl>

        {isAdmin && transitions.length ? (
          <section className="grid gap-3 rounded-xl border border-border bg-card p-4" aria-label="Update status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Update status</h3>
              <span className="text-xs text-muted-foreground">Your note appears on the post and the roadmap.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as PostStatus)}>
                <SelectTrigger className="h-9 w-full" aria-label="New status"><SelectValue placeholder="Choose a status" /></SelectTrigger>
                <SelectContent>{transitions.map((status) => <SelectItem key={status} value={status}>{STATUS_DISPLAY[status]}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder={nextStatus === "declined" ? "Explain why (required when declining)" : "Tell voters what's happening (optional)"}
                aria-label="Note to voters"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Email updates to voters aren&apos;t connected yet.</p>
              <Button
                disabled={busy !== null || !nextStatus || (nextStatus === "declined" && note.trim().length < 3)}
                onClick={() => void act("status", { action: "status", status: nextStatus, note }, `Moved to ${STATUS_DISPLAY[nextStatus as PostStatus]}`).then((ok) => ok && setNote(""))}
              >
                {busy === "status" ? <LoaderCircle className="animate-spin" /> : null} Update status
              </Button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4" aria-label="Activity">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            Activity <span className="font-medium text-muted-foreground">{plural(post.commentCount, "comment")}</span>
          </h3>
          {loadError ? <p className="text-sm text-destructive" role="alert">{loadError}</p> : null}
          {!detail && !loadError ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading the thread…</p> : null}
          {detail && timeline.length === 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground">No conversation yet. A team note is a good place to start: who asked, and why it matters.</p>
          ) : null}
          <ol className="grid gap-4">
            {timeline.map((item) => item.kind === "status" ? (
              <li key={`status-${item.at}-${item.event.to}`} className="flex gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><ArrowRightLeft className="size-3.5" aria-hidden="true" /></span>
                <div className="min-w-0 pt-1">
                  <p>
                    <strong>{item.event.by?.name ?? "The team"}</strong> moved this from {STATUS_DISPLAY[item.event.from]} to <StatusBadge status={item.event.to} className="mx-0.5 h-5 align-middle" />
                    <span className="ml-1 text-xs text-muted-foreground">{timeAgo(item.event.at)}</span>
                  </p>
                  {item.event.note ? <p className="mt-1.5 rounded-lg bg-secondary/60 px-3 py-2 text-foreground/90">{item.event.note}</p> : null}
                </div>
              </li>
            ) : (
              <li key={item.comment.id} className={cn("flex gap-3", item.comment.hidden && "opacity-60")}>
                <PersonAvatar person={item.comment.author} people={people} size="md" />
                <div className={cn(
                  "min-w-0 flex-1 rounded-xl border px-3.5 py-2.5",
                  item.comment.internal ? "border-brand-accent/50 bg-accent/60" : "border-border bg-card",
                )}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <strong>{people[item.comment.author.uid]?.name || item.comment.author.name}</strong>
                    {item.comment.internal ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-foreground"><StickyNote className="size-3" aria-hidden="true" /> Team only</span> : null}
                    <span className="text-xs text-muted-foreground">{timeAgo(item.comment.createdAt)}</span>
                    {item.comment.hidden ? <Badge variant="destructive">Hidden: {item.comment.hiddenReason}</Badge> : null}
                    {isAdmin && !item.comment.internal ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="ml-auto text-muted-foreground"
                        onClick={() => { setReason(""); setHiding({ kind: "comment", id: item.comment.id, restore: item.comment.hidden }); }}
                      >
                        {item.comment.hidden ? <><RotateCcw /> Restore</> : <><EyeOff /> Hide</>}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.comment.content}</p>
                </div>
              </li>
            ))}
          </ol>
          {canTriage ? (
            <form
              className="grid gap-2 rounded-xl border border-dashed border-border bg-card p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void act("note", { action: "note", content: internalNote }, "Note added").then((ok) => ok && setInternalNote(""));
              }}
            >
              <Label htmlFor={`note-${post.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><StickyNote className="size-3.5" /> Team note, never shown publicly</Label>
              <Textarea id={`note-${post.id}`} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={2} placeholder="Requested by three enterprise accounts this quarter…" />
              <Button type="submit" size="sm" variant="secondary" className="justify-self-end" disabled={busy !== null || !internalNote.trim()}>
                {busy === "note" ? <LoaderCircle className="animate-spin" /> : <MessageSquare />} Add note
              </Button>
            </form>
          ) : null}
        </section>

        {isAdmin ? (
          <section className="grid gap-3" aria-label="Voters">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              Voters <span className="font-medium text-muted-foreground">{detail?.voters ? detail.voters.length : "…"}</span>
            </h3>
            {detail?.voters?.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has voted yet.</p> : null}
            <ul className="grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {detail?.voters?.map((voter) => (
                <VoterRow
                  key={voter.id}
                  voter={voter}
                  people={people}
                  profile={profilesByUid.get(voter.uid) ?? null}
                  busy={busy !== null}
                  onSave={(company, segment) => act(`voter-${voter.uid}`, { company, segment }, "Customer details saved", `/api/feedback/tenants/${tenantId}/profiles/${encodeURIComponent(voter.uid)}`, "PUT").then(() => undefined)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {isAdmin ? (
          <Accordion type="single" collapsible className="rounded-xl border border-border bg-card px-4">
            {post.status === "duplicate" ? (
              <AccordionItem value="unmerge">
                <AccordionTrigger className="text-sm font-semibold"><span className="inline-flex items-center gap-2"><Undo2 className="size-4" /> Unmerge</span></AccordionTrigger>
                <AccordionContent className="grid gap-3 pb-4">
                  {post.hasMergeRecord ? (
                    <>
                      <p className="text-muted-foreground">Restores this post&apos;s previous status and gives back the votes that moved, except from people who have removed their vote since.</p>
                      <Button variant="outline" className="w-fit" disabled={busy !== null} onClick={() => void act("unmerge", { action: "unmerge" }, "Unmerged, votes restored")}>Unmerge post</Button>
                    </>
                  ) : <p className="text-muted-foreground">This post was merged before merges were recorded, so it can&apos;t be reversed automatically.</p>}
                </AccordionContent>
              </AccordionItem>
            ) : (
              <AccordionItem value="merge">
                <AccordionTrigger className="text-sm font-semibold"><span className="inline-flex items-center gap-2"><GitMerge className="size-4" /> Merge into another post</span></AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-muted-foreground">Votes move to the post you choose, and anyone who voted on both counts once.</p>
                  <Button variant="outline" className="mt-3" onClick={() => setMerging(true)}>Choose a post…</Button>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="edit">
              <AccordionTrigger className="text-sm font-semibold"><span className="inline-flex items-center gap-2"><Pencil className="size-4" /> Edit wording</span></AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-muted-foreground">Fix a typo or make the request clearer. The previous wording is kept in the activity log.</p>
                <Button variant="outline" className="mt-3" onClick={() => setEditing(true)}>Edit title and details</Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="moderate">
              <AccordionTrigger className="text-sm font-semibold"><span className="inline-flex items-center gap-2"><EyeOff className="size-4" /> {post.hidden ? "Hidden from public boards" : "Hide from public boards"}</span></AccordionTrigger>
              <AccordionContent className="pb-4">
                {post.hidden ? (
                  <>
                    <p className="text-muted-foreground">Hidden because: {post.hiddenReason}</p>
                    <Button variant="outline" className="mt-3" onClick={() => { setReason(""); setHiding({ kind: "post", id: post.id, restore: true }); }}>Restore post</Button>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">For spam or abuse. The reason is recorded and the post can be restored later.</p>
                    <Button variant="outline" className="mt-3 text-destructive" onClick={() => { setReason(""); setHiding({ kind: "post", id: post.id, restore: false }); }}>Hide post…</Button>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}

        <p className="text-xs text-muted-foreground">Posted {formatDateTime(post.createdAt)}{post.updatedAt ? ` · updated ${timeAgo(post.updatedAt)}` : ""}</p>
      </div>

      <Dialog open={hiding !== null} onOpenChange={(open) => { if (!open) setHiding(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hiding?.restore ? `Restore this ${hiding.kind}?` : `Hide this ${hiding?.kind ?? "post"}?`}</DialogTitle>
            <DialogDescription>
              {hiding?.restore ? "It will appear on public boards again." : "It disappears from public boards. The reason is kept in the activity log, and you can restore it later."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-moderation-reason">Reason</Label>
            <Input id="fb-moderation-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={hiding?.restore ? "Optional" : "Spam, abuse, personal data…"} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHiding(null)}>Cancel</Button>
            <Button
              variant={hiding?.restore ? "default" : "destructive"}
              disabled={busy !== null || (!hiding?.restore && reason.trim().length < 3)}
              onClick={async () => {
                if (!hiding) return;
                const ok = hiding.kind === "post"
                  ? await act("moderate", { action: "moderate", hidden: !hiding.restore, reason }, hiding.restore ? "Post restored" : "Post hidden from public boards")
                  : await act("moderate", { hidden: !hiding.restore, reason }, hiding.restore ? "Comment restored" : "Comment hidden", `/api/feedback/tenants/${tenantId}/comments/${hiding.id}`);
                if (ok) setHiding(null);
              }}
            >
              {hiding?.restore ? "Restore" : "Hide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {merging ? <MergeDialog post={post} data={data} busy={busy !== null} onClose={() => setMerging(false)} onMerge={(canonicalId, mergeNote) => act("merge", { action: "merge", canonicalId, note: mergeNote }, "Merged, votes moved").then((ok) => { if (ok) setMerging(false); })} /> : null}
      {editing ? <EditDialog post={post} busy={busy !== null} onClose={() => setEditing(false)} onSave={(title, description) => act("edit", { action: "edit", title, description }, "Wording saved").then((ok) => { if (ok) setEditing(false); })} /> : null}
    </article>
  );
}

function VoterRow({ voter, profile, people, busy, onSave }: {
  voter: Vote;
  profile: VoterProfile | null;
  people: Record<string, PersonView>;
  busy: boolean;
  onSave: (company: string, segment: string) => Promise<void>;
}) {
  const [company, setCompany] = useState(profile?.company ?? "");
  const [segment, setSegment] = useState(profile?.segment ?? "");
  const [open, setOpen] = useState(false);
  const changed = company !== (profile?.company ?? "") || segment !== (profile?.segment ?? "");
  const name = people[voter.uid]?.name || voter.name || "Someone";
  return (
    <li className="grid gap-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <PersonAvatar person={{ uid: voter.uid, name }} people={people} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[profile?.company, profile?.segment].filter(Boolean).join(" · ") || voter.email}
            {voter.movedFrom ? " · moved here by a merge" : ""}
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">{timeAgo(voter.createdAt)}</span>
        <Button size="xs" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? "Done" : "Details"}</Button>
      </div>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 pl-11">
          <Input className="h-8 w-40" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" aria-label={`Company for ${name}`} />
          <Input className="h-8 w-36" value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Segment" aria-label={`Customer segment for ${name}`} />
          <Button size="sm" disabled={busy || !changed} onClick={() => void onSave(company, segment)}>Save</Button>
        </div>
      ) : null}
    </li>
  );
}

function MergeDialog({ post, data, busy, onClose, onMerge }: { post: Post; data: AdminData; busy: boolean; onClose: () => void; onMerge: (canonicalId: string, note: string) => void }) {
  const [canonicalId, setCanonicalId] = useState("");
  const [note, setNote] = useState("");
  const likely = findSimilarPosts(post.title, data.posts.filter((entry) => !entry.hidden), { excludeId: post.id, limit: 5 });
  const likelyIds = new Set(likely.map((entry) => entry.id));
  const candidates = [
    ...likely,
    ...data.posts
      .filter((entry) => entry.id !== post.id && entry.status !== "duplicate" && !entry.hidden && !likelyIds.has(entry.id))
      .sort((a, b) => b.voteCount - a.voteCount),
  ];
  const canonical = candidates.find((entry) => entry.id === canonicalId);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge #{post.number} into another post</DialogTitle>
          <DialogDescription>This post becomes a duplicate and its {plural(post.voteCount, "vote")} move over. People who voted on both count once. You can unmerge later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Keep this post</Label>
            <Select value={canonicalId} onValueChange={setCanonicalId}>
              <SelectTrigger className="w-full" aria-label="Post to keep"><SelectValue placeholder="Choose the post to keep" /></SelectTrigger>
              <SelectContent>
                {candidates.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {likelyIds.has(entry.id) ? "Likely duplicate · " : ""}#{entry.number} {entry.title} ({entry.voteCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-merge-note">Note on the merged post</Label>
            <Input id="fb-merge-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={canonical ? `Merged into #${canonical.number} ${canonical.title}` : "Optional"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !canonical} onClick={() => onMerge(canonicalId, note)}><GitMerge /> Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ post, busy, onClose, onSave }: { post: Post; busy: boolean; onClose: () => void; onSave: (title: string, description: string) => void }) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit wording</DialogTitle>
          <DialogDescription>The author&apos;s original text is kept in the activity log.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fb-edit-title">Title</Label>
            <Input id="fb-edit-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-edit-details">Details</Label>
            <Textarea id="fb-edit-details" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || title.trim().length < 4 || (title === post.title && description === post.description)} onClick={() => onSave(title, description)}>Save wording</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
