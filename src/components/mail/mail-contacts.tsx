"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CircleAlert, LoaderCircle, Save, Search, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contactLabel, searchContacts, type Contact } from "@/lib/mail/contacts";

import { api, tenantPath, type ThreadRecord } from "./mail-api";
import { AddressAvatar } from "./mail-people";

type ContactSummary = Omit<Contact, "threadIds">;

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export function ContactsPanel({ tenantId, readOnly, onOpenThread }: { tenantId: string; readOnly: boolean; onOpenThread: (thread: ThreadRecord) => void }) {
  const [data, setData] = useState<{ contacts: ContactSummary[]; frequent: string[] } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<{ contacts: ContactSummary[]; frequent: string[] }>(tenantPath(tenantId, "/contacts")));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load contacts.");
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    api<{ contacts: ContactSummary[]; frequent: string[] }>(tenantPath(tenantId, "/contacts"))
      .then((result) => !cancelled && setData(result))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const byId = useMemo(() => new Map((data?.contacts ?? []).map((contact) => [contact.id, contact])), [data]);
  const visible = useMemo(() => searchContacts((data?.contacts ?? []) as Contact[], query), [data, query]);

  if (error && !data) {
    return (
      <Alert variant="destructive"><CircleAlert /><AlertTitle>Contacts could not be loaded</AlertTitle><AlertDescription>{error} <Button variant="link" className="h-auto p-0" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>
    );
  }
  if (!data) return <div className="grid gap-2">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;

  if (openId) {
    return <ContactPage tenantId={tenantId} contactId={openId} readOnly={readOnly} onBack={() => setOpenId(null)} onOpenThread={onOpenThread} onRenamed={() => void load()} />;
  }

  const frequent = data.frequent.map((id) => byId.get(id)).filter((contact): contact is ContactSummary => Boolean(contact));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Address book</CardTitle>
        <CardDescription>Busiest first. Renaming someone changes how they appear here; their messages keep the name they sent.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.contacts.length === 0 ? (
          <div className="grid justify-items-center gap-2 py-8 text-center text-muted-foreground">
            <Users aria-hidden="true" />
            <p>No contacts yet. Import mail and everyone you correspond with appears here.</p>
          </div>
        ) : (
          <>
            {frequent.length ? (
              <section aria-label="Frequent correspondents" className="grid gap-2">
                <h3 className="text-sm font-medium">Frequent correspondents</h3>
                <div className="flex flex-wrap gap-2">
                  {frequent.map((contact) => (
                    <Button key={contact.id} size="sm" variant="outline" className="pl-1" onClick={() => setOpenId(contact.id)}>
                      <AddressAvatar address={{ name: contactLabel(contact), email: contact.email }} size="xs" /> {contactLabel(contact)} <Badge variant="secondary">{contact.messageCount}</Badge>
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="flex items-center gap-2">
              <Search aria-hidden="true" className="size-4 text-muted-foreground" />
              <Input aria-label="Filter contacts" placeholder="Filter by name or address" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" />
              <span className="text-sm text-muted-foreground">{visible.length} of {data.contacts.length}</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Address</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Last contacted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="max-w-[16rem]">
                        <div className="flex items-center gap-2.5">
                          <AddressAvatar address={{ name: contactLabel(contact), email: contact.email }} size="md" />
                          <div className="min-w-0">
                            <button type="button" className="block max-w-full truncate text-left font-medium underline-offset-2 hover:underline" onClick={() => setOpenId(contact.id)}>
                              {contactLabel(contact)}
                            </button>
                            <span className="block truncate text-xs text-muted-foreground sm:hidden">{contact.email}</span>
                          </div>
                          {contact.isYou ? <Badge variant="outline">You</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[16rem] truncate sm:table-cell">{contact.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{contact.messageCount}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{day(contact.lastContactedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {visible.length === 0 ? <p className="text-sm text-muted-foreground">No contact matches “{query}”.</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ContactPage({
  tenantId,
  contactId,
  readOnly,
  onBack,
  onOpenThread,
  onRenamed,
}: {
  tenantId: string;
  contactId: string;
  readOnly: boolean;
  onBack: () => void;
  onOpenThread: (thread: ThreadRecord) => void;
  onRenamed: () => void;
}) {
  const [data, setData] = useState<{ contact: Contact; threads: ThreadRecord[] } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ contact: Contact; threads: ThreadRecord[] }>(tenantPath(tenantId, `/contacts/${contactId}`))
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setName(result.contact.displayName ?? "");
      })
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId, contactId]);

  async function rename(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const { contact } = await api<{ contact: Contact }>(tenantPath(tenantId, `/contacts/${contactId}`), { method: "PATCH", json: { displayName: name } });
      setData((current) => (current ? { ...current, contact: { ...current.contact, displayName: contact.displayName } } : current));
      setSaved(contact.displayName ? "Name saved." : "Name reset to the one in message headers.");
      onRenamed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the name.");
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={onBack}><ArrowLeft /> All contacts</Button>
        {data ? (
          <div className="flex items-center gap-3">
            <AddressAvatar address={{ name: contactLabel(data.contact), email: data.contact.email }} size="xl" />
            <div className="grid min-w-0 gap-1">
              <CardTitle className="break-words text-lg">{contactLabel(data.contact)}</CardTitle>
              <CardDescription className="break-all">{data.contact.email}{data.contact.isYou ? " · you" : ""}</CardDescription>
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>That did not work</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {!data && !error ? <Skeleton className="h-40 w-full" /> : null}
        {data ? (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Sent you</dt><dd className="text-lg font-semibold tabular-nums">{data.contact.sent}</dd></div>
              <div><dt className="text-muted-foreground">Received</dt><dd className="text-lg font-semibold tabular-nums">{data.contact.received}</dd></div>
              <div><dt className="text-muted-foreground">First seen</dt><dd>{day(data.contact.firstSeenAt)}</dd></div>
              <div><dt className="text-muted-foreground">Last contacted</dt><dd>{day(data.contact.lastContactedAt)}</dd></div>
            </dl>
            {readOnly ? null : (
              <form className="grid gap-2 sm:max-w-md" onSubmit={rename}>
                <Label htmlFor="contact-name">Display name</Label>
                <div className="flex gap-2">
                  <Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={data.contact.name || data.contact.email} />
                  <Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />} Save</Button>
                </div>
                <p className="text-xs text-muted-foreground">{saved || `Leave empty to use “${data.contact.name || data.contact.email}” from message headers.`}</p>
              </form>
            )}
            <section className="grid gap-2" aria-label="Shared threads">
              <h3 className="text-sm font-medium">{data.threads.length} shared thread{data.threads.length === 1 ? "" : "s"}</h3>
              <ul className="grid gap-1">
                {data.threads.map((thread) => (
                  <li key={thread.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-muted" onClick={() => onOpenThread(thread)}>
                      <span className="min-w-0 truncate"><strong>{thread.subject || "(no subject)"}</strong> <span className="text-muted-foreground">— {thread.snippet}</span></span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {thread.state !== "inbox" ? <Badge variant="outline">{thread.state === "archived" ? "Done" : "Trash"}</Badge> : null}
                        {day(thread.lastMessageAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
