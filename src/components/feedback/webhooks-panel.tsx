"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WebhookSummary } from "@/lib/feedback/data";
import { SIGNATURE_HEADER, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/feedback/webhook-events";

import styles from "./feedback.module.css";
import { apiJson, formatDateTime } from "./shared";

type Delivery = { id: string; webhookId: string; url: string; event: string; status: "delivered" | "failed"; httpStatus: number | null; error?: string; durationMs: number; attemptedAt: string | null };
type WebhookData = { webhooks: WebhookSummary[]; deliveries: Delivery[] };

export function WebhooksPanel({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const base = `/api/feedback/tenants/${tenantId}/webhooks`;
  const [data, setData] = useState<WebhookData | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
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
    <section className={styles.panel}>
      <h2 className="text-lg font-bold">Signed webhooks</h2>
      <p className={`${styles.muted} mt-1 text-sm`}>
        POSTs JSON for <code>post.created</code> and <code>status.changed</code> to your HTTPS endpoint, signed with{" "}
        <code>{SIGNATURE_HEADER}: t=&lt;unix&gt;,v1=&lt;hex HMAC-SHA256(secret, &quot;t.body&quot;)&gt;</code>. Every attempt is logged; only a 2xx response counts as delivered,
        redirects are not followed, and there are no automatic retries yet.
      </p>
      {!isAdmin ? <p className={`${styles.muted} mt-2 text-sm`}>Only owners and admins manage webhooks.</p> : (
        <div className={`${styles.stack} mt-3`}>
          <form className={styles.stack} onSubmit={create}>
            <div className="grid gap-1.5">
              <Label htmlFor="fb-webhook-url">Endpoint URL</Label>
              <Input id="fb-webhook-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/feedback" />
            </div>
            <div className={styles.row}>
              {WEBHOOK_EVENTS.map((entry) => (
                <label key={entry} className={`${styles.row} text-sm`}>
                  <Checkbox checked={events.includes(entry)} onCheckedChange={(checked) => setEvents((current) => (checked ? [...current, entry] : current.filter((value) => value !== entry)))} />
                  {entry}
                </label>
              ))}
            </div>
            <Button type="submit" className="w-fit" disabled={busy || !url.startsWith("https://") || events.length === 0}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Add webhook</Button>
          </form>
          {secret ? (
            <div className={styles.response} role="status">
              <strong>Signing secret (shown once):</strong> <code className="break-all">{secret}</code>
            </div>
          ) : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-700" role="status">{notice}</p> : null}
          {data === null ? <LoaderCircle className="size-4 animate-spin" /> : (
            <>
              {data.webhooks.length === 0 ? <p className={`${styles.muted} text-sm`}>No webhooks yet.</p> : null}
              {data.webhooks.map((hook) => (
                <div key={hook.id} className={styles.rowBetween}>
                  <span className="text-sm"><span className={styles.mono}>{hook.url}</span> · {hook.events.join(", ")} · secret {hook.secretHint}</span>
                  <span className={styles.row}>
                    <label className={`${styles.row} text-sm`}>
                      <Switch checked={hook.active} disabled={busy} onCheckedChange={(checked) => void run(() => apiJson(`${base}/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active: checked }) }).then(() => undefined))} />
                      {hook.active ? "Active" : "Paused"}
                    </label>
                    <Button size="sm" variant="outline" disabled={busy || !hook.active} onClick={() => void run(async () => {
                      const { result } = await apiJson<{ result: { status: string; httpStatus: number | null; error?: string } }>(`${base}/${hook.id}`, { method: "POST" });
                      setNotice(result.status === "delivered" ? `Test delivered (HTTP ${result.httpStatus}).` : `Test failed: ${result.error}`);
                    })}>Send test</Button>
                  </span>
                </div>
              ))}
              <h3 className="mt-2 font-bold">Delivery log</h3>
              {data.deliveries.length === 0 ? <p className={`${styles.muted} text-sm`}>No deliveries attempted yet.</p> : (
                <div className={styles.tableWrap}>
                  <Table>
                    <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Result</TableHead><TableHead>Endpoint</TableHead><TableHead className="text-right">ms</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.deliveries.map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(delivery.attemptedAt)}</TableCell>
                          <TableCell className={styles.mono}>{delivery.event}</TableCell>
                          <TableCell className={delivery.status === "delivered" ? "text-emerald-700" : styles.error}>
                            {delivery.status === "delivered" ? `Delivered (${delivery.httpStatus})` : `Failed${delivery.httpStatus ? ` (${delivery.httpStatus})` : ""}: ${delivery.error ?? ""}`}
                          </TableCell>
                          <TableCell className={`${styles.mono} max-w-[220px] truncate`}>{delivery.url}</TableCell>
                          <TableCell className="text-right font-mono">{delivery.durationMs}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
