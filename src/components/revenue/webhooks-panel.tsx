"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, History, Plus, Send, Trash2, Webhook } from "lucide-react";

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
import { usePeople } from "./people";
import { ErrorText, Panel, PanelHeader, SuccessText } from "./ui";

type Listing = Awaited<ReturnType<typeof listWebhooks>>;

export function WebhooksPanel({ tenantId }: { tenantId: string }) {
  const people = usePeople();
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
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
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
        <AlertTitle>{loadError.status === 403 ? "Owners and admins manage webhooks" : "Webhooks aren't available right now"}</AlertTitle>
        <AlertDescription>{loadError.message}</AlertDescription>
      </Alert>
    );
  }
  if (!listing) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHeader title="Webhooks" icon={Webhook} description="Send call and deal events to your own systems as they happen." />
        <div className="grid gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            Revenue sends a signed JSON POST to your HTTPS endpoint. Verify the <code className="rounded bg-muted px-1 font-mono text-xs">{SIGNATURE_HEADER}</code> header: an HMAC-SHA256 of the timestamp and raw body with your signing secret, and reject anything older than five minutes. Payloads carry analysis numbers and deal fields, never transcript text.
          </p>
          <form className="grid gap-3" onSubmit={create}>
            <div className="grid gap-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input id="webhook-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/revenue" maxLength={500} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Events</legend>
              {WEBHOOK_EVENTS.map((name) => (
                <label key={name} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={events.includes(name)}
                    onCheckedChange={(checked) => setEvents((current) => (checked ? [...new Set([...current, name])] : current.filter((entry) => entry !== name)))}
                    aria-label={name}
                    className="mt-0.5"
                  />
                  <span><code className="font-mono text-xs">{name}</code> <span className="text-muted-foreground">· {WEBHOOK_EVENT_LABELS[name]}</span></span>
                </label>
              ))}
            </fieldset>
            <ErrorText>{error}</ErrorText>
            <SuccessText>{notice}</SuccessText>
            <Button type="submit" className="w-fit" disabled={pending === "create" || !url.trim() || !events.length}><Plus /> Add webhook</Button>
          </form>
        </div>
        {listing.webhooks.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {listing.webhooks.map((hook) => (
              <li key={hook.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="min-w-0 break-all text-sm">{hook.url}</strong>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={hook.active} disabled={pending === hook.id} onCheckedChange={(active) => void run(hook.id, () => api(`${base}/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active }) }))} aria-label={`${hook.active ? "Pause" : "Resume"} ${hook.url}`} />
                    {hook.active ? "On" : "Paused"}
                  </label>
                </div>
                <span className="flex flex-wrap gap-1">{hook.events.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}</span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Secret {hook.secretHint} · added by {people.name(hook.createdBy)}</span>
                  <span className="flex gap-1">
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
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${hook.url}`} onClick={() => setRemoving({ id: hook.id, url: hook.url })}><Trash2 /></Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Deliveries" icon={History} description="The latest 50 attempts. Each is sent once with a five-second timeout." />
        {listing.deliveries.length ? (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-4">When</TableHead><TableHead>Event</TableHead><TableHead>Result</TableHead><TableHead className="pr-4 text-right">Time</TableHead></TableRow></TableHeader>
            <TableBody>
              {listing.deliveries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">{new Date(entry.attemptedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TableCell>
                  <TableCell><code className="font-mono text-xs">{entry.event}</code><div className="max-w-48 truncate text-xs text-muted-foreground">{entry.url}</div></TableCell>
                  <TableCell className="text-xs">
                    <span className={entry.status === "delivered" ? "rounded-full bg-chart-3/15 px-2 py-0.5 font-medium" : "rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive"}>
                      {entry.status === "delivered" ? `Delivered · ${entry.httpStatus}` : "Failed"}
                    </span>
                    {entry.error ? <div className="mt-1 max-w-64 whitespace-normal text-destructive">{entry.error}</div> : null}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs tabular-nums">{entry.durationMs} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing sent yet. Add an endpoint and send a test to see it here.</p>
        )}
      </Panel>

      <Dialog open={Boolean(secret)} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your signing secret now</DialogTitle>
            <DialogDescription>This is the only time it&apos;s shown. Revenue keeps it to sign deliveries but never displays or exports it again.</DialogDescription>
          </DialogHeader>
          <code className="break-all rounded-md border border-border bg-muted p-3 font-mono text-sm">{secret}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copySecret()}><Copy /> {copied ? "Copied" : "Copy"}</Button>
            <Button onClick={() => setSecret(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this webhook?</DialogTitle>
            <DialogDescription className="break-all">{removing?.url} stops receiving events immediately. The delivery history is kept.</DialogDescription>
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
