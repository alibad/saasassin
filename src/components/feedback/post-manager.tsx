"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { allowedTransitions, findSimilarPosts, STATUS_LABELS, type PostStatus } from "@/lib/feedback/model";
import type { Comment, Post, Vote, VoterProfile } from "@/lib/feedback/types";

import styles from "./feedback.module.css";
import type { AdminData } from "./feedback-workspace";
import { apiJson, formatDate, formatDateTime, StatusBadge } from "./shared";

type Detail = { comments: Comment[]; voters: Vote[] | null };

function VoterRow({ voter, profile, busy, onSave }: {
  voter: Vote;
  profile: VoterProfile | null;
  busy: boolean;
  onSave: (company: string, segment: string) => Promise<void>;
}) {
  const [company, setCompany] = useState(profile?.company ?? "");
  const [segment, setSegment] = useState(profile?.segment ?? "");
  const changed = company !== (profile?.company ?? "") || segment !== (profile?.segment ?? "");
  return (
    <li className="grid gap-1">
      <span>{voter.name || "Anonymous"} <span className={styles.muted}>{voter.email}</span> · {formatDate(voter.createdAt)}{voter.movedFrom ? " · moved by merge" : ""}</span>
      <span className={styles.row}>
        <Input className="h-8 w-40" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" aria-label={`Company for ${voter.name}`} />
        <Input className="h-8 w-36" value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Segment" aria-label={`Segment for ${voter.name}`} />
        <Button size="sm" variant="ghost" disabled={busy || !changed} onClick={() => void onSave(company, segment)}>Save</Button>
      </span>
    </li>
  );
}

