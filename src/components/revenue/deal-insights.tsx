"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Flag, MessageSquare, Phone, Route } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_STAGE_LABELS, isOpenStage } from "@/lib/revenue/deals";
import { FORECAST_CATEGORIES, FORECAST_CATEGORY_LABELS, type ForecastCategory } from "@/lib/revenue/forecast";
import type { getDealTimeline } from "@/lib/revenue/pipeline-data";
import { canCoach, canWrite } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { cn } from "@/lib/utils";

import { api, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { ErrorText, Panel, PanelHeader, stageDot } from "./ui";

export type Timeline = Awaited<ReturnType<typeof getDealTimeline>>;

/** Owner's forecast call plus a manager override (with a required reason). */
export function DealForecastControls({ workspace, deal, onChanged }: { workspace: Workspace; deal: WorkspaceDeal; onChanged: () => void }) {
  const people = usePeople();
  const [overriding, setOverriding] = useState<ForecastCategory | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isOwner = deal.ownerEmail.toLowerCase() === workspace.user.email.toLowerCase();
  const coach = canCoach(workspace.role);
  const open = isOpenStage(deal.stage);
  const call = deal.forecast?.call ?? null;
  const override = deal.forecast?.override ?? null;

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/deals/${deal.id}/forecast`, { method: "PUT", body: JSON.stringify(body) });
      setOverriding(null);
      setReason("");
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Forecast" icon={Flag} description={open ? `Counts as ${FORECAST_CATEGORY_LABELS[deal.forecastCategory]}` : "Closed deals aren't forecast"} />
      {open ? (
        <div className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <Label>Owner&apos;s call</Label>
            {isOwner && canWrite(workspace.role) ? (
              <Select value={call?.category ?? "pipeline"} onValueChange={(value) => value !== (call?.category ?? "pipeline") && void send({ kind: "call", category: value })} disabled={pending}>
                <SelectTrigger aria-label="Your forecast call" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FORECAST_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{FORECAST_CATEGORY_LABELS[category]}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <p className="text-sm">
                {call ? <>{FORECAST_CATEGORY_LABELS[call.category]} <span className="text-muted-foreground">· {people.name(call.by)}, {shortDate(call.at)}</span></> : <span className="text-muted-foreground">Not called yet, so it counts as Pipeline</span>}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Manager override</Label>
            {override ? (
              <div className="grid gap-2 rounded-md border border-brand-accent/40 bg-accent p-3 text-sm text-accent-foreground">
                <span className="flex items-center gap-2 font-semibold"><PersonAvatar email={override.by} size="xs" />{FORECAST_CATEGORY_LABELS[override.category]} · {people.name(override.by)}</span>
                <span>“{override.reason}”</span>
                {coach ? <Button size="sm" variant="outline" className="w-fit bg-card" disabled={pending} onClick={() => void send({ kind: "clear_override" })}>Clear override</Button> : null}
              </div>
            ) : coach ? (
              <Select value="" onValueChange={(value) => setOverriding(value as ForecastCategory)}>
                <SelectTrigger aria-label="Override forecast" className="w-full"><SelectValue placeholder="Override the owner's call…" /></SelectTrigger>
                <SelectContent>{FORECAST_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{FORECAST_CATEGORY_LABELS[category]}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}
      <Dialog open={Boolean(overriding)} onOpenChange={(value) => !value && setOverriding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override to {overriding ? FORECAST_CATEGORY_LABELS[overriding] : ""}?</DialogTitle>
            <DialogDescription>The owner&apos;s call stays visible next to yours. Your name and reason are recorded in the activity log.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="override-reason">Why</Label>
          <Textarea id="override-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="e.g. Security review hasn't started" />
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverriding(null)}>Cancel</Button>
            <Button disabled={pending || reason.trim().length < 3} onClick={() => void send({ kind: "override", category: overriding, reason })}>Save override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

export function useDealTimeline(tenantId: string, dealId: string, version: number) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<Timeline>(`/api/revenue/tenants/${tenantId}/deals/${dealId}/timeline`)
      .then((result) => {
        if (!cancelled) {
          setTimeline(result);
          setError(null);
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId, dealId, version]);
  return { timeline, error };
}

/** Days spent in each stage, with revisits, and whether the deal has stalled. */
export function DealStageTime({ timeline, error }: { timeline: Timeline | null; error: string | null }) {
  if (error) return <Alert variant="destructive"><AlertTitle>Stage history unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!timeline) return <Skeleton className="h-40 w-full" />;
  const { stats } = timeline;
  const longest = Math.max(1, ...stats.durations.map((entry) => entry.days));
  return (
    <Panel>
      <PanelHeader
        title="Time in stage"
        icon={Route}
        description={`${stats.daysInCurrentStage} day${stats.daysInCurrentStage === 1 ? "" : "s"} in ${DEAL_STAGE_LABELS[stats.currentStage]} · deal age ${stats.ageDays} days`}
        actions={stats.stalled ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Stalled · over {stats.stalledAfterDays} days</span> : null}
      />
      <div className="grid gap-2.5 p-4">
        {stats.durations.map((entry) => (
          <div key={entry.stage} className="grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 truncate text-muted-foreground"><span className={cn("size-2 shrink-0 rounded-full", stageDot(entry.stage))} aria-hidden="true" />{DEAL_STAGE_LABELS[entry.stage]}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className={cn("block h-full rounded-full", entry.stage === stats.currentStage ? "bg-brand-accent" : "bg-chart-3")} style={{ width: `${Math.max(4, (entry.days / longest) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums">{entry.days}d{entry.visits > 1 ? ` ×${entry.visits}` : ""}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const ICONS = { stage: Route, call: Phone, next_step: CalendarClock, comment: MessageSquare } as const;

/** Stage changes, calls, next steps and comments in one stream, newest first. */
export function DealActivity({ timeline, error, onOpenCall }: { timeline: Timeline | null; error: string | null; onOpenCall: (id: string, at?: number | null) => void }) {
  const people = usePeople();
  if (error) return <Alert variant="destructive"><AlertTitle>Activity unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!timeline) return <Skeleton className="h-64 w-full" />;
  const entries = timeline.entries;
  return (
    <Panel>
      <PanelHeader title="Activity" icon={CalendarClock} description="Every stage move, call, next step and comment on this deal." />
      {entries.length ? (
        <ol className="relative grid gap-0 px-4 py-2">
          {entries.map((entry, index) => {
            const Icon = ICONS[entry.kind];
            return (
              <li key={index} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-2.5">
                {index < entries.length - 1 ? <span className="absolute top-9 bottom-0 left-[13px] w-px bg-border" aria-hidden="true" /> : null}
                <span
                  className={cn(
                    "z-10 grid size-7 place-items-center rounded-full border border-border bg-card",
                    entry.kind === "next_step" && "border-chart-3/40 text-chart-3",
                    entry.kind === "call" && "border-transparent bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="grid min-w-0 gap-1 text-sm">
                  {entry.kind === "stage" ? (
                    <p className="flex flex-wrap items-center gap-x-1.5">
                      <span className="font-medium">{entry.from ? `${DEAL_STAGE_LABELS[entry.from]} → ${DEAL_STAGE_LABELS[entry.to]}` : `Created in ${DEAL_STAGE_LABELS[entry.to]}`}</span>
                      <span className="text-muted-foreground">by {people.name(entry.by)}</span>
                    </p>
                  ) : entry.kind === "call" ? (
                    <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => onOpenCall(entry.callId)}>
                      <span className="truncate font-medium hover:underline">{entry.title}</span>
                      <span className="shrink-0 text-muted-foreground">· {formatTimestamp(entry.durationSeconds)}</span>
                      <PersonAvatar email={entry.repEmail} size="xs" />
                    </button>
                  ) : entry.kind === "next_step" ? (
                    <button type="button" className="grid text-left" onClick={() => onOpenCall(entry.callId, entry.offset)}>
                      <span className="text-xs font-medium text-chart-3">Next step · {entry.callTitle} at {formatTimestamp(entry.offset)}</span>
                      <span className="break-words">“{entry.text}”</span>
                    </button>
                  ) : (
                    <button type="button" className="grid gap-1 text-left" onClick={() => onOpenCall(entry.callId, entry.offset)}>
                      <PersonChip email={entry.authorEmail} size="xs" detail={`on ${entry.callTitle} at ${formatTimestamp(entry.offset)}`} nameClassName="text-xs" />
                      <span className="break-words rounded-md bg-muted px-3 py-2">{entry.body}</span>
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing yet. Log a call to start the story of this deal.</p>
      )}
    </Panel>
  );
}
