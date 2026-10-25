"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle, Plug, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SPLIT_KIND_LABELS, SPLIT_KINDS, splitNeedsValue, type SplitKind } from "@/lib/mail/workflow";

import { api, tenantPath, type AuditEvent, type Mailbox, type Member, type SplitRule, type Template } from "./mail-api";

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
  return value ? new Date(value).toLocaleString() : "—";
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

/* ---------- providers + import history ---------- */

export function ConnectionsPanel({ mailbox }: { mailbox: Mailbox }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mail connections</CardTitle>
        <CardDescription>Live sync and sending need provider OAuth clients that have passed provider review. Until then, import mail from files.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {mailbox.providers.map((provider) => (
            <li key={provider.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><Plug className="size-4" /> {provider.name}</p>
                <p className="text-sm text-muted-foreground">{provider.requirement}</p>
              </div>
              <Badge variant="outline">{provider.name.split(" ")[0]} connection not configured</Badge>
            </li>
          ))}
        </ul>
        <div>
          <h3 className="mb-2 font-medium">Recent imports</h3>
          {mailbox.imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>File</TableHead><TableHead>Imported</TableHead><TableHead>Duplicates</TableHead><TableHead>Failed</TableHead><TableHead>When</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {mailbox.imports.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="max-w-48 truncate">{run.fileName}</TableCell>
                    <TableCell>{run.imported}</TableCell>
                    <TableCell>{run.duplicates}</TableCell>
                    <TableCell>{run.failed}</TableCell>
                    <TableCell>{formatDate(run.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- team ---------- */

export function TeamPanel({ tenantId, role }: { tenantId: string; role: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const privileged = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    try {
      const data = await api<{ members: Member[] }>(tenantPath(tenantId, "/members"));
      setMembers(data.members);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load members.");
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    api<{ members: Member[] }>(tenantPath(tenantId, "/members"))
      .then((data) => !cancelled && setMembers(data.members))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api(tenantPath(tenantId, "/members"), { method: "POST", json: { email, role: memberRole } });
      setNotice(`${email} now has ${memberRole} access.`);
      setEmail("");
      void load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that person.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>Members can import and triage; viewers can read; owners and admins manage access.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {members === null && !error ? <p className="text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading members…</p> : null}
        {members ? (
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.uid}>
                  <TableCell className="max-w-56 truncate">{member.email}</TableCell>
                  <TableCell>{member.name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{member.role}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {privileged ? (
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={invite}>
            <div className="grid gap-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@company.com" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="member-role">Role</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger id="member-role" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit"><UserPlus /> Add member</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Only owners and admins can add members.</p>
        )}
        {notice ? <p className="text-sm" role="status">{notice}</p> : null}
        <ErrorAlert message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------- audit ---------- */

export function AuditPanel({ tenantId }: { tenantId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<{ events: AuditEvent[] }>(tenantPath(tenantId, "/audit"));
      setEvents(data.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the audit log.");
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
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Every import, triage action, draft, split and access change in this workspace. Append-only.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Refresh</Button>
      </CardHeader>
      <CardContent>
        {events === null && !error ? <p className="text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading…</p> : null}
        {events && events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
        {events && events.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>By</TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(event.occurredAt)}</TableCell>
                    <TableCell><code className="text-xs">{event.action}</code></TableCell>
                    <TableCell className="max-w-48 truncate">{event.actor.email}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{event.target.type}/{event.target.id.slice(0, 12)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <ErrorAlert message={error} />
      </CardContent>
    </Card>
  );
}