export function PostManager({
  tenantId,
  post,
  data,
  isAdmin,
  onClose,
  onChanged,
}: {
  tenantId: string;
  post: Post;
  data: AdminData;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const canTriage = isAdmin || data.role === "member";
  const url = `/api/feedback/tenants/${tenantId}/posts/${post.id}`;
  const transitions = allowedTransitions(post.status);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [nextStatus, setNextStatus] = useState<PostStatus | "">(transitions[0] ?? "");
  const [note, setNote] = useState("");
  const [canonicalId, setCanonicalId] = useState("");
  const [mergeNote, setMergeNote] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [tags, setTags] = useState<string[]>(post.tags);
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [editTitle, setEditTitle] = useState(post.title);
  const [editDescription, setEditDescription] = useState(post.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    apiJson<Detail>(url)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [url, version]);

  // Likely duplicates first, then everything else by votes.
  const likely = findSimilarPosts(post.title, data.posts.filter((entry) => !entry.hidden), { excludeId: post.id, limit: 5 });
  const likelyIds = new Set(likely.map((entry) => entry.id));
  const candidates = [
    ...likely,
    ...data.posts
      .filter((entry) => entry.id !== post.id && entry.status !== "duplicate" && !entry.hidden && !likelyIds.has(entry.id))
      .sort((a, b) => b.voteCount - a.voteCount),
  ];
  const canonical = candidates.find((entry) => entry.id === canonicalId);

  async function act(body: unknown, success: string, target = url, method = "POST") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson(target, { method, body: JSON.stringify(body) });
      setNotice(success);
      setVersion((value) => value + 1);
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>#{post.number} {post.title}</DialogTitle>
          <DialogDescription>
            {post.author.name} · {formatDate(post.createdAt)} · {post.voteCount} votes · {post.commentCount} comments
          </DialogDescription>
        </DialogHeader>
        <div className={styles.row}>
          <StatusBadge status={post.status} />
          {post.hidden ? <span className={styles.error}>Hidden: {post.hiddenReason}</span> : null}
          {post.originalId ? <span className="text-sm">Merged into #{data.posts.find((entry) => entry.id === post.originalId)?.number ?? "?"}</span> : null}
        </div>
        {post.description ? <p className="whitespace-pre-wrap text-sm">{post.description}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-700" role="status">{notice}</p> : null}

        <Separator />
        <section className={styles.stack} aria-label="Change status">
          <h3 className="font-bold">Status</h3>
          {!isAdmin ? <p className={`${styles.muted} text-sm`}>Owners and admins change statuses.</p> : transitions.length === 0 ? (
            <p className={`${styles.muted} text-sm`}>Merged posts stay merged. Work continues on the canonical post.</p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>Move to</Label>
                <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as PostStatus)}>
                  <SelectTrigger className="w-60" aria-label="Next status"><SelectValue placeholder="Choose status" /></SelectTrigger>
                  <SelectContent>{transitions.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fb-status-note">Note to voters {nextStatus === "declined" ? "(required)" : "(optional)"}</Label>
                <Textarea id="fb-status-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Shown publicly on the post" />
              </div>
              <p className={`${styles.muted} text-xs`}>
                Voter email notifications: not connected yet (no mail delivery is configured for this workspace). Voters see the status and note on the post and roadmap.
              </p>
              <Button
                className="w-fit"
                disabled={busy || !nextStatus}
                onClick={() => void act({ action: "status", status: nextStatus, note }, `Moved to ${STATUS_LABELS[nextStatus as PostStatus]}.`).then(() => setNote(""))}
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Change status
              </Button>
            </>
          )}
          {post.statusHistory.length ? (
            <ol className="grid gap-1 text-xs">
              {[...post.statusHistory].reverse().map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  {formatDateTime(event.at)} · {event.by?.name}: {STATUS_LABELS[event.from]} → {STATUS_LABELS[event.to]}{event.note ? ` — “${event.note}”` : ""}
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {isAdmin && post.status === "duplicate" ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Unmerge">
              <h3 className="font-bold">Unmerge</h3>
              {post.hasMergeRecord ? (
                <>
                  <p className={`${styles.muted} text-sm`}>Restores this post&apos;s previous status and gives back the votes that moved (except from people who removed their vote since).</p>
                  <Button variant="outline" className="w-fit" disabled={busy} onClick={() => void act({ action: "unmerge" }, "Unmerged. Votes restored.")}>Unmerge post</Button>
                </>
              ) : <p className={`${styles.muted} text-sm`}>This merge has no merge record, so it cannot be reversed automatically.</p>}
            </section>
          </>
        ) : null}

        <Separator />
        <section className={styles.stack} aria-label="Ownership and planning">
          <h3 className="font-bold">Owner and initiative</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Owner</Label>
              <Select
                value={post.owner?.uid ?? "none"}
                disabled={!canTriage || busy}
                onValueChange={(value) => void act({ action: "assign", ownerUid: value === "none" ? null : value }, value === "none" ? "Owner cleared." : "Owner assigned.")}
              >
                <SelectTrigger aria-label="Owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {data.members.map((member) => <SelectItem key={member.uid} value={member.uid}>{member.name || member.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Initiative / release</Label>
              <Select
                value={post.initiativeId ?? "none"}
                disabled={!isAdmin || busy}
                onValueChange={(value) => void act({ action: "initiative", initiativeId: value === "none" ? null : value }, "Initiative updated.")}
              >
                <SelectTrigger aria-label="Initiative"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {data.initiatives.map((initiative) => <SelectItem key={initiative.id} value={initiative.id}>{initiative.kind === "release" ? "Release · " : ""}{initiative.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {isAdmin && post.status !== "duplicate" ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Merge duplicate">
              <h3 className="font-bold">Merge as duplicate</h3>
              <p className={`${styles.muted} text-sm`}>This post becomes a duplicate and its votes move to the canonical post (people who voted on both are counted once).</p>
              <Select value={canonicalId} onValueChange={(value) => { setCanonicalId(value); setConfirmMerge(false); }}>
                <SelectTrigger className="w-full max-w-md" aria-label="Canonical post"><SelectValue placeholder="Choose the canonical post" /></SelectTrigger>
                <SelectContent>{candidates.map((entry) => <SelectItem key={entry.id} value={entry.id}>{likelyIds.has(entry.id) ? "Likely duplicate · " : ""}#{entry.number} {entry.title} ({entry.voteCount})</SelectItem>)}</SelectContent>
              </Select>
              <Input value={mergeNote} onChange={(event) => setMergeNote(event.target.value)} placeholder="Optional note (defaults to “Merged into #…”)" aria-label="Merge note" />
              {!confirmMerge ? (
                <Button variant="outline" className="w-fit" disabled={!canonical || busy} onClick={() => setConfirmMerge(true)}>Review merge</Button>
              ) : canonical ? (
                <div className={styles.response}>
                  <p className="text-sm">Merge <strong>#{post.number}</strong> into <strong>#{canonical.number} {canonical.title}</strong>? Up to {post.voteCount} votes move; this cannot be undone from the UI.</p>
                  <div className={`${styles.row} mt-2`}>
                    <Button variant="destructive" disabled={busy} onClick={() => void act({ action: "merge", canonicalId, note: mergeNote }, "Merged. Votes moved to the canonical post.")}>Confirm merge</Button>
                    <Button variant="ghost" onClick={() => setConfirmMerge(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        <Separator />
        <section className={styles.stack} aria-label="Tags">
          <h3 className="font-bold">Tags</h3>
          {data.tags.length === 0 ? <p className={`${styles.muted} text-sm`}>Create tags in the Tags tab first.</p> : (
            <div className={styles.row}>
              {data.tags.map((tag) => (
                <label key={tag.id} className={`${styles.row} text-sm`}>
                  <Checkbox
                    checked={tags.includes(tag.id)}
                    disabled={!canTriage}
                    onCheckedChange={(checked) => setTags((current) => (checked ? [...current, tag.id] : current.filter((id) => id !== tag.id)))}
                  />
                  <span className={styles.tagDot} style={{ background: tag.color }} /> {tag.name}
                </label>
              ))}
              <Button size="sm" variant="outline" disabled={!canTriage || busy} onClick={() => void act({ action: "tags", tagIds: tags }, "Tags saved.")}>Save tags</Button>
            </div>
          )}
        </section>

        {isAdmin ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Edit wording">
              <h3 className="font-bold">Edit wording</h3>
              <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} aria-label="Post title" />
              <Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} maxLength={5000} aria-label="Post details" />
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={busy || editTitle.trim().length < 4 || (editTitle === post.title && editDescription === post.description)}
                onClick={() => void act({ action: "edit", title: editTitle, description: editDescription }, "Wording saved; the previous version is in the audit log.")}
              >
                Save wording
              </Button>
            </section>
            <Separator />
            <section className={styles.stack} aria-label="Moderation">
              <h3 className="font-bold">Moderation</h3>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required to hide, recorded in the audit log)" aria-label="Moderation reason" />
              <div className={styles.row}>
                {post.hidden ? (
                  <Button variant="outline" disabled={busy} onClick={() => void act({ action: "moderate", hidden: false, reason }, "Post restored.")}>Restore post</Button>
                ) : (
                  <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "moderate", hidden: true, reason }, "Post hidden from public boards.")}>Hide post as spam</Button>
                )}
              </div>
            </section>
          </>
        ) : null}

        <Separator />
        <section className={styles.stack} aria-label="Comments">
          <h3 className="font-bold">Comments</h3>
          {!detail ? <LoaderCircle className="size-4 animate-spin" /> : detail.comments.length === 0 ? <p className={`${styles.muted} text-sm`}>No comments.</p> : null}
          {detail?.comments.map((comment) => (
            <div key={comment.id} className={`${styles.comment} ${comment.hidden ? styles.commentHidden : ""}`}>
              <div className={styles.rowBetween}>
                <span className="text-xs">
                  {comment.internal ? <strong className="mr-1 border border-current px-1 uppercase">Team note</strong> : null}
                  <strong>{comment.author.name}</strong> · {formatDateTime(comment.createdAt)}{comment.hidden ? ` · hidden: ${comment.hiddenReason}` : ""}
                </span>
                {isAdmin ? (
                  comment.hidden ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ hidden: false, reason }, "Comment restored.", `/api/feedback/tenants/${tenantId}/comments/${comment.id}`)}>Restore</Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy || reason.trim().length < 3} onClick={() => void act({ hidden: true, reason }, "Comment hidden.", `/api/feedback/tenants/${tenantId}/comments/${comment.id}`)}>Hide</Button>
                  )
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
            </div>
          ))}
          {isAdmin && detail?.comments.some((comment) => !comment.hidden) ? <p className={`${styles.muted} text-xs`}>Enter a moderation reason above to hide a comment.</p> : null}
          {canTriage ? (
            <div className={styles.stack}>
              <Label htmlFor="fb-internal-note">Internal note (team only, never shown publicly)</Label>
              <Textarea id="fb-internal-note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={2} placeholder="e.g. requested by three enterprise accounts" />
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={busy || !internalNote.trim()}
                onClick={() => void act({ action: "note", content: internalNote }, "Internal note added.").then(() => setInternalNote(""))}
              >
                Add internal note
              </Button>
            </div>
          ) : null}
        </section>

        {isAdmin ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Voters">
              <h3 className="font-bold">Voters ({detail?.voters?.length ?? "…"})</h3>
              {detail?.voters?.length === 0 ? <p className={`${styles.muted} text-sm`}>No votes.</p> : null}
              <ul className="grid gap-2 text-sm">
                {detail?.voters?.map((voter) => (
                  <VoterRow key={voter.id} voter={voter} profile={data.profiles.find((profile) => profile.uid === voter.uid) ?? null} busy={busy}
                    onSave={(company, segment) => act({ company, segment }, "Voter profile saved.", `/api/feedback/tenants/${tenantId}/profiles/${encodeURIComponent(voter.uid)}`, "PUT")} />
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
