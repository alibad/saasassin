"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, Check, Flag, LoaderCircle, MapPin, MoreHorizontal, Send } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isModerator, MAX_PAGE_SIZE, THREAD_PAGE_SIZE, type CommunityAction, type RsvpStatus } from "@/lib/community/model";
import { cn } from "@/lib/utils";

import { api, formatWhen, personFor, ROLE_LABELS, timeAgo, type PeopleIndex, type Thread, type Workspace } from "./api";
import { DateBlock, RichText } from "./feed";

/** A post with its replies, RSVPs and moderation tools, opened over the feed. */
export function ThreadDialog({
  tenantId,
  postId,
  workspace,
  people,
  onClose,
  act,
}: {
  tenantId: string;
  postId: string;
  workspace: Workspace;
  people: PeopleIndex;
  onClose: () => void;
  act: (action: CommunityAction, success?: string) => Promise<unknown>;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const role = workspace.me.role;
  const me = people.get(workspace.me.uid);

  const load = useCallback(async (keep = 0) => {
    try {
      // Re-read everything already on screen (plus room for a new reply) so the reader keeps their place.
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(THREAD_PAGE_SIZE, keep + 1));
      setThread(await api<Thread>(`/api/community/tenants/${tenantId}/posts/${postId}?limit=${limit}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "This post couldn't be loaded.");
    }
  }, [postId, tenantId]);

  async function loadMoreReplies() {
    if (!thread?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api<Thread>(`/api/community/tenants/${tenantId}/posts/${postId}?cursor=${encodeURIComponent(thread.nextCursor)}`);
      setThread((current) => current ? { ...next, comments: [...current.comments, ...next.comments], hiddenCount: current.hiddenCount + next.hiddenCount } : next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "More replies couldn't be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the thread when the dialog opens
    void load();
  }, [load]);

  async function run(action: CommunityAction, success?: string) {
    setBusy(true);
    try {
      await act(action, success);
      await load(thread?.comments.length ?? 0);
    } catch {
      /* the workspace toast already explains the failure */
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    await run({ type: "comment.create", postId, body: comment });
    setComment("");
  }

  const post = thread?.post;
  const myRsvp = workspace.myRsvps[postId] as RsvpStatus | undefined;
  const author = post ? personFor(people, post.authorUid, post.authorName) : null;
  const authorMember = post ? people.get(post.authorUid) : undefined;
  const going = thread?.rsvps.goingPeople ?? [];

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {error ? (
          <DialogHeader><DialogTitle>This post isn&apos;t available</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader>
        ) : !post || !author ? (
          <div className="grid gap-4" aria-busy="true">
            <DialogTitle className="sr-only">Loading the post</DialogTitle>
            <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 w-40" /></div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <>
            <DialogHeader className="gap-3 text-left">
              <div className="flex items-start gap-3 pr-8">
                <UserAvatar person={author} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-semibold">{author.name}</span>
                    {authorMember?.handle ? <span className="text-muted-foreground">@{authorMember.handle}</span> : null}
                    {authorMember && authorMember.role !== "member" ? <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">{ROLE_LABELS[authorMember.role]}</Badge> : null}
                  </p>
                  <DialogDescription className="text-xs">
                    {formatWhen(post.createdAt)}{post.removed ? ` · removed (${post.removedReason})` : ""}
                  </DialogDescription>
                </div>
                {isModerator(role) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Moderation actions"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: post.pinned ? "unpin" : "pin", reason: "" }, post.pinned ? "Unpinned." : "Pinned to the top of its space.")}>
                        {post.pinned ? "Unpin" : "Pin to the top"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: post.commentsClosed ? "reopen" : "close", reason: "" }, post.commentsClosed ? "Replies reopened." : "Replies closed.")}>
                        {post.commentsClosed ? "Reopen replies" : "Close replies"}
                      </DropdownMenuItem>
                      {post.removed ? (
                        <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: "restore", reason: "" }, "Post restored.")}>Restore post</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget({ kind: "post", id: postId })}>Remove post</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <DialogTitle className="brand-heading text-2xl leading-snug">{post.title}</DialogTitle>
            </DialogHeader>

            {post.event ? (
              <div className="grid gap-4 rounded-2xl bg-brand-subtle p-4 ring-1 ring-border">
                <div className="flex items-center gap-4">
                  <DateBlock iso={post.event.startsAt} />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{formatWhen(post.event.startsAt)}{post.event.endsAt ? ` – ${formatWhen(post.event.endsAt)}` : ""}</p>
                    {post.event.location ? <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" aria-hidden="true" /> {post.event.location}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {going.length ? (
                    <AvatarGroup>
                      {going.slice(0, 6).map((person) => <UserAvatar key={person.uid} person={personFor(people, person.uid, person.name)} size="md" className="ring-2 ring-background" />)}
                      {going.length > 6 ? <AvatarGroupCount className="text-xs">+{going.length - 6}</AvatarGroupCount> : null}
                    </AvatarGroup>
                  ) : null}
                  <p className="text-sm text-muted-foreground">{thread.rsvps.summary.going} going · {thread.rsvps.summary.maybe} maybe</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["going", "maybe", "not_going"] as const).map((status) => (
                    <Button key={status} size="sm" className="rounded-full" variant={myRsvp === status ? "default" : "outline"} disabled={busy} onClick={() => void run({ type: "rsvp.set", postId, status }, "Your RSVP is saved.")}>
                      {myRsvp === status ? <Check aria-hidden="true" /> : null}
                      {status === "not_going" ? "Can't make it" : status === "going" ? "Going" : "Maybe"}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" className="rounded-full" asChild>
                    <a href={`/api/community/tenants/${tenantId}/posts/${postId}/calendar`} download><CalendarPlus /> Add to calendar</a>
                  </Button>
                </div>
                {thread.rsvps.attendance ? (
                  <details className="rounded-xl bg-card p-3 ring-1 ring-border">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Check people in
                      {thread.rsvps.attendance.attended ? ` · ${thread.rsvps.attendance.attended} attended` : ""}
                      {thread.rsvps.attendance.attended && thread.rsvps.attendance.showUpRate !== null ? ` · ${Math.round(thread.rsvps.attendance.showUpRate * 100)}% of “going” came` : ""}
                      {thread.rsvps.attendance.walkIns ? ` · ${thread.rsvps.attendance.walkIns} walk-in` : ""}
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {thread.rsvps.roster.map((entry) => (
                        <label key={entry.uid} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={entry.attended} disabled={busy} onCheckedChange={(checked) => void run({ type: "attendance.set", postId, uid: entry.uid, attended: checked === true })} />
                          <UserAvatar person={personFor(people, entry.uid, entry.name)} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                          <span className="text-xs text-muted-foreground">{entry.status ? entry.status.replace("_", " ") : "no RSVP"}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            <RichText text={post.body} className="text-[15px] leading-relaxed" />
            {post.authorUid !== workspace.me.uid && !post.removed ? (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setReporting(true)}><Flag /> Report</Button>
              </div>
            ) : null}

            <section className="grid gap-4 border-t border-border pt-4">
              <h4 className="font-heading font-semibold">{post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</h4>
              {post.authorHidden ? (
                <p className="rounded-xl bg-muted p-2 text-xs text-muted-foreground">You {post.authorHidden}d this member. Their post is shown because you opened it directly.</p>
              ) : null}
              {thread.comments.map((entry) => {
                const person = personFor(people, entry.authorUid, entry.authorName);
                const handle = people.get(entry.authorUid)?.handle;
                return (
                  <div key={entry.id} className={cn("flex gap-3", entry.removed && "opacity-50")}>
                    <UserAvatar person={person} size="md" />
                    <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3.5 py-2.5">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{person.name}</span>
                        {handle ? ` @${handle}` : ""} · {timeAgo(entry.createdAt)}{entry.removed ? " · removed" : ""}
                      </p>
                      <RichText text={entry.body} className="mt-0.5 text-sm leading-relaxed" />
                    </div>
                    {isModerator(role) && !entry.removed ? (
                      <Button size="sm" variant="ghost" className="self-start text-muted-foreground" onClick={() => setRemoveTarget({ kind: "comment", id: entry.id })}>Remove</Button>
                    ) : null}
                  </div>
                );
              })}
              {thread.hiddenCount ? <p className="text-xs text-muted-foreground">{thread.hiddenCount} {thread.hiddenCount === 1 ? "reply" : "replies"} from people you muted or blocked {thread.hiddenCount === 1 ? "is" : "are"} hidden.</p> : null}
              {thread.nextCursor ? (
                <Button variant="outline" size="sm" className="self-center rounded-full" disabled={loadingMore} onClick={() => void loadMoreReplies()}>
                  {loadingMore ? <LoaderCircle className="animate-spin" /> : null} Show more replies
                </Button>
              ) : null}
              {post.commentsClosed && !isModerator(role) ? (
                <p className="text-sm text-muted-foreground">Replies are closed on this post.</p>
              ) : post.removed ? null : (
                <form onSubmit={submitComment} className="flex items-start gap-3">
                  {me ? <UserAvatar person={{ uid: me.uid, name: me.displayName, photoURL: me.photoURL }} size="md" /> : null}
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor="comment-body" className="sr-only">Your reply</Label>
                    <Textarea id="comment-body" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a reply. Use @handle to mention someone." rows={3} maxLength={4000} required className="rounded-2xl" />
                    <div className="flex justify-end"><Button type="submit" className="rounded-full" disabled={busy || !comment.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />} Reply</Button></div>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </DialogContent>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => (!open ? setRemoveTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this {removeTarget?.kind === "post" ? "post" : "reply"}?</DialogTitle>
            <DialogDescription>Members stop seeing it right away. Your reason is logged, the author can appeal, and posts can be restored.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="remove-reason">Reason</Label>
            <Input id="remove-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Spam, off-topic, harassment…" maxLength={280} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!removeTarget) return;
                const target = removeTarget;
                setRemoveTarget(null);
                await run(
                  target.kind === "post" ? { type: "post.moderate", postId: target.id, operation: "remove", reason } : { type: "comment.remove", commentId: target.id, reason },
                  "Removed and logged.",
                );
                setReason("");
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setReporting(false);
              await run({ type: "post.report", postId, reason: reportReason }, "Thanks for flagging it. A moderator will take a look.");
              setReportReason("");
            }}
          >
            <DialogHeader>
              <DialogTitle>Report this post</DialogTitle>
              <DialogDescription>Moderators see your report and reason. The author isn&apos;t told who reported it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="report-reason">What&apos;s wrong?</Label>
              <Textarea id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={280} rows={3} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReporting(false)}>Cancel</Button>
              <Button type="submit" disabled={!reportReason.trim()}>Send report</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
