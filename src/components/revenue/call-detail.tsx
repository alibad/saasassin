"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ClipboardCheck, EyeOff, LoaderCircle, MessageSquarePlus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TrackerHit } from "@/lib/revenue/analysis";
import { locateSpan, REDACTION_MARK } from "@/lib/revenue/coaching";
import { CONSENT_BASIS_LABELS, canCoach, canWrite, isAdmin } from "@/lib/revenue/schemas";
import { formatTimestamp, type TranscriptSegment } from "@/lib/revenue/transcript";

import { api, percent, shortDate, type CallDetail } from "./client";
import styles from "./revenue.module.css";

function renderRedactions(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(REDACTION_MARK);
  return parts.flatMap((part, i) =>
    i === 0
      ? [<Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>]
      : [
          <span key={`${keyPrefix}-r${i}`} className={styles.redacted}>redacted</span>,
          <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>,
        ],
  );
}

function renderSegmentText(segment: TranscriptSegment, hits: TrackerHit[], filter: string | null) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.charStart < cursor) continue;
    nodes.push(...renderRedactions(segment.text.slice(cursor, hit.charStart), `${segment.index}-${cursor}`));
    const dim = filter && filter !== hit.trackerId;
    nodes.push(
      <mark
        key={`${segment.index}-h${hit.charStart}`}
        className={dim ? undefined : `${styles.hit} ${hit.kind === "competitor" ? styles.hitCompetitor : ""}`}
        aria-label={`${hit.trackerName} tracker: ${hit.keyword}`}
      >
        {segment.text.slice(hit.charStart, hit.charEnd)}
      </mark>,
    );
    cursor = hit.charEnd;
  }
  nodes.push(...renderRedactions(segment.text.slice(cursor), `${segment.index}-${cursor}-end`));
  return nodes;
}

type Target = { at: number; segmentIndex: number | null };

