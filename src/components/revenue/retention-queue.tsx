"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getRetentionQueue } from "@/lib/revenue/data";

import { api, shortDate } from "./client";
import { PersonAvatar } from "./people";
import { ErrorText, Panel, PanelHeader, SuccessText } from "./ui";

type Queue = Awaited<ReturnType<typeof getRetentionQueue>>;
type Row = Queue["due"][number];

/** Calls past their retention date, with confirmed, logged deletion. Applied by an owner or admin only. */
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
      setMessage(`Deleted ${result.deleted} call${result.deleted === 1 ? "" : "s"} with their comments, scorecards, clips and coaching assignments.`);
      setConfirm(null);
      reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was deleted. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (error && !queue) return <Alert variant="destructive"><AlertTitle>The retention queue isn&apos;t available</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!queue) return <Skeleton className="h-40 w-full" />;

  if (queue.retentionDays === null) {
    return (
      <Panel>
        <PanelHeader title="Due for deletion" icon={Clock} />
        <p className="px-4 py-6 text-sm text-muted-foreground">No retention period is set, so calls are kept until someone deletes them. Set one to list older calls here for review.</p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={`Due for deletion · ${queue.due.length}`}
        icon={Clock}
        description={`Calls older than ${queue.retentionDays} days. Nothing is deleted until you confirm, and each deletion is logged.`}
        actions={queue.due.length ? <Button variant="destructive" size="sm" onClick={() => setConfirm({ rows: queue.due, all: true })}><Trash2 /> Delete all {queue.due.length}</Button> : null}
      />
      <div className="px-4 pt-3 empty:hidden">
        <SuccessText>{message}</SuccessText>
        <ErrorText>{error}</ErrorText>
      </div>
      {queue.due.length ? (
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Call</TableHead><TableHead>Deal</TableHead><TableHead>Due since</TableHead><TableHead className="pr-4" /></TableRow></TableHeader>
          <TableBody>
            {queue.due.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <span className="flex items-center gap-2">
                    <PersonAvatar email={row.repEmail} size="sm" />
                    <button type="button" className="grid text-left" onClick={() => onOpenCall(row.id)}>
                      <span className="font-medium hover:underline">{row.title}</span>
                      <span className="text-xs text-muted-foreground">{shortDate(row.occurredAt)}</span>
                    </button>
                  </span>
                </TableCell>
                <TableCell className="text-sm">{row.dealName ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {shortDate(row.dueAt)} <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{row.daysOverdue === 0 ? "today" : `${row.daysOverdue}d overdue`}</span>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ rows: [row], all: false })}><Trash2 /> Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="flex items-center gap-2 px-4 py-6 text-sm"><CheckCircle2 className="size-4 text-chart-3" aria-hidden="true" /> No call is past its retention date.</p>
      )}
      {queue.upcoming.length ? (
        <div className="grid gap-1 border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Due in the next 14 days</p>
          {queue.upcoming.map((row) => <p key={row.id} className="text-sm">{shortDate(row.dueAt)} · {row.title} <span className="text-muted-foreground">· {row.dealName ?? "—"}</span></p>)}
        </div>
      ) : null}
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {confirm?.rows.length} call{confirm?.rows.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              {confirm?.all ? "Every call past the retention period" : `“${confirm?.rows[0]?.title}”`} and its transcript, comments, scorecards, clips and coaching assignments will be deleted. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void apply()}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
