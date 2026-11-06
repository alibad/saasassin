"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getRetentionQueue } from "@/lib/revenue/data";

import { api, shortDate } from "./client";
import styles from "./revenue.module.css";

type Queue = Awaited<ReturnType<typeof getRetentionQueue>>;
type Row = Queue["due"][number];

/** Calls past their retention date, with one-click (confirmed, audited) deletion. Admin-triggered only. */
export function RetentionQueue({ tenantId, onChanged, onOpenCall }: { tenantId: string; onChanged: () => void; onOpenCall: (id: string) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState<{ rows: Row[]; all: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = `/api/revenue/tenants/${tenantId}/retention`;
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<{ queue: Queue }>(base)
      .then((result) => {
        if (!cancelled) {
          setQueue(result.queue);
          setError(null);
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [base, version]);

  async function apply() {
    if (!confirm) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ deleted: number }>(base, { method: "POST", body: JSON.stringify(confirm.all ? {} : { callIds: confirm.rows.map((row) => row.id) }) });
      setMessage(`Deleted ${result.deleted} call${result.deleted === 1 ? "" : "s"} and their comments, scorecards, clips and assignments.`);
      setConfirm(null);
      reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not deleted.");
    } finally {
      setPending(false);
    }
  }

  if (error && !queue) return <Alert variant="destructive"><AlertTitle>Retention queue unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!queue) return <Skeleton className="h-40 w-full" />;

  if (queue.retentionDays === null) {
    return (
      <div className={`${styles.panel} grid gap-2 p-4`}>
        <p className={styles.eyebrow}><Clock className="inline size-3" /> Retention due</p>
        <p className="text-sm text-[#5f5c56]">No retention period is set, so no call is ever due. Set one under Transcript retention.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} grid gap-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={styles.eyebrow}><Clock className="inline size-3" /> Retention due · {queue.due.length} past {queue.retentionDays} days</p>
        {queue.due.length ? <Button variant="destructive" size="sm" onClick={() => setConfirm({ rows: queue.due, all: true })}><Trash2 /> Apply to all {queue.due.length}</Button> : null}
      </div>
      <p className="text-xs text-[#5f5c56]">Nothing is deleted automatically. An owner or admin applies retention here; every deletion is recorded in the audit log by call id.</p>
      {message ? <p className="text-sm text-[#027a48]">{message}</p> : null}
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {queue.due.length ? (
        <div className="overflow-x-auto border border-[#171715] bg-white">
          <Table>
            <TableHeader><TableRow><TableHead>Call</TableHead><TableHead>Deal</TableHead><TableHead>Due since</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {queue.due.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <button type="button" className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => onOpenCall(row.id)}>{row.title}</button>
                    <div className="text-xs text-[#5f5c56]">{shortDate(row.occurredAt)} · {row.repEmail}</div>
                  </TableCell>
                  <TableCell className="text-xs">{row.dealName ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {shortDate(row.dueAt)} <Badge variant="outline">{row.daysOverdue === 0 ? "today" : `${row.daysOverdue}d overdue`}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setConfirm({ rows: [row], all: false })}><Trash2 /> Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-[#027a48]">No call is past its retention date.</p>
      )}
      {queue.upcoming.length ? (
        <div className="grid gap-1">
          <p className={styles.eyebrow}>Due in the next 14 days</p>
          {queue.upcoming.map((row) => <p key={row.id} className="text-xs">{shortDate(row.dueAt)} · {row.title} · {row.dealName ?? "—"}</p>)}
        </div>
      ) : null}
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {confirm?.rows.length} call{confirm?.rows.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              {confirm?.all ? "Every call past the retention period" : `“${confirm?.rows[0]?.title}”`} and its transcript, comments, scorecards, clips and coaching assignments will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void apply()}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
