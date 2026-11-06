"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Plus, Send, Trash2, Webhook } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SIGNATURE_HEADER, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/revenue/webhook-events";
import type { listWebhooks } from "@/lib/revenue/webhook-data";

import { api } from "./client";
import styles from "./revenue.module.css";

type Listing = Awaited<ReturnType<typeof listWebhooks>>;

export function WebhooksPanel({ tenantId }: { tenantId: string }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; status?: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const base = `/api/revenue/tenants/${tenantId}/webhooks`;
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<Listing>(base)
      .then((result) => {
        if (!cancelled) {
          setListing(result);
          setLoadError(null);
        }
      })
      .catch((err: Error & { status?: number }) => !cancelled && setLoadError({ message: err.message, status: err.status }));
    return () => {
      cancelled = true;
    };
  }, [base, version]);

  async function run(label: string, action: () => Promise<void>) {
    setPending(label);
    setError(null);
    setNotice(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await run("create", async () => {
      const result = await api<{ secret: string }>(base, { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(result.secret);
      setCopied(false);
      setUrl("");
    });
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loadError) {
    return (
      <Alert variant={loadError.status === 403 ? "default" : "destructive"}>
        <AlertTitle>{loadError.status === 403 ? "Owners and admins manage webhooks" : "Webhooks unavailable"}</AlertTitle>
        <AlertDescription>{loadError.message}</AlertDescription>
      </Alert>
    );
  }
  if (!listing) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="grid gap-4">
      <div className={`${styles.panel} grid gap-3 p-4`}>
        <p className={styles.eyebrow}><Webhook className="inline size-3" /> Signed webhooks</p>
        <p className="text-sm text-[#5f5c56]">
          Revenue POSTs JSON to public HTTPS endpoints. Each request carries <code className={styles.mono}>{SIGNATURE_HEADER}: t=…,v1=…</code> —
          an HMAC-SHA256 of <code className={styles.mono}>{"<t>.<raw body>"}</code> with your signing secret. Reject requests older than five minutes.
          Payloads carry analysis numbers and deal fields, never transcript text.
        </p>
        <form className="grid gap-3" onSubmit={create}>
          <div className="grid gap-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input id="webhook-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/revenue" maxLength={500} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Events</legend>
            {WEBHOOK_EVENTS.map((name) => (
              <label key={name} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={events.includes(name)}
                  onCheckedChange={(checked) => setEvents((current) => (checked ? [...new Set([...current, name])] : current.filter((entry) => entry !== name)))}
                  aria-label={name}
                />
                <span><code className={styles.mono}>{name}</code> — {WEBHOOK_EVENT_LABELS[name]}</span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
          {notice ? <p className="text-sm text-[#027a48]">{notice}</p> : null}
          <Button type="submit" className="w-fit" disabled={pending === "create" || !url.trim() || !events.length}><Plus /> Add webhook</Button>
        </form>
      </div>

      {listing.webhooks.length ? (
        <div className="grid gap-2">
          {listing.webhooks.map((hook) => (
            <div key={hook.id} className={`${styles.panel} flex flex-wrap items-center justify-between gap-3 p-4`}>
              <div className="grid min-w-0 gap-1">
                <strong className="break-all text-sm">{hook.url}</strong>
                <span className="flex flex-wrap gap-1">{hook.events.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}</span>
                <span className="text-xs text-[#5f5c56]">Secret {hook.secretHint} · added by {hook.createdBy}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={hook.active} disabled={pending === hook.id} onCheckedChange={(active) => void run(hook.id, () => api(`${base}/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active }) }))} aria-label={`${hook.active ? "Disable" : "Enable"} ${hook.url}`} />
                  {hook.active ? "Active" : "Paused"}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === `test-${hook.id}`}
                  onClick={() => void run(`test-${hook.id}`, async () => {
                    const { delivery } = await api<{ delivery: { status: string; error: string | null; httpStatus: number | null } }>(`${base}/${hook.id}/test`, { method: "POST" });
                    setNotice(delivery.status === "delivered" ? `Test delivered (HTTP ${delivery.httpStatus}).` : `Test failed: ${delivery.error}`);
                  })}
                >
                  <Send /> Send test
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${hook.url}`} onClick={() => setRemoving({ id: hook.id, url: hook.url })}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#5f5c56]">No webhooks yet.</p>
      )}

      <div className={`${styles.panel} overflow-x-auto`}>
        <p className={`${styles.eyebrow} px-4 pt-4`}>Delivery log (latest 50)</p>
        {listing.deliveries.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Endpoint</TableHead><TableHead>Result</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
            <TableBody>
              {listing.deliveries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">{new Date(entry.attemptedAt).toLocaleString()}</TableCell>
                  <TableCell><code className={`${styles.mono} text-xs`}>{entry.event}</code></TableCell>
                  <TableCell className="max-w-48 truncate text-xs">{entry.url}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={entry.status === "delivered" ? "default" : "destructive"}>{entry.status === "delivered" ? `Delivered ${entry.httpStatus}` : "Failed"}</Badge>
                    {entry.error ? <div className="mt-1 max-w-64 whitespace-normal text-[#b42318]">{entry.error}</div> : null}
                  </TableCell>
                  <TableCell className={`${styles.mono} text-xs`}>{entry.durationMs} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-4 pb-4 text-sm text-[#5f5c56]">Nothing sent yet. Deliveries are attempted once, with a 5 second timeout, and every attempt is logged here.</p>
        )}
      </div>

      <Dialog open={Boolean(secret)} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your signing secret now</DialogTitle>
            <DialogDescription>This is the only time it is shown. Revenue keeps it to sign deliveries but never displays or exports it again.</DialogDescription>
          </DialogHeader>
          <code className={`${styles.mono} break-all border border-[#171715] bg-white p-3 text-sm`}>{secret}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copySecret()}><Copy /> {copied ? "Copied" : "Copy"}</Button>
            <Button onClick={() => setSecret(null)}>I saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this webhook?</DialogTitle>
            <DialogDescription className="break-all">{removing?.url} stops receiving events immediately. The delivery log is kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pending === "delete"}
              onClick={() => void run("delete", async () => {
                if (removing) await api(`${base}/${removing.id}`, { method: "DELETE" });
                setRemoving(null);
              })}
            >
              Delete webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
