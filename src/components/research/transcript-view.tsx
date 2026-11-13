"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff, Gavel, Highlighter, LoaderCircle, MoreHorizontal, Pencil, Trash2, UserRound, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_LABELS, retentionState, type Folder, type Highlight, type Source } from "@/lib/research/model";
import { REDACTION_MARKER, snapToWords, validateHighlightSpan } from "@/lib/research/spans";
import { formatTimestamp, type TranscriptSegment } from "@/lib/research/transcript";
import { cn } from "@/lib/utils";

import { errorMessage, postAction } from "./api";
import { Byline } from "./people";
import { SourceDetailsDialog } from "./source-dialogs";

type Pending = { segmentId: string; start: number; end: number; quote: string };

type Props = {
  tenantId: string;
  projectId: string;
  source: Source;
  highlights: Highlight[];
  editable: boolean;
  manageable: boolean;
  folders: Folder[];
  focusHighlightId: string | null;
  focusSegmentId: string | null;
  onChanged: (message?: string) => Promise<void> | void;
  onDeleted: () => void;
};

function selectionOffsets(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

function SegmentText({ segment, highlights, activeId }: { segment: TranscriptSegment; highlights: Highlight[]; activeId: string | null }) {
  const pieces = useMemo(() => {
    const cuts = new Set<number>([0, segment.text.length]);
    for (const highlight of highlights) {
      if (highlight.stale) continue;
      cuts.add(Math.max(0, Math.min(highlight.start, segment.text.length)));
      cuts.add(Math.max(0, Math.min(highlight.end, segment.text.length)));
    }
    let markerFrom = segment.text.indexOf(REDACTION_MARKER);
    while (markerFrom !== -1) {
      cuts.add(markerFrom);
      cuts.add(markerFrom + REDACTION_MARKER.length);
      markerFrom = segment.text.indexOf(REDACTION_MARKER, markerFrom + 1);
    }
    const points = [...cuts].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      const covering = highlights.filter((h) => !h.stale && h.start <= start && h.end >= end);
      const text = segment.text.slice(start, end);
      // The last piece of each highlight carries its first tag, like a margin note.
      const endingTags = covering.filter((h) => h.end === end && h.tags.length).map((h) => h.tags[0]);
      return { start, text, covering, endingTags, redacted: text === REDACTION_MARKER };
    });
  }, [segment.text, highlights]);

  return (
    <>
      {pieces.map((piece) => {
        if (piece.redacted) {
          return <span key={piece.start} className="rounded-[3px] bg-foreground px-1.5 py-px text-[0.8em] font-medium text-background not-italic">{piece.text}</span>;
        }
        if (piece.covering.length === 0) return <span key={piece.start}>{piece.text}</span>;
        const active = piece.covering.some((h) => h.id === activeId);
        return (
          <mark
            key={piece.start}
            data-highlight={piece.covering.map((h) => h.id).join(" ")}
            className={cn(
              "rounded-[3px] px-0.5 text-foreground ring-1 [box-decoration-break:clone]",
              piece.covering.length > 1 ? "bg-brand-accent dark:bg-brand-accent/40" : "bg-brand-accent/60 dark:bg-brand-accent/25",
              active ? "ring-2 ring-primary" : "ring-brand-accent dark:ring-brand-accent/50",
            )}
          >
            {piece.text}
            {piece.endingTags.length ? (
              <sup className="ml-1 rounded-sm bg-primary px-1 py-px align-[0.35em] text-[10px] font-semibold whitespace-nowrap text-primary-foreground not-italic">#{piece.endingTags[0]}</sup>
            ) : null}
          </mark>
        );
      })}
    </>
  );
}

