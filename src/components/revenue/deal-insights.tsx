"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Flag, MessageSquare, Phone, Route } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_ROLE_LABELS } from "@/lib/revenue/contacts";
import { DEAL_STAGE_LABELS, isOpenStage } from "@/lib/revenue/deals";
import { FORECAST_CATEGORIES, FORECAST_CATEGORY_LABELS, type ForecastCategory } from "@/lib/revenue/forecast";
import type { getDealTimeline } from "@/lib/revenue/pipeline-data";
import { canCoach, canWrite } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";

import { api, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import styles from "./revenue.module.css";

type Timeline = Awaited<ReturnType<typeof getDealTimeline>>;

/** Owner's forecast call plus a manager override (with a required reason). */
export function DealForecastControls({ workspace, deal, onChanged }: { workspace: Workspace; deal: WorkspaceDeal; onChanged: () => void }) {
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
      setError(err instanceof Error ? err.message : "Not saved.");
      return false;
    } finally {
      setPending(false);
    }
  }

  if (!open) return <p className="text-xs text-[#5f5c56]">Closed deals are not forecast.</p>;

  return (
    <div className="grid gap-2">
      <p className={styles.eyebrow}><Flag className="inline size-3" /> Forecast · {FORECAST_CATEGORY_LABELS[deal.forecastCategory]}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Owner&apos;s call</Label>
          {isOwner && canWrite(workspace.role) ? (
            <Select value={call?.category ?? "pipeline"} onValueChange={(value) => value !== (call?.category ?? "pipeline") && void send({ kind: "call", category: value })} disabled={pending}>
              <SelectTrigger aria-label="Your forecast call" className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{FORECAST_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{FORECAST_CATEGORY_LABELS[category]}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{call ? `${FORECAST_CATEGORY_LABELS[call.category]} · ${call.by} · ${shortDate(call.at)}` : "Not called yet (counts as Pipeline)"}</p>
          )}
        </div>
        <div className="grid gap-1">
          <Label>Manager override</Label>
          {override ? (
            <div className="grid gap-1 border border-[#b54708] bg-[#fef0c7] p-2 text-xs text-[#7a2e0e]">
              <strong>{FORECAST_CATEGORY_LABELS[override.category]} · {override.by}</strong>
              <span>{override.reason}</span>
              {coach ? <Button size="sm" variant="outline" className="w-fit" disabled={pending} onClick={() => void send({ kind: "clear_override" })}>Clear override</Button> : null}
            </div>
          ) : coach ? (
            <Select value="" onValueChange={(value) => setOverriding(value as ForecastCategory)}>
              <SelectTrigger aria-label="Override forecast" className="bg-white"><SelectValue placeholder="Override…" /></SelectTrigger>
              <SelectContent>{FORECAST_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{FORECAST_CATEGORY_LABELS[category]}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-[#5f5c56]">None</p>
          )}
        </div>
      </div>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      <Dialog open={Boolean(overriding)} onOpenChange={(value) => !value && setOverriding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override to {overriding ? FORECAST_CATEGORY_LABELS[overriding] : ""}?</DialogTitle>
            <DialogDescription>The owner&apos;s call stays visible. Your override, name and reason are recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="override-reason">Reason</Label>
          <Textarea id="override-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="e.g. Security review has not started" />
          {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverriding(null)}>Cancel</Button>
            <Button disabled={pending || reason.trim().length < 3} onClick={() => void send({ kind: "override", category: overriding, reason })}>Save override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ICONS = { stage: Route, call: Phone, next_step: CalendarClock, comment: MessageSquare } as const;

export function DealTimeline({
  tenantId,
  dealId,
  version,
  onOpenCall,
}: {
  tenantId: string;
  dealId: string;
  /** Bumps when the workspace reloads, so the timeline refetches after edits. */
  version: number;
  onOpenCall: (id: string, at?: number | null) => void;
}) {
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

  if (error) return <Alert variant="destructive"><AlertTitle>Timeline unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!timeline) return <Skeleton className="h-40 w-full" />;
  const { stats } = timeline;
  const longest = Math.max(1, ...stats.durations.map((entry) => entry.days));

  return (
    <div className="grid gap-3">
      <p className={styles.eyebrow}>Timeline &amp; time in stage</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant={stats.stalled ? "destructive" : "outline"}>
          {stats.daysInCurrentStage} day{stats.daysInCurrentStage === 1 ? "" : "s"} in {DEAL_STAGE_LABELS[stats.currentStage]}{stats.stalled ? ` · stalled (>${stats.stalledAfterDays})` : ""}
        </Badge>
        <Badge variant="outline">Deal age {stats.ageDays} days</Badge>
      </div>
      <div className="grid gap-1">
        {stats.durations.map((entry) => (
          <div key={entry.stage} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-2 text-xs">
            <span>{DEAL_STAGE_LABELS[entry.stage]}</span>
            <span className="h-2 border border-[#171715] bg-white" aria-hidden="true">
              <span className="block h-full bg-[var(--rev-accent)]" style={{ width: `${Math.max(4, (entry.days / longest) * 100)}%` }} />
            </span>
            <span className={`${styles.mono} text-right`}>{entry.days}d{entry.visits > 1 ? ` ×${entry.visits}` : ""}</span>
          </div>
        ))}
      </div>
      {timeline.people.some((person) => person.engagement) ? (
        <p className="text-xs text-[#5f5c56]">
          Heard on calls: {timeline.people.filter((person) => person.engagement).map((person) => `${person.name}${person.role ? ` (${DEAL_ROLE_LABELS[person.role]})` : ""} ${formatTimestamp(person.engagement!.talkSeconds)}`).join(" · ")}
        </p>
      ) : null}
      <ol className="grid gap-1">
        {timeline.entries.map((entry, i) => {
          const Icon = ICONS[entry.kind];
          return (
            <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 border-t border-[#e3dfd3] pt-1 text-sm">
              <Icon className="mt-0.5 size-4 text-[#5f5c56]" aria-hidden="true" />
              <div className="min-w-0">
                <span className="text-xs text-[#5f5c56]">{shortDate(entry.at)} · </span>
                {entry.kind === "stage" ? (
                  <span>{entry.from ? `${DEAL_STAGE_LABELS[entry.from]} → ` : "Created in "}{DEAL_STAGE_LABELS[entry.to]} <span className="text-xs text-[#5f5c56]">by {entry.by}</span></span>
                ) : entry.kind === "call" ? (
                  <button type="button" className="text-left underline" onClick={() => onOpenCall(entry.callId)}>Call: {entry.title} ({formatTimestamp(entry.durationSeconds)})</button>
                ) : entry.kind === "next_step" ? (
                  <button type="button" className="text-left" onClick={() => onOpenCall(entry.callId, entry.offset)}>
                    <Badge variant="secondary">Next step</Badge> <span className="break-words">{entry.text}</span> <span className="text-xs underline">at {formatTimestamp(entry.offset)}</span>
                  </button>
                ) : (
                  <button type="button" className="text-left" onClick={() => onOpenCall(entry.callId, entry.offset)}>
                    <strong className="text-xs">{entry.authorEmail}</strong> on {entry.callTitle} at {formatTimestamp(entry.offset)}: <span className="break-words">{entry.body}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
