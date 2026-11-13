"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  Clock,
  EyeOff,
  GraduationCap,
  HelpCircle,
  LoaderCircle,
  MessageSquarePlus,
  MoreHorizontal,
  Mic,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Trash2,
  Waves,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TrackerHit } from "@/lib/revenue/analysis";
import { locateSpan, REDACTION_MARK, segmentFingerprint } from "@/lib/revenue/coaching";
import { CONSENT_BASIS_LABELS, canCoach, canWrite, isAdmin } from "@/lib/revenue/schemas";
import { formatTimestamp, type TranscriptSegment } from "@/lib/revenue/transcript";
import { cn } from "@/lib/utils";

import { api, percent, type CallDetail, type Workspace } from "./client";
import { SpeakerLinker } from "./contacts-panel";
import { ContactAvatar, PersonAvatar, PersonChip, usePeople } from "./people";
import { ErrorText, Panel, PanelHeader, StageBadge } from "./ui";

const SPEAKER_FILLS = ["bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

function renderRedactions(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(REDACTION_MARK);
  return parts.flatMap((part, i) =>
    i === 0
      ? [<Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>]
      : [
          <span key={`${keyPrefix}-r${i}`} className="rounded bg-foreground px-1 text-[0.7rem] font-medium text-background">redacted</span>,
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
        className={cn(
          "rounded-sm px-0.5 text-foreground",
          dim ? "bg-transparent" : hit.kind === "competitor" ? "bg-destructive/15 font-medium text-destructive" : "bg-brand-accent/30",
        )}
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
  workspace,
  callId,
  onBack,
  onOpenDeal,
  onChanged,
  focusAt = null,
}: {
  workspace: Workspace;
  callId: string;
  onBack: () => void;
  onOpenDeal: (id: string) => void;
  onChanged: () => void;
  /** Seconds into the call to scroll to once the transcript loads (search results, risk evidence). */
  focusAt?: number | null;
}) {
  const people = usePeople();
  const tenantId = workspace.tenant.id;
  const role = workspace.role;
  const playlists = useMemo(() => [...new Set(workspace.snippets.map((snippet) => snippet.playlist))], [workspace.snippets]);
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
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignAtTarget, setAssignAtTarget] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [clipStart, setClipStart] = useState<TranscriptSegment | null>(null);
  const [clipEnd, setClipEnd] = useState("");
  const [clipTitle, setClipTitle] = useState("");
  const [clipPlaylist, setClipPlaylist] = useState("");
  const [clipNote, setClipNote] = useState("");
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
      setActionError(error instanceof Error ? error.message : "That didn't work. Try again.");
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
      setActionError("That exact text isn't in the selected line.");
      return;
    }
    const ok = await run("redact", () => api(`${base}/redactions`, { method: "POST", body: JSON.stringify({ ...span, reason: redactReason, fingerprint: segmentFingerprint(redactSegment.text) }) }));
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

  async function submitAssignment() {
    const ok = await run("assign", () =>
      api(`${base}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assigneeEmail: assignee, note: assignNote, at: assignAtTarget && target.segmentIndex !== null ? target.at : null }),
      }),
    );
    if (ok) {
      setNotice(`Assigned to ${people.name(assignee)}. It's in their coaching queue.`);
      setAssignOpen(false);
      setAssignNote("");
    }
  }

  async function submitClip() {
    if (!clipStart) return;
    const endSegment = clipEnd ? Number(clipEnd) : clipStart.index;
    const ok = await run("clip", () =>
      api(`${base}/snippets`, {
        method: "POST",
        body: JSON.stringify({ title: clipTitle, playlist: clipPlaylist, note: clipNote, startSegment: clipStart.index, endSegment }),
      }),
    );
    if (ok) {
      setNotice(`Saved to “${clipPlaylist}”.`);
      setClipStart(null);
      setClipEnd("");
      setClipTitle("");
      setClipNote("");
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
      setActionError(error instanceof Error ? error.message : "The call couldn't be deleted.");
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="grid gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}><ArrowLeft /> Calls</Button>
        <Alert variant="destructive">
          <AlertTitle>This call isn&apos;t available</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  const { call, deal, comments, scorecards, rubric } = detail;
  const analysis = call.analysis;
  const account = deal ? workspace.accounts.find((entry) => entry.id === deal.accountId) : null;
  const hitsBySegment = new Map<number, TrackerHit[]>();
  for (const hit of analysis.trackerHits) hitsBySegment.set(hit.segmentIndex, [...(hitsBySegment.get(hit.segmentIndex) ?? []), hit]);
  const commentsBySegment = new Map<number | null, typeof comments>();
  for (const entry of comments) commentsBySegment.set(entry.segmentIndex, [...(commentsBySegment.get(entry.segmentIndex) ?? []), entry]);
  const nextStepSegments = new Set(analysis.nextSteps.map((step) => step.segmentIndex));
  const writer = canWrite(role);
  const coach = canCoach(role);
  const scoreComplete = rubric.every((criterion) => scores[criterion.id]);
  const links = new Map((call.speakerLinks ?? []).map((link) => [link.speaker, link]));
  const contactById = new Map(workspace.contacts.map((contact) => [contact.id, contact]));
  const orderedSpeakers = [...analysis.speakers].sort((a, b) => Number(b.speaker === call.repSpeaker) - Number(a.speaker === call.repSpeaker) || b.talkRatio - a.talkRatio);
  const fillOf = new Map(orderedSpeakers.map((speaker, index) => [speaker.speaker, speaker.speaker === call.repSpeaker ? "bg-chart-1" : SPEAKER_FILLS[(index - (call.repSpeaker ? 1 : 0)) % SPEAKER_FILLS.length]]));
  const isTeam = (speaker: string) => speaker === call.repSpeaker || links.get(speaker)?.kind === "member";

  function speakerAvatar(speaker: string, size: "sm" | "md" | "lg" = "md") {
    const link = links.get(speaker);
    if (link?.kind === "member") return <PersonAvatar email={link.email} size={size} />;
    if (link?.kind === "contact") {
      const contact = contactById.get(link.contactId);
      if (contact) return <ContactAvatar id={contact.id} name={contact.name} size={size} />;
    }
    if (speaker === call.repSpeaker) return <PersonAvatar email={call.repEmail} size={size} />;
    return <ContactAvatar id={`speaker:${speaker}`} name={speaker} size={size} />;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}><ArrowLeft /> Calls</Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 gap-2">
            {deal ? (
              <button type="button" className="flex w-fit flex-wrap items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground" onClick={() => onOpenDeal(deal.id)}>
                <span>{account?.name ?? "Account"} · <span className="font-medium underline-offset-2 hover:underline">{deal.name}</span></span>
                <StageBadge stage={deal.stage} className="h-5" />
              </button>
            ) : <p className="text-sm text-muted-foreground">The deal for this call was removed</p>}
            <h1 className="brand-heading text-2xl sm:text-[1.7rem]">{call.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <PersonChip email={call.repEmail} size="sm" detail="Rep" />
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" aria-hidden="true" />{new Date(call.occurredAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden="true" />{formatTimestamp(analysis.durationSeconds)}</span>
              <span className="flex items-center gap-1" aria-label={`${call.speakers.length} speakers`}>
                {call.speakers.map((speaker) => <span key={speaker}>{speakerAvatar(speaker, "sm")}</span>)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-chart-3/10 px-2 py-0.5 text-xs font-medium text-foreground">
                <ShieldCheck className="size-3.5 text-chart-3" aria-hidden="true" /> Consent recorded · {call.consent.jurisdiction}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {coach ? <Button onClick={() => setScoring(true)}><ClipboardCheck /> Score call</Button> : null}
            {coach ? <Button variant="outline" onClick={() => setAssignOpen(true)}><GraduationCap /> Assign coaching</Button> : null}
            {writer ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem disabled={busy === "analyze"} onSelect={() => void run("analyze", () => api(`${base}/analyze`, { method: "POST" }))}>
                    {busy === "analyze" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Re-analyze with current trackers
                  </DropdownMenuItem>
                  {isAdmin(role) ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}><Trash2 /> Delete call</DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      {notice ? <p className="rounded-lg border border-chart-3/30 bg-chart-3/10 px-3 py-2 text-sm" role="status">{notice}</p> : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>That wasn&apos;t saved</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <Panel className="grid gap-0 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div className="grid content-start gap-3 border-b border-border p-4 lg:border-r lg:border-b-0">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Waves className="size-4" aria-hidden="true" /> Talk ratio</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {orderedSpeakers.map((speaker) => <span key={speaker.speaker} className={cn("h-full", fillOf.get(speaker.speaker))} style={{ width: `${speaker.talkRatio * 100}%` }} />)}
          </div>
          <ul className="grid gap-1.5">
            {orderedSpeakers.map((speaker) => (
              <li key={speaker.speaker} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 shrink-0 rounded-sm", fillOf.get(speaker.speaker))} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{speaker.speaker}{speaker.speaker === call.repSpeaker ? <span className="text-muted-foreground"> · rep</span> : null}</span>
                <span className="font-medium tabular-nums">{percent(speaker.talkRatio)}</span>
              </li>
            ))}
          </ul>
        </div>
        <Metric icon={Mic} label="Longest monologue" value={analysis.longestMonologue ? formatTimestamp(analysis.longestMonologue.seconds) : "—"}>
          {analysis.longestMonologue ? (
            <button type="button" className="text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => jump(analysis.longestMonologue!.segmentIndex)}>
              {analysis.longestMonologue.speaker} at <span className="font-medium underline underline-offset-2">{formatTimestamp(analysis.longestMonologue.start)}</span>
            </button>
          ) : null}
        </Metric>
        <Metric icon={HelpCircle} label="Questions asked" value={String(analysis.questionCount)}>
          <span className="text-xs text-muted-foreground">Interactivity {analysis.interactivity.score}/10 · {analysis.interactivity.switchesPerMinute} switches a minute</span>
        </Metric>
        <Metric icon={CalendarClock} label="Next steps" value={String(analysis.nextSteps.length)} last>
          <span className={cn("text-xs", analysis.nextSteps.length ? "text-muted-foreground" : "font-medium text-destructive")}>
            {analysis.nextSteps.length ? "Commitments found in the transcript" : "No next step was agreed on this call"}
          </span>
        </Metric>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="min-w-0">
          <div className="sticky top-14 z-10 grid gap-3 rounded-t-lg border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Transcript</h2>
              <span className="text-xs text-muted-foreground">{call.segments.length} lines{call.timingEstimated ? " · timing estimated" : ""}{call.redactions.length ? ` · ${call.redactions.length} redaction${call.redactions.length === 1 ? "" : "s"}` : ""}</span>
            </div>
            {analysis.trackerSummary.length ? (
              <div className="flex flex-wrap gap-1.5">
                {analysis.trackerSummary.map((entry) => {
                  const on = filter === entry.trackerId;
                  return (
                    <button
                      key={entry.trackerId}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(on ? null : entry.trackerId)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : entry.kind === "competitor" ? "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15" : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      {entry.trackerName}
                      <span className="tabular-nums opacity-80">{entry.count}</span>
                      <span className="opacity-60">· first {formatTimestamp(entry.firstAt)}</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground">No tracker matched this call.</p>}
          </div>
          <ol className="divide-y divide-border/70">
            {call.segments.map((segment, index) => {
              const segmentHits = hitsBySegment.get(segment.index) ?? [];
              const segmentComments = commentsBySegment.get(segment.index) ?? [];
              const continued = index > 0 && call.segments[index - 1].speaker === segment.speaker;
              const isActive = (active ?? focusSegment) === segment.index || target.segmentIndex === segment.index;
              const team = isTeam(segment.speaker);
              return (
                <li
                  key={segment.index}
                  id={`seg-${segment.index}`}
                  className={cn("group relative grid scroll-mt-40 grid-cols-[40px_minmax(0,1fr)] gap-3 px-4 py-3 transition-colors", isActive && "bg-accent/60 shadow-[inset_3px_0_0_var(--brand-accent)]", continued && "border-t-transparent pt-0")}
                >
                  <span className="pt-0.5">{continued ? null : speakerAvatar(segment.speaker)}</span>
                  <div className="grid min-w-0 gap-1.5">
                    {!continued ? (
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-semibold">{segment.speaker}</span>
                        <span className={cn("rounded px-1.5 text-[0.65rem] font-medium", team ? "bg-primary/10 text-primary dark:text-foreground" : "bg-brand-accent/20 text-accent-foreground")}>{team ? "Team" : "Customer"}</span>
                        <button type="button" className="text-xs tabular-nums text-muted-foreground hover:text-foreground hover:underline" onClick={() => setActive(segment.index)}>{formatTimestamp(segment.start)}</button>
                      </p>
                    ) : null}
                    <p className="text-[0.92rem] leading-relaxed text-foreground">
                      {continued ? <button type="button" className="mr-2 text-xs tabular-nums text-muted-foreground hover:underline" onClick={() => setActive(segment.index)}>{formatTimestamp(segment.start)}</button> : null}
                      {renderSegmentText(segment, segmentHits, filter)}
                    </p>
                    {nextStepSegments.has(segment.index) ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-chart-3/10 px-2 py-0.5 text-xs font-medium text-foreground"><CalendarClock className="size-3 text-chart-3" aria-hidden="true" /> Next step</span>
                    ) : null}
                    {segmentComments.map((entry) => (
                      <div key={entry.id} className="mt-1 flex gap-2 rounded-lg border border-border bg-background p-2.5 text-sm">
                        <PersonAvatar email={entry.authorEmail} size="sm" />
                        <div className="grid min-w-0 gap-0.5">
                          <span className="text-xs"><span className="font-semibold">{people.name(entry.authorEmail)}</span> <span className="text-muted-foreground">at {formatTimestamp(entry.at)}</span></span>
                          <p className="break-words">{entry.body}</p>
                        </div>
                      </div>
                    ))}
                    {writer || coach ? (
                      <div
                        className={cn(
                          "flex-wrap gap-1 md:absolute md:top-2 md:right-3 md:rounded-lg md:border md:border-border md:bg-card md:p-0.5 md:shadow-sm md:group-focus-within:flex md:group-hover:flex",
                          isActive ? "flex" : "hidden",
                        )}
                      >
                        {writer ? (
                          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setTarget({ at: segment.start, segmentIndex: segment.index })}>
                            <MessageSquarePlus /> Comment
                          </Button>
                        ) : null}
                        {writer ? (
                          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => { setClipStart(segment); setClipEnd(String(segment.index)); }}><Scissors /> Clip</Button>
                        ) : null}
                        {coach ? (
                          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setRedactSegment(segment)}><EyeOff /> Redact</Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="grid content-start gap-6">
          <Panel>
            <PanelHeader title="Next steps" icon={CalendarClock} />
            {analysis.nextSteps.length ? (
              <ul className="divide-y divide-border">
                {analysis.nextSteps.map((step) => (
                  <li key={step.segmentIndex}>
                    <button type="button" className="grid w-full gap-1 px-4 py-3 text-left hover:bg-muted/60" onClick={() => jump(step.segmentIndex)}>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(step.start)}</span>
                      <span className="line-clamp-3 text-sm">“{step.text}”</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-4 text-sm text-muted-foreground">Nobody committed to a next step. Worth a follow-up email today.</p>}
          </Panel>

          {writer ? (
            <Panel>
              <form className="grid gap-3 p-4" onSubmit={submitComment}>
                <p className="text-sm font-semibold">
                  {target.segmentIndex === null ? "Comment on the whole call" : `Comment at ${formatTimestamp(target.at)}`}
                </p>
                <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={target.segmentIndex === null ? "What should the team take from this call?" : "What should the rep notice here?"} maxLength={2000} className="min-h-20" />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={!comment.trim() || busy === "comment"}>
                    {busy === "comment" ? <LoaderCircle className="animate-spin" /> : <MessageSquarePlus />} Add comment
                  </Button>
                  {target.segmentIndex !== null ? <Button type="button" size="sm" variant="ghost" onClick={() => setTarget({ at: 0, segmentIndex: null })}>Whole call instead</Button> : null}
                </div>
              </form>
              {(commentsBySegment.get(null) ?? []).length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {(commentsBySegment.get(null) ?? []).map((entry) => (
                    <li key={entry.id} className="flex gap-2 px-4 py-3 text-sm">
                      <PersonAvatar email={entry.authorEmail} size="sm" />
                      <span className="grid min-w-0"><span className="text-xs font-semibold">{people.name(entry.authorEmail)}</span><span className="break-words">{entry.body}</span></span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title={`Scorecards (${scorecards.length})`} icon={ClipboardCheck} actions={coach ? <Button size="sm" variant="outline" onClick={() => setScoring(true)}>Score</Button> : null} />
            {scorecards.length ? (
              <ul className="divide-y divide-border">
                {scorecards.map((card) => (
                  <li key={card.id} className="grid gap-2 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <PersonChip email={card.scorerEmail} size="sm" detail={new Date(card.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                      <span className="brand-heading text-xl tabular-nums">{card.percent}%</span>
                    </div>
                    <ul className="grid gap-1">
                      {card.rubric.map((criterion) => (
                        <li key={criterion.id} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{criterion.label.split(":")[0]}</span>
                          <span className="flex gap-0.5" aria-label={`${card.scores[criterion.id]} of 5`}>
                            {[1, 2, 3, 4, 5].map((value) => <span key={value} className={cn("h-1.5 flex-1 rounded-full", value <= card.scores[criterion.id] ? "bg-brand-accent" : "bg-muted")} />)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {card.notes ? <p className="rounded-md bg-muted px-3 py-2">{card.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-4 text-sm text-muted-foreground">{coach ? "Score this call against your rubric to start a coaching record." : "Not scored yet. Managers score calls against the team's rubric."}</p>}
          </Panel>

          <SpeakerLinker
            tenantId={tenantId}
            callId={callId}
            speakers={call.speakers}
            links={call.speakerLinks ?? []}
            accountId={deal?.accountId ?? null}
            contacts={workspace.contacts.map(({ id, name, accountId, email, title }) => ({ id, name, accountId, email, title }))}
            members={workspace.members.map(({ email, name }) => ({ email, name }))}
            canEdit={writer}
            onChanged={refresh}
          />

          <Panel>
            <PanelHeader title="Recording consent" icon={ShieldCheck} />
            <dl className="grid gap-2 px-4 py-3 text-sm">
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Where</dt><dd>{call.consent.jurisdiction}</dd></div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">How</dt><dd>{CONSENT_BASIS_LABELS[call.consent.basis]}</dd></div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Confirmed by</dt><dd>{people.name(call.consent.confirmedBy)}</dd></div>
              {call.consent.notes ? <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Notes</dt><dd>{call.consent.notes}</dd></div> : null}
            </dl>
            {call.redactions.length ? (
              <div className="grid gap-1 border-t border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Redactions</p>
                {call.redactions.map((entry, i) => (
                  <p key={i} className="text-xs">Line {entry.segmentIndex + 1} · {entry.length} characters · {entry.reason} · {people.name(entry.by)}, {new Date(entry.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                ))}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>

      <Dialog open={Boolean(redactSegment)} onOpenChange={(open) => !open && setRedactSegment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redact part of this line</DialogTitle>
            <DialogDescription>The text is replaced permanently and isn&apos;t kept anywhere. The activity log records who redacted how many characters, and why. The call is re-analysed.</DialogDescription>
          </DialogHeader>
          {redactSegment ? <p className="max-h-32 overflow-auto rounded-md border border-border bg-muted p-3 text-sm">{redactSegment.text}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="redact-text">Exact text to remove</Label>
            <Input id="redact-text" value={redactText} onChange={(event) => setRedactText(event.target.value)} placeholder="e.g. a phone number" />
          </div>
          <div className="grid gap-2">
            <Label>Reason</Label>
            <Select value={redactReason} onValueChange={setRedactReason}>
              <SelectTrigger aria-label="Reason" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pii">Personal information</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
                <SelectItem value="off-topic">Off-topic or personal</SelectItem>
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign this call for coaching</DialogTitle>
            <DialogDescription>It lands in their coaching queue, and they mark it reviewed once they&apos;ve listened.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Who should review it</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger aria-label="Rep" className="w-full"><SelectValue placeholder="Choose a teammate" /></SelectTrigger>
                <SelectContent>
                  {workspace.members.map((member) => <SelectItem key={member.email} value={member.email}><PersonAvatar email={member.email} size="xs" /> {people.name(member.email)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-note">What to focus on</Label>
              <Textarea id="assign-note" value={assignNote} onChange={(event) => setAssignNote(event.target.value)} maxLength={1000} placeholder="e.g. Listen to how the pricing objection was handled" />
            </div>
            {target.segmentIndex !== null ? (
              <Button type="button" size="sm" className="w-fit" aria-pressed={assignAtTarget} variant={assignAtTarget ? "default" : "outline"} onClick={() => setAssignAtTarget(!assignAtTarget)}>
                {assignAtTarget ? `Starts at ${formatTimestamp(target.at)}` : `Start at ${formatTimestamp(target.at)} instead of the beginning`}
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button disabled={!assignee || assignNote.trim().length < 3 || busy === "assign"} onClick={() => void submitAssignment()}>
              {busy === "assign" ? <LoaderCircle className="animate-spin" /> : <GraduationCap />} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(clipStart)} onOpenChange={(open) => !open && setClipStart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save a clip to a playlist</DialogTitle>
            <DialogDescription>Clips point at the call, so a redaction or deletion always applies to them too.</DialogDescription>
          </DialogHeader>
          {clipStart ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">From {formatTimestamp(clipStart.start)} · {clipStart.speaker}</p>
              <div className="grid gap-2">
                <Label>Ends at</Label>
                <Select value={clipEnd} onValueChange={setClipEnd}>
                  <SelectTrigger aria-label="Clip end" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {call.segments.filter((segment) => segment.index >= clipStart.index && segment.index < clipStart.index + 40).map((segment) => (
                      <SelectItem key={segment.index} value={String(segment.index)}>
                        {formatTimestamp(segment.end)} · {segment.speaker}: {segment.text.slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clip-title">Title</Label>
                <Input id="clip-title" value={clipTitle} onChange={(event) => setClipTitle(event.target.value)} placeholder="Great pricing objection handling" maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clip-playlist">Playlist</Label>
                <Input id="clip-playlist" value={clipPlaylist} onChange={(event) => setClipPlaylist(event.target.value)} placeholder="Objection handling" maxLength={60} />
                {playlists.length ? (
                  <div className="flex flex-wrap gap-1">
                    {playlists.map((name) => (
                      <Button key={name} type="button" size="xs" variant={clipPlaylist === name ? "default" : "outline"} onClick={() => setClipPlaylist(name)}>{name}</Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clip-note">Why it matters (optional)</Label>
                <Textarea id="clip-note" value={clipNote} onChange={(event) => setClipNote(event.target.value)} maxLength={1000} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClipStart(null)}>Cancel</Button>
            <Button disabled={clipTitle.trim().length < 2 || clipPlaylist.trim().length < 2 || busy === "clip"} onClick={() => void submitClip()}>
              {busy === "clip" ? <LoaderCircle className="animate-spin" /> : <Scissors />} Save clip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this call permanently?</DialogTitle>
            <DialogDescription>The transcript, consent record, analysis, comments and scorecards are deleted. The activity log keeps who deleted it, when and why.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-reason">Reason</Label>
            <Input id="delete-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="e.g. a participant withdrew consent" maxLength={300} />
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
            <DialogDescription>1 means it was missed, 5 means it was excellent. The score is the weighted average across the rubric.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {rubric.map((criterion) => (
              <div key={criterion.id} className="grid gap-2">
                <Label>{criterion.label} <span className="font-normal text-muted-foreground">(weight {criterion.weight})</span></Label>
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
          <ErrorText>{actionError}</ErrorText>
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

function Metric({ icon: Icon, label, value, children, last = false }: { icon: typeof Mic; label: string; value: string; children?: ReactNode; last?: boolean }) {
  return (
    <div className={cn("grid content-start gap-1 border-b border-border p-4 lg:border-b-0", !last && "lg:border-r")}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{label}</p>
      <p className="brand-heading text-2xl tabular-nums">{value}</p>
      {children}
    </div>
  );
}
