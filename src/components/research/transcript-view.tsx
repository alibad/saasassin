"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff, Gavel, Highlighter, LoaderCircle, Pencil, Trash2, UserRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONSENT_LABELS, retentionState, type Folder, type Highlight, type Source } from "@/lib/research/model";
import { REDACTION_MARKER, snapToWords, validateHighlightSpan } from "@/lib/research/spans";
import { formatTimestamp, type TranscriptSegment } from "@/lib/research/transcript";

import { errorMessage, postAction } from "./api";
import { SourceDetailsDialog } from "./source-dialogs";
import styles from "./research.module.css";

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
      return { start, text, covering, redacted: text === REDACTION_MARKER };
    });
  }, [segment.text, highlights]);

  return (
    <>
      {pieces.map((piece) => {
        if (piece.redacted) return <span key={piece.start} className={styles.redacted}>{piece.text}</span>;
        if (piece.covering.length === 0) return <span key={piece.start}>{piece.text}</span>;
        const active = piece.covering.some((h) => h.id === activeId);
        return (
          <mark key={piece.start} className={`${styles.mark} ${active ? styles.markActive : ""}`} data-highlight={piece.covering.map((h) => h.id).join(" ")}>
            {piece.text}
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
      }), "Span redacted. The audit log records who, when and why — never the removed words.");
    if (ok) {
      setRedactOpen(false);
      setPending(null);
      setRedactReason("");
    }
  }

  return (
    <div className="grid gap-4">
      <div className={`${styles.panel} ${styles.panelPad} ${styles.accentBar} grid gap-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={styles.eyebrow}>Interview · {source.format.toUpperCase()}{source.fileName ? ` · ${source.fileName}` : ""}</p>
            <h2 className="text-xl font-extrabold break-words">{source.title}</h2>
            <p className={styles.hint}>
              <UserRound className="inline size-3.5" aria-hidden /> {source.participant.name}
              {source.participant.company ? ` · ${source.participant.company}` : ""}
              {source.participant.email ? ` · ${source.participant.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable ? <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}><Pencil /> Details & consent</Button> : null}
            {manageable ? (
              <Button size="sm" variant="outline" onClick={() => { setHoldReason(""); setHoldOpen(true); }}>
                <Gavel /> {source.legalHold ? "Release hold" : "Legal hold"}
              </Button>
            ) : null}
            {manageable ? <Button size="sm" variant="destructive" disabled={Boolean(source.legalHold)} onClick={() => setDeleteOpen(true)}><Trash2 /> Delete</Button> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {source.legalHold ? <Badge variant="destructive"><Gavel /> Legal hold: {source.legalHold.reason}</Badge> : null}
          <Badge variant={source.consent.status === "granted" || source.consent.status === "not_required" ? "secondary" : "destructive"}>{CONSENT_LABELS[source.consent.status]}</Badge>
          {source.consent.capturedOn ? <Badge variant="outline">Captured {source.consent.capturedOn}</Badge> : null}
          {retention === "none" ? <Badge variant="outline">No retention date</Badge> : null}
          {retention === "expired" ? <Badge variant="destructive">Retention expired {source.consent.retentionUntil} — delete or extend</Badge> : null}
          {retention === "soon" ? <Badge variant="destructive">Retain until {source.consent.retentionUntil} (soon)</Badge> : null}
          {retention === "ok" ? <Badge variant="outline">Retain until {source.consent.retentionUntil}</Badge> : null}
          {source.redactionCount > 0 ? <Badge variant="outline"><EyeOff /> {source.redactionCount} redaction{source.redactionCount === 1 ? "" : "s"}</Badge> : null}
          <Badge variant="outline">{source.segments.length} segments · {highlights.length} highlights</Badge>
        </div>
        {editable && folders.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={styles.eyebrow}>Folder</span>
            <Select value={source.folderId ?? "none"} onValueChange={(value) => { void run("move", () => postAction(tenantId, projectId, { type: "source.move", sourceId: source.id, folderId: value === "none" ? null : value }), "Interview moved."); }}>
              <SelectTrigger size="sm" aria-label="Move to folder" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}{folder.restricted ? " (restricted)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={styles.eyebrow}>Speakers</span>
          {speakers.map((speaker) =>
            editable ? (
              <Button key={speaker} size="xs" variant="outline" onClick={() => setRename({ from: speaker, to: speaker })}>{speaker} <Pencil /></Button>
            ) : (
              <Badge key={speaker} variant="outline">{speaker}</Badge>
            ),
          )}
        </div>
        {editable ? <p className={styles.hint}><Highlighter className="inline size-3.5" aria-hidden /> Select words in any segment to highlight, tag or redact them.</p> : null}
      </div>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className={styles.panel}>
        {source.segments.map((segment) => {
          const segmentHighlights = bySegment.get(segment.id) ?? [];
          const stale = segmentHighlights.filter((h) => h.stale);
          const isEditing = editing?.segmentId === segment.id;
          return (
            <div
              key={segment.id}
              id={`segment-${segment.id}`}
              ref={(node) => { if (node) segmentRefs.current.set(segment.id, node); }}
              className={`${styles.segment} ${focusSegment === segment.id ? styles.segmentFocus : ""}`}
            >
              <div className={styles.segmentMeta}>
                <span className={styles.speaker}>{segment.speaker}</span>
                {segment.startMs !== null ? <span className={styles.timestamp}>{formatTimestamp(segment.startMs)}{segment.endMs !== null ? `–${formatTimestamp(segment.endMs)}` : ""}</span> : null}
                {editable && !isEditing ? (
                  <Button size="xs" variant="ghost" onClick={() => setEditing({ segmentId: segment.id, text: segment.text, speaker: segment.speaker })}><Pencil /> Correct</Button>
                ) : null}
                {stale.length > 0 ? <Badge variant="destructive">{stale.length} highlight{stale.length === 1 ? "" : "s"} lost their words after correction</Badge> : null}
              </div>
              {isEditing && editing ? (
                <div className="grid gap-2">
                  <div className="grid gap-1 sm:max-w-xs">
                    <Label htmlFor={`speaker-${segment.id}`}>Speaker</Label>
                    <Input id={`speaker-${segment.id}`} value={editing.speaker} onChange={(event) => setEditing({ ...editing, speaker: event.target.value })} />
                  </div>
                  <Label htmlFor={`text-${segment.id}`}>Corrected text</Label>
                  <Textarea id={`text-${segment.id}`} rows={4} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
                  <p className={styles.hint}>Highlights in this segment are re-anchored to the same words; any whose words were removed are flagged.</p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === "segment"} onClick={async () => {
                      const ok = await run("segment", () => postAction(tenantId, projectId, { type: "segment.update", sourceId: source.id, segmentId: segment.id, text: editing.text, speaker: editing.speaker }), "Segment corrected.");
                      if (ok) setEditing(null);
                    }}>{busy === "segment" ? <LoaderCircle className="animate-spin" /> : null} Save correction</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p
                  className={styles.segmentText}
                  ref={(node) => { if (node) textRefs.current.set(segment.id, node); }}
                  onMouseUp={() => editable && captureSelection(segment)}
                  onKeyUp={() => editable && captureSelection(segment)}
                >
                  <SegmentText segment={segment} highlights={segmentHighlights} activeId={focusHighlightId} />
                </p>
              )}
              {pending?.segmentId === segment.id && editable ? (
                <div className={`${styles.panel} ${styles.panelPad} mt-2 grid gap-2`}>
                  <p className={styles.quote}>“{pending.quote}”</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="highlight-tags">Tags (comma separated)</Label>
                      <Input id="highlight-tags" placeholder="pricing, onboarding" value={tags} onChange={(event) => setTags(event.target.value)} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="highlight-note">Note</Label>
                      <Input id="highlight-note" placeholder="Why this matters" value={note} onChange={(event) => setNote(event.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={saveHighlight} disabled={busy === "highlight"}>{busy === "highlight" ? <LoaderCircle className="animate-spin" /> : <Highlighter />} Save highlight</Button>
                    <Button size="sm" variant="destructive" disabled={Boolean(source.legalHold)} onClick={() => setRedactOpen(true)}><EyeOff /> {source.legalHold ? "Redaction blocked by legal hold" : "Redact span"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Dismiss</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Dialog open={redactOpen} onOpenChange={setRedactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redact this span?</DialogTitle>
            <DialogDescription>
              The selected words are replaced with {REDACTION_MARKER} in the transcript and any overlapping highlight. The stored original upload is discarded so the words cannot be recovered. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pending ? <p className={styles.quote}>“{pending.quote}”</p> : null}
          <div className="grid gap-1">
            <Label htmlFor="redact-reason">Reason (kept in the audit log)</Label>
            <Input id="redact-reason" value={redactReason} placeholder="Participant phone number" onChange={(event) => setRedactReason(event.target.value)} />
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
            <DialogDescription>Every segment attributed to “{rename?.from}” in this interview is updated.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
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
              The transcript, its {highlights.length} highlight{highlights.length === 1 ? "" : "s"} and the stored original are permanently deleted, and insights lose those evidence links. The audit log keeps a record of the deletion and its reason.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
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
                await onChanged("Source deleted and recorded in the audit log.");
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
                ? "Once released, this interview can be redacted, deleted, or removed by a retention run again."
                : "While held, this interview cannot be redacted, deleted, or removed by a retention run. Blocked attempts are recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="hold-reason">Reason (kept in the audit log)</Label>
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
    </div>
  );
}
