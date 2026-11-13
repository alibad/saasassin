"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleAlert, FileUp, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";

import { ProviderIcon } from "@/components/account/provider-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SPLIT_KIND_LABELS, SPLIT_KINDS, splitNeedsValue, type SplitKind } from "@/lib/mail/workflow";

import { api, tenantPath, type AuditEvent, type Mailbox, type SplitRule, type Template } from "./mail-api";
import { ActorAvatar, actorName, usePeople } from "./mail-people";

function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>That did not work</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

/* ---------- splits ---------- */

export function SplitsPanel({ tenantId, splits, readOnly, onChange }: { tenantId: string; splits: SplitRule[]; readOnly: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SplitKind>("from-domain");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api(tenantPath(tenantId, "/splits"), { method: "POST", json: { name, kind, value: splitNeedsValue(kind) ? value : "" } });
      setName("");
      setValue("");
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the split.");
    }
    setPending(false);
  }

  async function remove(split: SplitRule) {
    setError("");
    try {
      await api(tenantPath(tenantId, `/splits/${split.id}`), { method: "DELETE" });
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the split.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split inbox rules</CardTitle>
        <CardDescription>A thread goes to the first split it matches, in order. Everything else stays in Primary.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {splits.map((split, index) => (
            <li key={split.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{index + 1}. {split.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {SPLIT_KIND_LABELS[split.kind]}{split.value ? `: ${split.value}` : ""}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Delete split ${split.name}`} disabled={readOnly} onClick={() => void remove(split)}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {splits.length === 0 ? <li className="text-sm text-muted-foreground">No splits — every thread is in Primary.</li> : null}
        </ul>
        {readOnly ? null : (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={add}>
            <div className="grid gap-1.5">
              <Label htmlFor="split-name">Name</Label>
              <Input id="split-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={30} placeholder="Team" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="split-kind">Rule</Label>
              <Select value={kind} onValueChange={(next) => setKind(next as SplitKind)}>
                <SelectTrigger id="split-kind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPLIT_KINDS.map((option) => <SelectItem key={option} value={option}>{SPLIT_KIND_LABELS[option]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="split-value">Value</Label>
              <Input
                id="split-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={!splitNeedsValue(kind)}
                placeholder={kind === "from-domain" ? "acme.com" : kind === "from-address" ? "ceo@acme.com" : kind === "label" ? "Clients" : kind === "subject-contains" ? "invoice" : "No value needed"}
              />
            </div>
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Add split</Button>
          </form>
        )}
        <ErrorAlert message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------- snippets ---------- */

export function SnippetsPanel({ tenantId, templates, readOnly, onChange }: { tenantId: string; templates: Template[]; readOnly: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(tenantPath(tenantId, "/templates"), { method: "POST", json: { name, body } });
      setName("");
      setBody("");
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the snippet.");
    }
  }

  async function remove(template: Template) {
    try {
      await api(tenantPath(tenantId, `/templates/${template.id}`), { method: "DELETE" });
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the snippet.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Snippets</CardTitle>
        <CardDescription>Reusable text you can insert into any reply or new message.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {templates.map((template) => (
            <li key={template.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{template.name}</p>
                <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Delete snippet ${template.name}`} disabled={readOnly} onClick={() => void remove(template)}><Trash2 /></Button>
            </li>
          ))}
          {templates.length === 0 ? <li className="text-sm text-muted-foreground">No snippets yet.</li> : null}
        </ul>
        {readOnly ? null : (
          <form className="grid gap-3" onSubmit={add}>
            <div className="grid gap-1.5">
              <Label htmlFor="snippet-name">Name</Label>
              <Input id="snippet-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Intro call" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="snippet-body">Text</Label>
              <Textarea id="snippet-body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
            </div>
            <Button type="submit" className="justify-self-start"><Plus /> Save snippet</Button>
          </form>
        )}
        <ErrorAlert message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------- accounts + import history ---------- */

const PROVIDER_ICON: Record<string, "google" | "microsoft"> = { gmail: "google", microsoft: "microsoft" };

export function ConnectionsPanel({ mailbox, onImport, readOnly }: { mailbox: Mailbox; onImport: () => void; readOnly: boolean }) {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Email accounts</CardTitle>
          <CardDescription>Connect an account to sync new mail and send from Mail.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {mailbox.providers.map((provider) => (
            <div key={provider.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary"><ProviderIcon provider={PROVIDER_ICON[provider.id] ?? "google"} className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{provider.name}</p>
                <p className="text-xs text-muted-foreground">Not connected yet. Syncing and sending aren&apos;t available on this server, so import your mail instead.</p>
              </div>
              <Badge variant="outline">Not connected</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Imports</CardTitle>
          <CardDescription>Mail you brought in from .eml files or .mbox exports. Importing the same mail twice never duplicates it.</CardDescription>
          {readOnly ? null : <CardAction><Button size="sm" onClick={onImport}><FileUp /> Import mail</Button></CardAction>}
        </CardHeader>
        <CardContent>
          {mailbox.imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>File</TableHead><TableHead className="text-right">Imported</TableHead><TableHead className="text-right">Already here</TableHead><TableHead className="text-right">Unreadable</TableHead><TableHead>When</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {mailbox.imports.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="max-w-56 truncate font-medium">{run.fileName}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.imported}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.duplicates}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.failed}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(run.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- activity ---------- */

const ACTIONS: Record<string, string> = {
  "mail.imported": "imported mail",
  "thread.archive": "marked a conversation done",
  "thread.restore": "moved a conversation back to the inbox",
  "thread.trash": "moved a conversation to Trash",
  "thread.star": "starred a conversation",
  "thread.read": "changed read status",
  "thread.snooze": "snoozed a conversation",
  "thread.remind": "set a follow-up",
  "thread.clear-reminder": "cleared a follow-up",
  "thread.label": "labelled a conversation",
  "thread.mute": "muted a conversation",
  "thread.bulk_archive": "marked several conversations done",
  "thread.bulk_restore": "moved several conversations back",
  "thread.bulk_trash": "moved several conversations to Trash",
  "thread.bulk_star": "starred several conversations",
  "thread.bulk_read": "changed read status on several conversations",
  "thread.bulk_label": "labelled several conversations",
  "thread.bulk_undone": "undid a bulk change",
  "draft.created": "started a draft",
  "draft.updated": "edited a draft",
  "draft.discarded": "discarded a draft",
  "draft.scheduled": "scheduled a draft",
  "draft.schedule_cancelled": "cancelled a scheduled send",
  "draft.send_blocked": "tried to send (no account connected)",
  "split.created": "added a split",
  "split.deleted": "removed a split",
  "split.defaults_seeded": "set up the default splits",
  "template.created": "saved a snippet",
  "template.deleted": "deleted a snippet",
  "filter.created": "created a filter",
  "filter.deleted": "deleted a filter",
  "filter.enabled": "turned a filter on",
  "filter.disabled": "turned a filter off",
  "filter.retro_applied": "applied a filter to existing mail",
  "contact.renamed": "renamed a contact",
  "contact.name_cleared": "reset a contact's name",
  "search.reindexed": "sped up search",
  "workspace.exported": "exported the mailbox",
  "tenant.created": "created the mailbox",
  "invitation.created": "invited someone",
  "invitation.resent": "sent a new invitation link",
  "invitation.revoked": "revoked an invitation",
  "invitation.accepted": "joined the mailbox",
  "membership.granted": "added someone to the team",
  "membership.role_changed": "changed someone's role",
  "membership.removed": "removed someone from the team",
  "membership.left": "left the mailbox",
  "ownership.transferred": "transferred ownership",
};

function describeAction(event: AuditEvent) {
  const base = ACTIONS[event.action] ?? event.action.replace(/[._-]/g, " ");
  const count = typeof event.details?.count === "number" ? event.details.count : null;
  const imported = typeof event.details?.imported === "number" ? event.details.imported : null;
  if (event.action === "mail.imported" && imported !== null) return `imported ${imported} message${imported === 1 ? "" : "s"}`;
  if (count !== null && event.action.startsWith("thread.bulk_")) return `${base} (${count})`;
  return base;
}

export function AuditPanel({ tenantId }: { tenantId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  const people = usePeople();

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<{ events: AuditEvent[] }>(tenantPath(tenantId, "/audit"));
      setEvents(data.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the activity.");
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    api<{ events: AuditEvent[] }>(tenantPath(tenantId, "/audit"))
      .then((data) => !cancelled && setEvents(data.events))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Who did what in this mailbox. This record can&apos;t be edited.</CardDescription>
        <CardAction><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Refresh</Button></CardAction>
      </CardHeader>
      <CardContent>
        {events === null && !error ? <div className="grid gap-3">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-9 w-full" />)}</div> : null}
        {events && events.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has happened here yet.</p> : null}
        {events && events.length ? (
          <ol className="grid">
            {events.map((event, index) => (
              <li key={event.id} className={`flex items-start gap-3 py-2.5 ${index > 0 ? "border-t border-border" : ""}`}>
                <ActorAvatar actor={event.actor} size="sm" className="mt-0.5" />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{actorName(event.actor, people).split(/\s+/)[0]}</span> {describeAction(event)}
                </p>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt ?? undefined}>{formatDate(event.occurredAt)}</time>
              </li>
            ))}
          </ol>
        ) : null}
        <ErrorAlert message={error} />
      </CardContent>
    </Card>
  );
}