export function TranscriptView({ tenantId, projectId, source, highlights, editable, manageable, folders, focusHighlightId, focusSegmentId, onChanged, onDeleted }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ segmentId: string; text: string; speaker: string } | null>(null);
  const [redactReason, setRedactReason] = useState("");
  const [redactOpen, setRedactOpen] = useState(false);
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const textRefs = useRef(new Map<string, HTMLElement>());
  const segmentRefs = useRef(new Map<string, HTMLElement>());

  const focusSegment = focusSegmentId ?? highlights.find((h) => h.id === focusHighlightId)?.segmentId ?? null;
  useEffect(() => {
    if (!focusSegment) return;
    segmentRefs.current.get(focusSegment)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSegment, source.id]);

  const speakers = useMemo(() => [...new Set(source.segments.map((segment) => segment.speaker))], [source.segments]);
  const bySegment = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    for (const highlight of highlights) map.set(highlight.segmentId, [...(map.get(highlight.segmentId) ?? []), highlight]);
    return map;
  }, [highlights]);
  const retention = retentionState(source.consent);
  // The participant's lines read in the brand colour; the interviewer's stay quiet.
  const participantSpeakers = new Set(speakers.filter((speaker) => !/interview|moderator|facilitator|researcher/i.test(speaker)));

  function captureSelection(segment: TranscriptSegment) {
    const container = textRefs.current.get(segment.id);
    if (!container) return;
    const offsets = selectionOffsets(container);
    if (!offsets) return;
    const span = snapToWords(segment.text, offsets.start, offsets.end);
    const valid = validateHighlightSpan(segment.text, span.start, span.end);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setError(null);
    setPending({ segmentId: segment.id, ...span, quote: valid.quote });
  }

  async function run(label: string, task: () => Promise<unknown>, message?: string) {
    setBusy(label);
    setError(null);
    try {
      await task();
      await onChanged(message);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveHighlight() {
    if (!pending) return;
    const ok = await run("highlight", () =>
      postAction(tenantId, projectId, {
        type: "highlight.create",
        sourceId: source.id,
        segmentId: pending.segmentId,
        start: pending.start,
        end: pending.end,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        note,
      }), "Highlight saved.");
    if (ok) {
      setPending(null);
      setNote("");
      window.getSelection()?.removeAllRanges();
    }
  }

  async function redact() {
    if (!pending) return;
    const ok = await run("redact", () =>
      postAction(tenantId, projectId, {
        type: "segment.redact",
        sourceId: source.id,
        segmentId: pending.segmentId,
        start: pending.start,
        end: pending.end,
        reason: redactReason,
      }), "Redacted. Activity records who, when and why — never the removed words.");
    if (ok) {
      setRedactOpen(false);
      setPending(null);
      setRedactReason("");
    }
  }

  const consentOk = source.consent.status === "granted" || source.consent.status === "not_required";

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <header className="grid gap-3 border-b border-border px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h2 className="brand-heading text-[1.6rem] leading-tight break-words">{source.title}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <UserRound className="size-3.5" aria-hidden="true" />
              <span className="font-medium text-foreground/80">{source.participant.name}</span>
              {source.participant.company ? <span>· {source.participant.company}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {editable ? <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}><Pencil /> Details & consent</Button> : null}
            {manageable || editable ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="More interview actions"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {editable ? (
                    <>
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Rename a speaker</DropdownMenuLabel>
                      {speakers.map((speaker) => (
                        <DropdownMenuItem key={speaker} onSelect={() => setRename({ from: speaker, to: speaker })}><Pencil /> {speaker}</DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                  {manageable ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => { setHoldReason(""); setHoldOpen(true); }}>
                        <Gavel /> {source.legalHold ? "Release legal hold" : "Place legal hold"}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={Boolean(source.legalHold)} onSelect={() => setDeleteOpen(true)}>
                        <Trash2 /> Delete interview
                      </DropdownMenuItem>
                      {source.legalHold ? <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Release the hold to delete or redact.</DropdownMenuLabel> : null}
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {source.legalHold ? <Badge variant="destructive"><Gavel /> Legal hold · {source.legalHold.reason}</Badge> : null}
          <Badge variant={consentOk ? "secondary" : "destructive"}>{CONSENT_LABELS[source.consent.status]}{source.consent.capturedOn && consentOk ? ` · ${source.consent.capturedOn}` : ""}</Badge>
          {retention === "none" ? <Badge variant="outline">No retention date</Badge> : null}
          {retention === "expired" ? <Badge variant="destructive">Retention passed {source.consent.retentionUntil}</Badge> : null}
          {retention === "soon" ? <Badge variant="destructive">Retain until {source.consent.retentionUntil}</Badge> : null}
          {retention === "ok" ? <Badge variant="outline">Retain until {source.consent.retentionUntil}</Badge> : null}
          {source.redactionCount > 0 ? <Badge variant="outline"><EyeOff /> {source.redactionCount} {source.redactionCount === 1 ? "redaction" : "redactions"}</Badge> : null}
          {editable && folders.length > 0 ? (
            <Select value={source.folderId ?? "none"} onValueChange={(value) => { void run("move", () => postAction(tenantId, projectId, { type: "source.move", sourceId: source.id, folderId: value === "none" ? null : value }), "Interview moved."); }}>
              <SelectTrigger size="sm" aria-label="Folder" className="h-6 w-auto gap-1 rounded-full px-2.5 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}{folder.restricted ? " (restricted)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <span className="ml-auto"><Byline uid={source.createdBy} at={source.createdAt} prefix="Added by" /></span>
        </div>
      </header>

      {editable ? (
        <p className="flex items-center gap-2 border-b border-border bg-brand-subtle px-5 py-2 text-xs text-muted-foreground sm:px-7">
          <Highlighter className="size-3.5 text-primary" aria-hidden="true" /> Select words in the transcript to highlight, tag or redact them.
        </p>
      ) : null}
      {error ? <Alert variant="destructive" className="m-4"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <ol className="grid gap-1 px-3 py-4 sm:px-5">
        {source.segments.map((segment) => {
          const segmentHighlights = bySegment.get(segment.id) ?? [];
          const stale = segmentHighlights.filter((h) => h.stale);
          const isEditing = editing?.segmentId === segment.id;
          const focused = focusSegment === segment.id;
          return (
            <li
              key={segment.id}
              id={`segment-${segment.id}`}
              ref={(node) => { if (node) segmentRefs.current.set(segment.id, node); }}
              className={cn(
                "group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 rounded-md px-2 py-2 transition-colors sm:grid-cols-[3.75rem_minmax(0,1fr)]",
                focused ? "bg-secondary/70 ring-1 ring-primary/25" : "",
              )}
            >
              <span className="pt-[3px] text-xs text-muted-foreground tabular-nums">{segment.startMs !== null ? formatTimestamp(segment.startMs) : ""}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-[13px] font-semibold", participantSpeakers.has(segment.speaker) ? "text-primary" : "text-muted-foreground")}>{segment.speaker}</span>
                  {editable && !isEditing ? (
                    <Button size="xs" variant="ghost" className="h-5 px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditing({ segmentId: segment.id, text: segment.text, speaker: segment.speaker })}><Pencil /> Correct</Button>
                  ) : null}
                  {stale.length > 0 ? <Badge variant="destructive">{stale.length} {stale.length === 1 ? "highlight lost its" : "highlights lost their"} words after a correction</Badge> : null}
                </div>
                {isEditing && editing ? (
                  <div className="mt-2 grid gap-3 rounded-md border border-border bg-background p-3">
                    <div className="grid gap-1.5 sm:max-w-xs">
                      <Label htmlFor={`speaker-${segment.id}`}>Speaker</Label>
                      <Input id={`speaker-${segment.id}`} value={editing.speaker} onChange={(event) => setEditing({ ...editing, speaker: event.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`text-${segment.id}`}>Corrected text</Label>
                      <Textarea id={`text-${segment.id}`} rows={4} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
                    </div>
                    <p className="text-xs text-muted-foreground">Highlights here follow the same words; any whose words you remove are flagged.</p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === "segment"} onClick={async () => {
                        const ok = await run("segment", () => postAction(tenantId, projectId, { type: "segment.update", sourceId: source.id, segmentId: segment.id, text: editing.text, speaker: editing.speaker }), "Correction saved.");
                        if (ok) setEditing(null);
                      }}>{busy === "segment" ? <LoaderCircle className="animate-spin" /> : null} Save correction</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn("mt-0.5 text-[15.5px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere]", editable ? "cursor-text" : "")}
                    ref={(node) => { if (node) textRefs.current.set(segment.id, node); }}
                    onMouseUp={() => editable && captureSelection(segment)}
                    onKeyUp={() => editable && captureSelection(segment)}
                  >
                    <SegmentText segment={segment} highlights={segmentHighlights} activeId={focusHighlightId} />
                  </p>
                )}
                {pending?.segmentId === segment.id && editable ? (
                  <div className="mt-3 grid gap-3 rounded-lg border border-primary/30 bg-background p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="border-l-[3px] border-brand-accent pl-3 font-heading text-[15px] italic">“{pending.quote}”</p>
                      <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setPending(null)}><X /></Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="highlight-tags">Tags, separated by commas</Label>
                        <Input id="highlight-tags" placeholder="pricing, trust" value={tags} onChange={(event) => setTags(event.target.value)} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="highlight-note">Note</Label>
                        <Input id="highlight-note" placeholder="Why this matters" value={note} onChange={(event) => setNote(event.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={saveHighlight} disabled={busy === "highlight"}>{busy === "highlight" ? <LoaderCircle className="animate-spin" /> : <Highlighter />} Save highlight</Button>
                      <Button size="sm" variant="outline" disabled={Boolean(source.legalHold)} onClick={() => setRedactOpen(true)}><EyeOff /> {source.legalHold ? "Redaction blocked by legal hold" : "Redact"}</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <Dialog open={redactOpen} onOpenChange={setRedactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redact these words?</DialogTitle>
            <DialogDescription>
              They are replaced with {REDACTION_MARKER} in the transcript and in any highlight that overlaps them. The original upload is discarded so the words can&apos;t be recovered. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pending ? <p className="border-l-[3px] border-brand-accent pl-3 font-heading italic">“{pending.quote}”</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="redact-reason">Reason, kept in Activity</Label>
            <Input id="redact-reason" value={redactReason} placeholder="Participant's phone number" onChange={(event) => setRedactReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedactOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy === "redact" || redactReason.trim().length < 2} onClick={redact}>{busy === "redact" ? <LoaderCircle className="animate-spin" /> : <EyeOff />} Redact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rename !== null} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename speaker</DialogTitle>
            <DialogDescription>Every line attributed to “{rename?.from}” in this interview is updated.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rename-speaker">Speaker name</Label>
            <Input id="rename-speaker" value={rename?.to ?? ""} onChange={(event) => rename && setRename({ ...rename, to: event.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRename(null)}>Cancel</Button>
            <Button disabled={!rename || !rename.to.trim() || rename.to === rename.from || busy === "rename"} onClick={async () => {
              if (!rename) return;
              const ok = await run("rename", () => postAction(tenantId, projectId, { type: "speaker.rename", sourceId: source.id, from: rename.from, to: rename.to }), "Speaker renamed.");
              if (ok) setRename(null);
            }}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{source.title}”?</DialogTitle>
            <DialogDescription>
              The transcript, its {highlights.length} {highlights.length === 1 ? "highlight" : "highlights"} and the original upload are permanently deleted, and insights lose those quotes. Activity keeps a record of the deletion and its reason.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="delete-reason">Reason</Label>
            <Input id="delete-reason" value={deleteReason} placeholder="Retention period ended" onChange={(event) => setDeleteReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy === "delete" || deleteReason.trim().length < 2} onClick={async () => {
              setBusy("delete");
              try {
                await postAction(tenantId, projectId, { type: "source.delete", sourceId: source.id, reason: deleteReason });
                setDeleteOpen(false);
                onDeleted();
                await onChanged("Interview deleted and recorded in Activity.");
              } catch (caught) {
                setError(errorMessage(caught));
                setDeleteOpen(false);
              } finally {
                setBusy(null);
              }
            }}>{busy === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{source.legalHold ? "Release the legal hold?" : "Place a legal hold?"}</DialogTitle>
            <DialogDescription>
              {source.legalHold
                ? "Once released, this interview can be redacted, deleted or removed by a retention run again."
                : "While held, this interview cannot be redacted, deleted or removed by a retention run. Blocked attempts are recorded in Activity."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="hold-reason">Reason, kept in Activity</Label>
            <Input id="hold-reason" value={holdReason} placeholder={source.legalHold ? "Matter closed" : "Litigation hold — matter 2026-14"} onChange={(event) => setHoldReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button disabled={busy === "hold" || holdReason.trim().length < 2} onClick={async () => {
              const ok = await run("hold", () => postAction(tenantId, projectId, { type: source.legalHold ? "source.release" : "source.hold", sourceId: source.id, reason: holdReason }), source.legalHold ? "Legal hold released." : "Legal hold placed.");
              if (ok) setHoldOpen(false);
            }}>{busy === "hold" ? <LoaderCircle className="animate-spin" /> : <Gavel />} {source.legalHold ? "Release hold" : "Place hold"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailsOpen ? (
        <SourceDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          tenantId={tenantId}
          projectId={projectId}
          source={source}
          onSaved={async () => { setDetailsOpen(false); await onChanged("Details updated."); }}
        />
      ) : null}
    </article>
  );
}
