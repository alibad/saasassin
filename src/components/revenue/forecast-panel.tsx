"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEAL_STAGE_LABELS, DEAL_STAGES, isOpenStage, OPEN_STAGES } from "@/lib/revenue/deals";
import { FORECAST_CATEGORY_LABELS, FORECAST_DEFINITIONS, type ForecastBucket } from "@/lib/revenue/forecast";
import { isAdmin } from "@/lib/revenue/schemas";

import { api, money, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import styles from "./revenue.module.css";

function monthLabel(key: string) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  return new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function BucketTable({ title, buckets, label }: { title: string; buckets: ForecastBucket[]; label: (key: string) => string }) {
  return (
    <div className={`${styles.panel} grid gap-2 overflow-x-auto p-0`}>
      <p className={`${styles.eyebrow} px-4 pt-4`}>{title}</p>
      {buckets.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{title.includes("rep") ? "Owner" : "Close month"}</TableHead>
              <TableHead>Deals</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead>Best case</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Weighted</TableHead>
              <TableHead>Closed won</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((bucket) => (
              <TableRow key={bucket.key}>
                <TableCell className="font-semibold">{label(bucket.key)}</TableCell>
                <TableCell className={styles.mono}>{bucket.deals}</TableCell>
                <TableCell className={styles.mono}>{money(bucket.commit)}</TableCell>
                <TableCell className={styles.mono}>{money(bucket.bestCase)}</TableCell>
                <TableCell className={styles.mono}>{money(bucket.pipeline)}</TableCell>
                <TableCell className={styles.mono}>{money(bucket.weighted)}</TableCell>
                <TableCell className={styles.mono}>{money(bucket.closedWon)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-4 pb-4 text-sm text-[#5f5c56]">No open or won deals yet.</p>
      )}
    </div>
  );
}

export function ForecastPanel({ workspace, onChanged, onOpenDeal }: { workspace: Workspace; onChanged: () => void; onOpenDeal: (deal: WorkspaceDeal) => void }) {
  const { forecast } = workspace;
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const openDeals = workspace.deals.filter((deal) => isOpenStage(deal.stage)).sort((a, b) => (a.closeDate ?? "9999").localeCompare(b.closeDate ?? "9999"));

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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.deals.length) {
    return (
      <div className={`${styles.panel} grid gap-2 p-6`}>
        <h2 className="text-lg font-bold">No deals to forecast</h2>
        <p className="text-sm text-[#5f5c56]">The forecast is computed only from deals in this workspace. Add a deal with an amount and close date to see it here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Commit", forecast.total.commit],
          ["Best case", forecast.total.bestCase],
          ["Pipeline", forecast.total.pipeline],
          ["Weighted pipeline", forecast.total.weighted],
          ["Closed won", forecast.total.closedWon],
        ].map(([label, value]) => (
          <div key={label} className={`${styles.panel} p-4`}>
            <p className={styles.eyebrow}>{label}</p>
            <p className="text-2xl font-bold">{money(Number(value))}</p>
          </div>
        ))}
      </div>

      <BucketTable title="By close month" buckets={forecast.byMonth} label={monthLabel} />
      <BucketTable title="By rep (deal owner)" buckets={forecast.byRep} label={(key) => key} />

      <div className={`${styles.panel} overflow-x-auto`}>
        <p className={`${styles.eyebrow} px-4 pt-4`}>Open deals · owner call and manager override</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Weighted</TableHead>
              <TableHead>Close</TableHead>
              <TableHead>Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openDeals.map((deal) => (
              <TableRow key={deal.id} className="cursor-pointer" onClick={() => onOpenDeal(deal)}>
                <TableCell>
                  <button type="button" className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => onOpenDeal(deal)}>{deal.name}</button>
                  <div className="text-xs text-[#5f5c56]">{deal.ownerEmail}</div>
                </TableCell>
                <TableCell className="text-xs">{DEAL_STAGE_LABELS[deal.stage]} ({forecast.probabilities[deal.stage]}%)</TableCell>
                <TableCell className={styles.mono}>{money(deal.amount, deal.currency)}</TableCell>
                <TableCell className={styles.mono}>{money((deal.amount * forecast.probabilities[deal.stage]) / 100, deal.currency)}</TableCell>
                <TableCell className="text-xs">{shortDate(deal.closeDate)}</TableCell>
                <TableCell>
                  <Badge variant={deal.forecast?.override ? "secondary" : "outline"}>{FORECAST_CATEGORY_LABELS[deal.forecastCategory]}</Badge>
                  {deal.forecast?.override ? <div className="text-xs text-[#7a2e0e]">Override by {deal.forecast.override.by}</div> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-4 pb-4 text-xs text-[#5f5c56]">Open a deal to call its category (owner) or override it (managers, admins, owners).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <div className="flex items-center justify-between gap-2">
            <p className={styles.eyebrow}>Stage probabilities</p>
            {admin ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(Object.fromEntries(OPEN_STAGES.map((stage) => [stage, String(forecast.probabilities[stage])])))}>
                <Pencil /> Edit
              </Button>
            ) : null}
          </div>
          {DEAL_STAGES.map((stage) => (
            <p key={stage} className="flex justify-between text-sm"><span>{DEAL_STAGE_LABELS[stage]}</span><span className={styles.mono}>{forecast.probabilities[stage]}%</span></p>
          ))}
          {!admin ? <p className="text-xs text-[#5f5c56]">Owners and admins set stage probabilities.</p> : null}
        </div>
        <div className={`${styles.panel} grid content-start gap-2 p-4`}>
          <p className={styles.eyebrow}>Definitions</p>
          {FORECAST_DEFINITIONS.map((entry) => <p key={entry.term} className="text-sm"><strong>{entry.term}:</strong> {entry.definition}</p>)}
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stage probabilities</DialogTitle>
            <DialogDescription>Win probability per open stage (0–100). Closed won is always 100% and closed lost 0%. Changes are audited.</DialogDescription>
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
          {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => void saveProbabilities()}>Save probabilities</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
