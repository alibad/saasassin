"use client";

import { useState } from "react";
import { BookOpen, LineChart, Pencil, Percent, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEAL_STAGE_LABELS, DEAL_STAGES, isOpenStage, OPEN_STAGES } from "@/lib/revenue/deals";
import { FORECAST_CATEGORY_LABELS, FORECAST_DEFINITIONS, type ForecastBucket } from "@/lib/revenue/forecast";
import { isAdmin } from "@/lib/revenue/schemas";
import { cn } from "@/lib/utils";

import { api, money, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { compactMoney, EmptyState, ErrorText, PageHeader, Panel, PanelHeader, StageBadge, StatTile } from "./ui";

function monthLabel(key: string) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key === "none" ? "No close date" : key;
  return new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const SERIES = [
  { key: "closedWon", label: "Closed won", fill: "bg-chart-3" },
  { key: "commit", label: "Commit", fill: "bg-chart-1" },
  { key: "bestCaseOnly", label: "Best case", fill: "bg-chart-2" },
  { key: "pipelineOnly", label: "Pipeline", fill: "bg-chart-4" },
] as const;

/** Stacked monthly columns: won, then commit, best case and the rest of pipeline on top. */
function MonthChart({ buckets }: { buckets: ForecastBucket[] }) {
  const rows = buckets.map((bucket) => ({
    key: bucket.key,
    closedWon: bucket.closedWon,
    commit: bucket.commit,
    bestCaseOnly: Math.max(0, bucket.bestCase - bucket.commit),
    pipelineOnly: Math.max(0, bucket.pipeline - bucket.bestCase),
    weighted: bucket.weighted,
  }));
  const max = Math.max(1, ...rows.map((row) => row.closedWon + row.commit + row.bestCaseOnly + row.pipelineOnly));
  return (
    <div className="grid gap-4 p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((series) => <span key={series.key} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", series.fill)} aria-hidden="true" />{series.label}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-foreground" aria-hidden="true" />Weighted</span>
      </div>
      <div className="flex h-56 items-end gap-3 border-b border-border sm:gap-6" role="img" aria-label="Forecast by close month">
        {rows.map((row) => {
          const total = row.closedWon + row.commit + row.bestCaseOnly + row.pipelineOnly;
          return (
            <div key={row.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs font-medium tabular-nums">{compactMoney(total)}</span>
              <div className="relative flex w-full max-w-16 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(total / max) * 85}%` }}>
                {SERIES.map((series) => (row[series.key] ? <span key={series.key} className={cn("w-full", series.fill)} style={{ height: `${(row[series.key] / total) * 100}%` }} /> : null))}
                <span className="absolute inset-x-0 h-0.5 bg-foreground" style={{ bottom: `${Math.min(100, (row.weighted / Math.max(1, total)) * 100)}%` }} aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 sm:gap-6">
        {rows.map((row) => <span key={row.key} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">{monthLabel(row.key)}</span>)}
      </div>
    </div>
  );
}

export function ForecastPanel({ workspace, onChanged, onOpenDeal }: { workspace: Workspace; onChanged: () => void; onOpenDeal: (deal: WorkspaceDeal) => void }) {
  const { forecast } = workspace;
  const people = usePeople();
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const openDeals = workspace.deals.filter((deal) => isOpenStage(deal.stage)).sort((a, b) => (a.closeDate ?? "9999").localeCompare(b.closeDate ?? "9999"));
  const maxRep = Math.max(1, ...forecast.byRep.map((bucket) => bucket.pipeline + bucket.closedWon));

  async function saveProbabilities() {
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      const stageProbabilities = Object.fromEntries(OPEN_STAGES.map((stage) => [stage, Number(editing[stage])]));
      await api(`/api/revenue/tenants/${workspace.tenant.id}/settings`, { method: "PUT", body: JSON.stringify({ stageProbabilities }) });
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The probabilities weren't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.deals.length) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Forecast" />
        <EmptyState icon={LineChart} title="Your forecast builds itself from real deals">
          Add deals with an amount and a close date. Owners call each one, managers can override, and the roll-up appears here. Nothing is estimated from outside data.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Forecast" description="Rolled up from every deal in this workspace: the owner's call, a manager's override when there is one, and your stage probabilities." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <StatTile label="Commit" value={compactMoney(forecast.total.commit)} tone="accent" />
        <StatTile label="Best case" value={compactMoney(forecast.total.bestCase)} />
        <StatTile label="Pipeline" value={compactMoney(forecast.total.pipeline)} />
        <StatTile label="Weighted pipeline" value={compactMoney(forecast.total.weighted)} />
        <StatTile label="Closed won" value={compactMoney(forecast.total.closedWon)} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <Panel>
          <PanelHeader title="By close month" icon={LineChart} />
          {forecast.byMonth.length ? <MonthChart buckets={forecast.byMonth} /> : <p className="px-4 py-6 text-sm text-muted-foreground">No open or won deals yet.</p>}
        </Panel>
        <Panel>
          <PanelHeader title="By rep" icon={Users} description="Deal owner's pipeline, weighted and won" />
          <ul className="divide-y divide-border">
            {forecast.byRep.map((bucket) => (
              <li key={bucket.key} className="grid gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <PersonChip email={bucket.key} size="md" detail={`${bucket.deals} deal${bucket.deals === 1 ? "" : "s"} · commit ${compactMoney(bucket.commit)}`} />
                  <span className="grid text-right">
                    <span className="font-semibold tabular-nums">{compactMoney(bucket.weighted)}</span>
                    <span className="text-xs text-muted-foreground">weighted</span>
                  </span>
                </div>
                <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="bg-chart-3" style={{ width: `${(bucket.closedWon / maxRep) * 100}%` }} />
                  <span className="bg-chart-1" style={{ width: `${(bucket.commit / maxRep) * 100}%` }} />
                  <span className="bg-chart-2" style={{ width: `${(Math.max(0, bucket.bestCase - bucket.commit) / maxRep) * 100}%` }} />
                  <span className="bg-chart-4" style={{ width: `${(Math.max(0, bucket.pipeline - bucket.bestCase) / maxRep) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader title="Open deals" description="Open a deal to make your call (owners) or override it (managers and admins)." />
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Deal</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Weighted</TableHead>
              <TableHead>Close</TableHead>
              <TableHead className="pr-4">Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openDeals.map((deal) => (
              <TableRow key={deal.id} className="cursor-pointer" onClick={() => onOpenDeal(deal)}>
                <TableCell className="pl-4"><button type="button" className="text-left font-medium hover:underline" onClick={() => onOpenDeal(deal)}>{deal.name}</button></TableCell>
                <TableCell><PersonChip email={deal.ownerEmail} size="sm" /></TableCell>
                <TableCell><span className="flex items-center gap-2"><StageBadge stage={deal.stage} /><span className="text-xs text-muted-foreground">{forecast.probabilities[deal.stage]}%</span></span></TableCell>
                <TableCell className="text-right tabular-nums">{money(deal.amount, deal.currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{money((deal.amount * forecast.probabilities[deal.stage]) / 100, deal.currency)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{shortDate(deal.closeDate)}</TableCell>
                <TableCell className="pr-4">
                  <span className="grid gap-0.5">
                    <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", deal.forecastCategory === "commit" ? "bg-primary text-primary-foreground" : deal.forecastCategory === "best_case" ? "bg-brand-accent/25 text-accent-foreground" : "bg-secondary text-secondary-foreground")}>
                      {FORECAST_CATEGORY_LABELS[deal.forecastCategory]}
                    </span>
                    {deal.forecast?.override ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><PersonAvatar email={deal.forecast.override.by} size="xs" />override by {people.firstName(deal.forecast.override.by)}</span>
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Stage probabilities"
            icon={Percent}
            actions={admin ? <Button size="sm" variant="outline" onClick={() => setEditing(Object.fromEntries(OPEN_STAGES.map((stage) => [stage, String(forecast.probabilities[stage])])))}><Pencil /> Edit</Button> : null}
          />
          <div className="grid gap-2 p-4">
            {DEAL_STAGES.map((stage) => (
              <div key={stage} className="grid grid-cols-[112px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
                <span>{DEAL_STAGE_LABELS[stage]}</span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${forecast.probabilities[stage]}%` }} /></span>
                <span className="text-right tabular-nums">{forecast.probabilities[stage]}%</span>
              </div>
            ))}
            {!admin ? <p className="pt-1 text-xs text-muted-foreground">Owners and admins set stage probabilities.</p> : null}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="How the numbers work" icon={BookOpen} />
          <dl className="grid gap-2 p-4 text-sm">
            {FORECAST_DEFINITIONS.map((entry) => (
              <div key={entry.term}><dt className="inline font-medium">{entry.term}: </dt><dd className="inline text-muted-foreground">{entry.definition}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stage probabilities</DialogTitle>
            <DialogDescription>Win probability for each open stage, from 0 to 100. Closed won is always 100% and closed lost 0%. Changes are recorded in the activity log.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-2">
              {OPEN_STAGES.map((stage) => (
                <label key={stage} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2 text-sm">
                  {DEAL_STAGE_LABELS[stage]}
                  <Input aria-label={`${DEAL_STAGE_LABELS[stage]} probability`} type="number" min={0} max={100} value={editing[stage]} onChange={(event) => setEditing({ ...editing, [stage]: event.target.value })} />
                </label>
              ))}
            </div>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => void saveProbabilities()}>Save probabilities</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
