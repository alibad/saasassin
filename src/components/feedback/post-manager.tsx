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
import { allowedTransitions, STATUS_LABELS, type PostStatus } from "@/lib/feedback/model";
import type { Comment, Post, Vote } from "@/lib/feedback/types";

import styles from "./feedback.module.css";
import type { AdminData } from "./feedback-workspace";
import { apiJson, formatDate, formatDateTime, StatusBadge } from "./shared";

type Detail = { comments: Comment[]; voters: Vote[] | null };

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

  const candidates = data.posts.filter((entry) => entry.id !== post.id && entry.status !== "duplicate" && !entry.hidden);
  const canonical = candidates.find((entry) => entry.id === canonicalId);

  async function act(body: unknown, success: string, target = url) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson(target, { method: "POST", body: JSON.stringify(body) });
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

        {isAdmin && post.status !== "duplicate" ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Merge duplicate">
              <h3 className="font-bold">Merge as duplicate</h3>
              <p className={`${styles.muted} text-sm`}>This post becomes a duplicate and its votes move to the canonical post (people who voted on both are counted once).</p>
              <Select value={canonicalId} onValueChange={(value) => { setCanonicalId(value); setConfirmMerge(false); }}>
                <SelectTrigger className="w-full max-w-md" aria-label="Canonical post"><SelectValue placeholder="Choose the canonical post" /></SelectTrigger>
                <SelectContent>{candidates.map((entry) => <SelectItem key={entry.id} value={entry.id}>#{entry.number} {entry.title} ({entry.voteCount})</SelectItem>)}</SelectContent>
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
                <span className="text-xs"><strong>{comment.author.name}</strong> · {formatDateTime(comment.createdAt)}{comment.hidden ? ` · hidden: ${comment.hiddenReason}` : ""}</span>
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
        </section>

        {isAdmin ? (
          <>
            <Separator />
            <section className={styles.stack} aria-label="Voters">
              <h3 className="font-bold">Voters ({detail?.voters?.length ?? "…"})</h3>
              {detail?.voters?.length === 0 ? <p className={`${styles.muted} text-sm`}>No votes.</p> : null}
              <ul className="grid gap-1 text-sm">
                {detail?.voters?.map((voter) => (
                  <li key={voter.id}>{voter.name || "Anonymous"} <span className={styles.muted}>{voter.email}</span> · {formatDate(voter.createdAt)}{voter.movedFrom ? " · moved by merge" : ""}</li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
