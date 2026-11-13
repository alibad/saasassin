"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, LoaderCircle, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WebhookDelivery, WebhookSummary } from "@/lib/studies/data";
import { SIGNATURE_HEADER, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/studies/webhook-events";

import { panel } from "./results-view";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

/** Owners and admins: signed endpoints for response.completed / study.closed, with an honest delivery log. */
export function WebhooksPanel({ tenantId, privileged }: { tenantId: string; privileged: boolean }) {
  const base = `/api/studies/tenants/${tenantId}/webhooks`;
  const [hooks, setHooks] = useState<WebhookSummary[] | null>(null);
  const [log, setLog] = useState<WebhookDelivery[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>(["response.completed"]);
  const [secret, setSecret] = useState("");
  const [removing, setRemoving] = useState<WebhookSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const payload = await api<{ webhooks: WebhookSummary[]; deliveries: WebhookDelivery[] }>(base);
    setHooks(payload.webhooks);
    setLog(payload.deliveries);
  }, [base]);

  useEffect(() => {
    if (!privileged) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the endpoint list
    load().catch((caught: Error) => {
      setHooks([]);
      setError(caught.message);
    });
  }, [load, privileged]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const url = String(new FormData(form).get("url") ?? "");
    await run("create", async () => {
      const payload = await api<{ secret: string }>(base, { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(payload.secret);
      form.reset();
      await load();
    });
  }

  if (!privileged) return <p className="text-sm text-muted-foreground">Only owners and admins can manage webhooks.</p>;

  return (
    <div className="grid gap-4">
      <div className={`${panel} grid gap-3 p-4`}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Webhook className="size-4" aria-hidden="true" /> Signed webhooks
        </h2>
        <p className="text-sm text-muted-foreground">
          Studies POSTs JSON to your HTTPS endpoint, signed with <code>{SIGNATURE_HEADER}: t=…,v1=…</code> (HMAC-SHA256 of <code>t.body</code>{" "}
          with your secret). Verify the signature and reject timestamps older than five minutes. Redirects are not followed.
        </p>
        <form onSubmit={create} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input id="webhook-url" name="url" type="url" required placeholder="https://example.com/hooks/studies" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events.includes(event)}
                  onCheckedChange={(checked) => setEvents(checked ? [...events, event] : events.filter((value) => value !== event))}
                />
                <code>{event}</code> — {WEBHOOK_EVENT_LABELS[event]}
              </label>
            ))}
          </fieldset>
          <Button type="submit" className="justify-self-start" disabled={busy === "create" || events.length === 0}>
            <Plus className="size-4" aria-hidden="true" /> Add endpoint
          </Button>
        </form>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {hooks === null ? (
        <p className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading webhooks…
        </p>
      ) : hooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No endpoints yet.</p>
      ) : (
        <ul className="grid gap-2">
          {hooks.map((hook) => (
            <li key={hook.id} className={`${panel} grid gap-2 p-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="min-w-0 break-all text-sm">{hook.url}</code>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={hook.active}
                      disabled={busy === hook.id}
                      onCheckedChange={(active) =>
                        run(hook.id, async () => {
                          await api(`${base}/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
                          await load();
                        })
                      }
                    />
                    Active
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === hook.id}
                    onClick={() =>
                      run(hook.id, async () => {
                        const { delivery } = await api<{ delivery: { status: string; httpStatus: number | null; error: string | null } }>(`${base}/${hook.id}`, { method: "POST" });
                        setNotice(delivery.status === "delivered" ? `Test delivered (HTTP ${delivery.httpStatus}).` : `Test failed: ${delivery.error}`);
                        await load();
                      })
                    }
                  >
                    <Send className="size-4" aria-hidden="true" /> Send test
                  </Button>
                  <Button size="icon" variant="outline" aria-label={`Delete ${hook.url}`} onClick={() => setRemoving(hook)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {hook.events.map((event) => (
                  <Badge key={event} variant="outline">
                    {event}
                  </Badge>
                ))}
                <span className="text-muted-foreground">secret {hook.secretHint}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={`${panel} grid gap-2 p-3`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Recent deliveries</h3>
          <Button size="sm" variant="outline" onClick={() => run("log", load)}>
            <RefreshCw className="size-4" aria-hidden="true" /> Refresh
          </Button>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="whitespace-nowrap text-xs">{delivery.attemptedAt ? new Date(delivery.attemptedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>
                      <code className="text-xs">{delivery.event}</code>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge className={`${delivery.status === "delivered" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
                        {delivery.status}
                      </Badge>{" "}
                      {delivery.httpStatus ? `HTTP ${delivery.httpStatus}` : ""} {delivery.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(secret)} onOpenChange={(open) => !open && setSecret("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your signing secret</DialogTitle>
            <DialogDescription>This is the only time the secret is shown. Store it with your receiver; Studies keeps only a hint.</DialogDescription>
          </DialogHeader>
          <code className="break-all rounded-lg border border-border bg-background p-2 text-sm">{secret}</code>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setNotice("Secret copied.");
                } catch {
                  /* the secret stays visible to copy by hand */
                }
              }}
            >
              <Copy className="size-4" aria-hidden="true" /> Copy
            </Button>
            <Button onClick={() => setSecret("")}>I stored it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this endpoint?</DialogTitle>
            <DialogDescription>{removing?.url} stops receiving events immediately. Its delivery history stays in the log and export.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                removing &&
                run(removing.id, async () => {
                  await api(`${base}/${removing.id}`, { method: "DELETE" });
                  setRemoving(null);
                  await load();
                })
              }
            >
              Delete endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
