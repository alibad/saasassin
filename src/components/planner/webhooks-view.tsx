"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Plus, Send, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlannerSnapshot } from "@/lib/planner/model";
import type { DeliveryRecord, WebhookSummary } from "@/lib/planner/webhook-delivery";
import { WEBHOOK_EVENTS } from "@/lib/planner/webhook-events";

import { apiJson, formatDateTime } from "./format";
import styles from "./planner.module.css";

const EVENT_HELP: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  "plan.applied": "Every new plan version (scheduler run, applied what-if, restore).",
  "task.at_risk": "Work that newly cannot finish on time, does not fit, or is blocked.",
};

export function WebhooksView({ snapshot, base }: { snapshot: PlannerSnapshot; base: string }) {
  const [data, setData] = useState<{ webhooks: WebhookSummary[]; deliveries: DeliveryRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WebhookSummary | null>(null);
  const tz = snapshot.settings.timeZone;

  const load = useCallback(async () => {
    try {
      setData(await apiJson(`${base}/webhooks`));
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    if (snapshot.canAdmin) void load();
  }, [load, snapshot.canAdmin]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot.canAdmin) return <p className={styles.muted}>Only owners and admins can manage webhooks.</p>;

  async function create(event: FormEvent) {
    event.preventDefault();
    setSecret(null);
    if (!url.trim().startsWith("https://")) return setError("Webhook endpoints must use https://.");
    if (events.length === 0) return setError("Pick at least one event.");
    await run(async () => {
      const created = await apiJson<{ id: string; secret: string }>(`${base}/webhooks`, { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(created.secret);
      setUrl("");
    });
  }

  return (
    <div className="grid gap-4">
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Outbound webhooks</CardTitle>
          <CardDescription>
            Planner POSTs JSON to your HTTPS endpoint, signed with <code>X-SaaSassin-Signature: t=…,v1=…</code> (HMAC-SHA256 of <code>t.body</code> with your secret). Private and internal hosts are refused.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={create}>
            <div className="grid gap-1"><Label htmlFor="wh-url">Endpoint URL</Label><Input id="wh-url" type="url" placeholder="https://example.com/hooks/planner" value={url} onChange={(event) => setUrl(event.target.value)} /></div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Events</legend>
              {WEBHOOK_EVENTS.map((name) => (
                <label key={name} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={events.includes(name)} onCheckedChange={(checked) => setEvents(checked ? [...events, name] : events.filter((entry) => entry !== name))} />
                  <span><code>{name}</code> — {EVENT_HELP[name]}</span>
                </label>
              ))}
            </fieldset>
            <div><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Add webhook</Button></div>
          </form>
          {secret && (
            <Alert className="mt-3">
              <KeyRound />
              <AlertTitle>Copy your signing secret now — it is shown only once</AlertTitle>
              <AlertDescription><p className={styles.secretBox}>{secret}</p></AlertDescription>
            </Alert>
          )}
          {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card className={styles.panel}>
        <CardHeader><CardTitle>Endpoints</CardTitle></CardHeader>
        <CardContent>
          {!data ? <Skeleton className="h-16 w-full" /> : data.webhooks.length === 0 ? <p className={styles.muted}>No webhooks yet.</p> : (
            <ul className={styles.simpleList}>
              {data.webhooks.map((hook) => (
                <li key={hook.id}>
                  <span><strong className="break-all">{hook.url}</strong><small>{hook.events.join(", ")} · secret …{hook.secretHint} · added by {hook.createdBy}</small></span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => apiJson(`${base}/webhooks/${hook.id}/test`, { method: "POST" }))}><Send /> Test</Button>
                    <Button size="icon" variant="outline" aria-label={`Delete webhook ${hook.url}`} onClick={() => setConfirmDelete(hook)}><Trash2 /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className={styles.panel}>
        <CardHeader><CardTitle>Delivery log</CardTitle><CardDescription>Only a 2xx response counts as delivered. Redirects are not followed; there are no automatic retries.</CardDescription></CardHeader>
        <CardContent>
          {!data ? <Skeleton className="h-16 w-full" /> : data.deliveries.length === 0 ? <p className={styles.muted}>No deliveries yet.</p> : (
            <div className={styles.tableWrap}>
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Result</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>{formatDateTime(delivery.attemptedAt, tz)}</TableCell>
                      <TableCell><code>{delivery.event}</code></TableCell>
                      <TableCell><span className={`${styles.status} ${delivery.status === "delivered" ? styles.ok : styles.bad}`}>{delivery.status}</span></TableCell>
                      <TableCell className="whitespace-normal">{delivery.httpStatus ? `HTTP ${delivery.httpStatus} · ` : ""}{delivery.error ?? `${delivery.durationMs} ms`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this webhook?</DialogTitle>
            <DialogDescription className="break-all">{confirmDelete?.url} will stop receiving events. Its delivery history stays in the log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const hook = confirmDelete!;
                await run(() => apiJson(`${base}/webhooks/${hook.id}`, { method: "DELETE" }));
                setConfirmDelete(null);
              }}
            >
              Delete webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
