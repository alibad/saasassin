"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Send, Webhook } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import type { WebhookSummary } from "@/lib/feedback/data";
import { SIGNATURE_HEADER, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/feedback/webhook-events";

import { SettingsSection } from "./settings-section";
import { apiJson, formatDateTime } from "./shared";

type Delivery = { id: string; webhookId: string; url: string; event: string; status: "delivered" | "failed"; httpStatus: number | null; error?: string; durationMs: number; attemptedAt: string | null };
type WebhookData = { webhooks: WebhookSummary[]; deliveries: Delivery[] };

const EVENT_LABELS: Record<WebhookEvent, string> = { "post.created": "A post is created", "status.changed": "A status changes" };

/** Signed outbound webhooks with a test send and an honest delivery log. */
export function WebhooksPanel({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const base = `/api/feedback/tenants/${tenantId}/webhooks`;
  const [data, setData] = useState<WebhookData | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await apiJson<WebhookData>(base));
  }, [base]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    apiJson<WebhookData>(base)
      .then((result) => { if (active) setData(result); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [base, isAdmin]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { webhook } = await apiJson<{ webhook: { id: string; secret: string } }>(base, { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(webhook.secret);
      setUrl("");
    });
  }

  return (
    <SettingsSection
      title="Webhooks"
      description={<>Send new posts and status changes to your own tools. Each request is signed with <code className="rounded bg-muted px-1 py-0.5 text-xs">{SIGNATURE_HEADER}</code> (HMAC-SHA256), only a 2xx response counts as delivered, and failed deliveries are not retried yet.</>}
    >
      {!isAdmin ? <p className="text-sm text-muted-foreground">Owners and admins manage webhooks.</p> : (
        <div className="grid gap-5">
          <form className="grid gap-3 rounded-xl bg-brand-subtle p-4" onSubmit={create}>
            <div className="grid gap-1.5">
              <Label htmlFor="fb-webhook-url">Endpoint URL</Label>
              <Input id="fb-webhook-url" type="url" className="bg-card" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.yourcompany.com/feedback" />
            </div>
            <div className="flex flex-wrap gap-4">
              {WEBHOOK_EVENTS.map((entry) => (
                <label key={entry} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={events.includes(entry)} onCheckedChange={(checked) => setEvents((current) => (checked ? [...current, entry] : current.filter((value) => value !== entry)))} />
                  {EVENT_LABELS[entry]}
                </label>
              ))}
            </div>
            <Button type="submit" className="w-fit" disabled={busy || !url.startsWith("https://") || events.length === 0}>{busy ? <LoaderCircle className="animate-spin" /> : <Webhook />} Add webhook</Button>
          </form>
          {secret ? (
            <div className="grid gap-1 rounded-lg border border-brand-accent/60 bg-accent p-3 text-sm text-accent-foreground" role="status">
              <span className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Copy your signing secret now. It won&apos;t be shown again.</span>
              <code className="break-all text-xs">{secret}</code>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {data === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading webhooks…</p> : (
            <>
              {data.webhooks.length === 0 ? <p className="text-sm text-muted-foreground">No webhooks yet. Add one to post new ideas into Slack, your tracker or your data warehouse.</p> : (
                <ul className="grid divide-y divide-border rounded-xl border border-border">
                  {data.webhooks.map((hook) => (
                    <li key={hook.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{hook.url}</span>
                        <span className="block text-xs text-muted-foreground">{hook.events.map((entry) => EVENT_LABELS[entry]).join(" · ")} · secret {hook.secretHint}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch checked={hook.active} disabled={busy} onCheckedChange={(checked) => void run(() => apiJson(`${base}/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active: checked }) }).then(() => undefined))} />
                          {hook.active ? "Active" : "Paused"}
                        </label>
                        <Button size="sm" variant="outline" disabled={busy || !hook.active} onClick={() => void run(async () => {
                          const { result } = await apiJson<{ result: { status: string; httpStatus: number | null; error?: string } }>(`${base}/${hook.id}`, { method: "POST" });
                          toast(result.status === "delivered"
                            ? { title: "Test delivered", description: `Your endpoint answered HTTP ${result.httpStatus}.` }
                            : { title: "Test failed", description: result.error ?? "No response.", variant: "destructive" });
                        })}><Send /> Send test</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2">
                <h3 className="text-sm font-bold">Recent deliveries</h3>
                {data.deliveries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <Table>
                      <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Result</TableHead><TableHead>Endpoint</TableHead><TableHead className="text-right">Time</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.deliveries.map((delivery) => (
                          <TableRow key={delivery.id}>
                            <TableCell className="whitespace-nowrap text-xs">{formatDateTime(delivery.attemptedAt)}</TableCell>
                            <TableCell className="text-xs">{delivery.event}</TableCell>
                            <TableCell>
                              {delivery.status === "delivered"
                                ? <Badge variant="secondary">Delivered · {delivery.httpStatus}</Badge>
                                : <Badge variant="destructive">Failed{delivery.httpStatus ? ` · ${delivery.httpStatus}` : ""}</Badge>}
                              {delivery.error ? <span className="ml-2 text-xs text-muted-foreground">{delivery.error}</span> : null}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-xs">{delivery.url}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{delivery.durationMs} ms</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