export function CallDetailView({
  tenantId,
  callId,
  role,
  onBack,
  onChanged,
  focusAt = null,
}: {
  tenantId: string;
  callId: string;
  role: string;
  onBack: () => void;
  onChanged: () => void;
  /** Seconds into the call to scroll to once the transcript loads (search results, risk evidence). */
  focusAt?: number | null;
}) {
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ at: 0, segmentIndex: null });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [redactSegment, setRedactSegment] = useState<TranscriptSegment | null>(null);
  const [redactText, setRedactText] = useState("");
  const [redactReason, setRedactReason] = useState("pii");
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [scoreNotes, setScoreNotes] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const base = `/api/revenue/tenants/${tenantId}/calls/${callId}`;

  useEffect(() => {
    let cancelled = false;
    api<CallDetail>(base)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setLoadError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [base, version]);

  const focusSegment = useMemo(() => {
    if (!detail || focusAt === null) return null;
    const candidates = detail.call.segments.filter((segment) => segment.start <= focusAt + 0.001);
    return (candidates.at(-1) ?? detail.call.segments[0])?.index ?? null;
  }, [detail, focusAt]);

  useEffect(() => {
    if (focusSegment === null) return;
    document.getElementById(`seg-${focusSegment}`)?.scrollIntoView({ block: "center" });
  }, [focusSegment]);

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
    onChanged();
  }, [onChanged]);

  function jump(segmentIndex: number) {
    setActive(segmentIndex);
    document.getElementById(`seg-${segmentIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setActionError(null);
    try {
      await action();
      refresh();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That did not work.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const ok = await run("comment", () =>
      api(`${base}/comments`, { method: "POST", body: JSON.stringify({ at: target.at, segmentIndex: target.segmentIndex, body: comment }) }),
    );
    if (ok) setComment("");
  }

  async function submitRedaction() {
    if (!redactSegment) return;
    const span = locateSpan(redactSegment, redactText);
    if (!span) {
      setActionError("That exact text is not in the selected segment.");
      return;
    }
    const ok = await run("redact", () => api(`${base}/redactions`, { method: "POST", body: JSON.stringify({ ...span, reason: redactReason }) }));
    if (ok) {
      setRedactSegment(null);
      setRedactText("");
    }
  }

  async function submitScorecard() {
    const ok = await run("score", () => api(`${base}/scorecards`, { method: "POST", body: JSON.stringify({ scores, notes: scoreNotes }) }));
    if (ok) {
      setScoring(false);
      setScores({});
      setScoreNotes("");
    }
  }

  async function submitDelete() {
    setBusy("delete");
    setActionError(null);
    try {
      await api(base, { method: "DELETE", body: JSON.stringify({ reason: deleteReason }) });
      setDeleteOpen(false);
      onChanged();
      onBack();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The call could not be deleted.");
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="grid gap-4">
        <Button variant="outline" className="w-fit" onClick={onBack}><ArrowLeft /> Back</Button>
        <Alert variant="destructive">
          <AlertTitle>Call unavailable</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const { call, deal, comments, scorecards, rubric } = detail;
  const analysis = call.analysis;
  const hitsBySegment = new Map<number, TrackerHit[]>();
  for (const hit of analysis.trackerHits) hitsBySegment.set(hit.segmentIndex, [...(hitsBySegment.get(hit.segmentIndex) ?? []), hit]);
  const commentsBySegment = new Map<number | null, typeof comments>();
  for (const entry of comments) commentsBySegment.set(entry.segmentIndex, [...(commentsBySegment.get(entry.segmentIndex) ?? []), entry]);
  const nextStepSegments = new Set(analysis.nextSteps.map((step) => step.segmentIndex));
  const writer = canWrite(role);
  const coach = canCoach(role);
  const scoreComplete = rubric.every((criterion) => scores[criterion.id]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Button variant="outline" className="w-fit" onClick={onBack}><ArrowLeft /> All calls</Button>
          <p className={`${styles.eyebrow} mt-3`}>{deal ? `Deal · ${deal.name}` : "Deal removed"} · {shortDate(call.occurredAt)} · {call.repEmail}</p>
          <h2 className="text-2xl font-bold tracking-tight">{call.title}</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline"><ShieldCheck /> Consent: {call.consent.jurisdiction}</Badge>
            <Badge variant="outline">{CONSENT_BASIS_LABELS[call.consent.basis]}</Badge>
            <Badge variant="outline">Confirmed by {call.consent.confirmedBy}</Badge>
            {call.timingEstimated ? <Badge variant="secondary">Timing estimated</Badge> : null}
            {call.redactions.length ? <Badge variant="secondary">{call.redactions.length} redaction{call.redactions.length === 1 ? "" : "s"}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {writer ? (
            <Button variant="outline" disabled={busy === "analyze"} onClick={() => void run("analyze", () => api(`${base}/analyze`, { method: "POST" }))}>
              {busy === "analyze" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Re-analyze with current trackers
            </Button>
          ) : null}
          {coach ? (
            <Button onClick={() => setScoring(true)}><ClipboardCheck /> Score call</Button>
          ) : null}
          {isAdmin(role) ? (
            <Button variant="outline" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete call</Button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Not saved</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <p className={styles.eyebrow}>Talk ratio</p>
          {analysis.speakers.map((speaker) => (
            <div key={speaker.speaker} className="grid gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{speaker.speaker}{speaker.speaker === call.repSpeaker ? " (rep)" : ""}</span>
                <span className={styles.mono}>{percent(speaker.talkRatio)}</span>
              </div>
              <div className={styles.bar}><div className={styles.barFill} style={{ width: `${Math.round(speaker.talkRatio * 100)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <p className={styles.eyebrow}>Longest monologue</p>
          {analysis.longestMonologue ? (
            <>
              <p className="text-3xl font-bold">{formatTimestamp(analysis.longestMonologue.seconds)}</p>
              <p className="text-sm">{analysis.longestMonologue.speaker}</p>
              <button type="button" className={styles.timestamp} onClick={() => jump(analysis.longestMonologue!.segmentIndex)}>
                starts {formatTimestamp(analysis.longestMonologue.start)}
              </button>
            </>
          ) : <p className="text-sm">—</p>}
        </div>
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <p className={styles.eyebrow}>Questions · interactivity</p>
          <p className="text-3xl font-bold">{analysis.questionCount}</p>
          <p className="text-sm">Interactivity {analysis.interactivity.score}/10 · {analysis.interactivity.switchesPerMinute} switches/min</p>
          <p className="text-sm">Duration {formatTimestamp(analysis.durationSeconds)}</p>
        </div>
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <p className={styles.eyebrow}>Next steps ({analysis.nextSteps.length})</p>
          {analysis.nextSteps.length ? (
            <ul className="grid gap-1 text-sm">
              {analysis.nextSteps.slice(0, 5).map((step) => (
                <li key={step.segmentIndex} className="flex gap-2">
                  <button type="button" className={styles.timestamp} onClick={() => jump(step.segmentIndex)}>{formatTimestamp(step.start)}</button>
                  <span className="line-clamp-2">{step.text}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#b42318]">No next-step phrase detected.</p>}
        </div>
      </div>

      <div className={`${styles.panel} grid gap-3 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={styles.eyebrow}>Trackers · click to focus highlights</p>
          {filter ? <Button size="sm" variant="ghost" onClick={() => setFilter(null)}>Show all</Button> : null}
        </div>
        {analysis.trackerSummary.length ? (
          <div className="flex flex-wrap gap-2">
            {analysis.trackerSummary.map((entry) => (
              <Button
                key={entry.trackerId}
                size="sm"
                variant={filter === entry.trackerId ? "default" : "outline"}
                onClick={() => setFilter(filter === entry.trackerId ? null : entry.trackerId)}
              >
                {entry.trackerName}{entry.kind === "competitor" ? " (competitor)" : ""} · {entry.count} · first {formatTimestamp(entry.firstAt)}
              </Button>
            ))}
          </div>
        ) : <p className="text-sm text-[#5f5c56]">No tracker matched this call.</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={styles.panel}>
          <div className="flex items-center justify-between border-b border-[#171715] p-3">
            <p className={styles.eyebrow}>Transcript · {call.segments.length} segments · {call.format.toUpperCase()}</p>
          </div>
          <ol>
            {call.segments.map((segment) => {
              const segmentHits = hitsBySegment.get(segment.index) ?? [];
              const segmentComments = commentsBySegment.get(segment.index) ?? [];
              return (
                <li key={segment.index} id={`seg-${segment.index}`} className={`${styles.segment} ${(active ?? focusSegment) === segment.index ? styles.segmentActive : ""}`}>
                  <button type="button" className={styles.timestamp} onClick={() => setActive(segment.index)}>{formatTimestamp(segment.start)}</button>
                  <div className="grid gap-1">
                    <p className="text-sm">
                      <strong>{segment.speaker}</strong>
                      {nextStepSegments.has(segment.index) ? <Badge className="ml-2" variant="secondary">Next step</Badge> : null}
                    </p>
                    <p className="text-sm leading-relaxed">{renderSegmentText(segment, segmentHits, filter)}</p>
                    {segmentComments.map((entry) => (
                      <div key={entry.id} className={styles.comment}>
                        <strong>{entry.authorEmail}</strong> · {formatTimestamp(entry.at)}
                        <p>{entry.body}</p>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1">
                      {writer ? (
                        <Button size="xs" variant="ghost" onClick={() => setTarget({ at: segment.start, segmentIndex: segment.index })}>
                          <MessageSquarePlus /> Comment at {formatTimestamp(segment.start)}
                        </Button>
                      ) : null}
                      {coach ? (
                        <Button size="xs" variant="ghost" onClick={() => setRedactSegment(segment)}><EyeOff /> Redact</Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="grid content-start gap-4">
          {writer ? (
            <form className={`${styles.panel} grid gap-3 p-4`} onSubmit={submitComment}>
              <p className={styles.eyebrow}>Comment at {formatTimestamp(target.at)}{target.segmentIndex === null ? " (whole call)" : ""}</p>
              <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Coaching note for this moment" maxLength={2000} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!comment.trim() || busy === "comment"}>
                  {busy === "comment" ? <LoaderCircle className="animate-spin" /> : <MessageSquarePlus />} Add comment
                </Button>
                {target.segmentIndex !== null ? (
                  <Button type="button" variant="ghost" onClick={() => setTarget({ at: 0, segmentIndex: null })}>Whole call</Button>
                ) : null}
              </div>
            </form>
          ) : null}

          {(commentsBySegment.get(null) ?? []).length ? (
            <div className={`${styles.panel} grid gap-2 p-4`}>
              <p className={styles.eyebrow}>Call-level comments</p>
              {(commentsBySegment.get(null) ?? []).map((entry) => (
                <div key={entry.id} className={styles.comment}><strong>{entry.authorEmail}</strong><p>{entry.body}</p></div>
              ))}
            </div>
          ) : null}

          <div className={`${styles.panel} grid gap-2 p-4`}>
            <p className={styles.eyebrow}>Scorecards ({scorecards.length})</p>
            {scorecards.length ? scorecards.map((card) => (
              <div key={card.id} className="grid gap-1 border-t border-[#e3dfd3] pt-2 text-sm first:border-0 first:pt-0">
                <div className="flex justify-between"><strong>{card.percent}%</strong><span className="text-[#5f5c56]">{card.scorerEmail}</span></div>
                <ul className="text-xs text-[#5f5c56]">
                  {card.rubric.map((criterion) => (
                    <li key={criterion.id}>{criterion.label.split(":")[0]}: {card.scores[criterion.id]}/5</li>
                  ))}
                </ul>
                {card.notes ? <p>{card.notes}</p> : null}
              </div>
            )) : <p className="text-sm text-[#5f5c56]">Not scored yet{coach ? "." : " — managers score calls."}</p>}
          </div>

          {call.redactions.length ? (
            <div className={`${styles.panel} grid gap-2 p-4`}>
              <p className={styles.eyebrow}>Redaction log</p>
              {call.redactions.map((entry, i) => (
                <p key={i} className="text-xs">Segment {entry.segmentIndex + 1} · {entry.length} chars · {entry.reason} · {entry.by} · {shortDate(entry.at)}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={Boolean(redactSegment)} onOpenChange={(open) => !open && setRedactSegment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redact transcript text</DialogTitle>
            <DialogDescription>
              The text is permanently replaced and not kept anywhere; the audit log records who, where, how many characters, and why. Analysis is recomputed.
            </DialogDescription>
          </DialogHeader>
          {redactSegment ? <p className="max-h-32 overflow-auto border border-[#171715] bg-white p-2 text-sm">{redactSegment.text}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="redact-text">Exact text to redact</Label>
            <Input id="redact-text" value={redactText} onChange={(event) => setRedactText(event.target.value)} placeholder="e.g. a phone number" />
          </div>
          <div className="grid gap-2">
            <Label>Reason</Label>
            <Select value={redactReason} onValueChange={setRedactReason}>
              <SelectTrigger aria-label="Reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pii">Personal information</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
                <SelectItem value="off-topic">Off-topic / personal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedactSegment(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!redactText.trim() || busy === "redact"} onClick={() => void submitRedaction()}>
              {busy === "redact" ? <LoaderCircle className="animate-spin" /> : <EyeOff />} Redact permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this call permanently?</DialogTitle>
            <DialogDescription>
              The transcript, consent record, analysis, comments and scorecards are deleted. The audit log keeps who deleted it, when, and why.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-reason">Reason</Label>
            <Input id="delete-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="e.g. participant withdrew consent" maxLength={300} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteReason.trim().length < 3 || busy === "delete"} onClick={() => void submitDelete()}>
              {busy === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scoring} onOpenChange={setScoring}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Score this call</DialogTitle>
            <DialogDescription>1 = missed, 5 = excellent. The percent is the weighted average across every criterion.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {rubric.map((criterion) => (
              <div key={criterion.id} className="grid gap-2">
                <Label>{criterion.label} <span className="text-[#5f5c56]">(weight {criterion.weight})</span></Label>
                <RadioGroup
                  className="flex gap-3"
                  value={scores[criterion.id] ? String(scores[criterion.id]) : ""}
                  onValueChange={(value) => setScores((current) => ({ ...current, [criterion.id]: Number(value) }))}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="flex items-center gap-1 text-sm">
                      <RadioGroupItem value={String(value)} /> {value}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="score-notes">Coaching notes</Label>
              <Textarea id="score-notes" value={scoreNotes} onChange={(event) => setScoreNotes(event.target.value)} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoring(false)}>Cancel</Button>
            <Button disabled={!scoreComplete || busy === "score"} onClick={() => void submitScorecard()}>
              {busy === "score" ? <LoaderCircle className="animate-spin" /> : <ClipboardCheck />} Save scorecard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
