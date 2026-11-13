"use client";

import { useState, type FormEvent } from "react";
import { Link2, Plus, UserRound, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEAL_ROLE_LABELS, DEAL_ROLES, suggestSpeakerLinks, type SpeakerLink } from "@/lib/revenue/contacts";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { canWrite } from "@/lib/revenue/schemas";

import { api, type Workspace, type WorkspaceDeal } from "./client";
import { ContactAvatar, PersonAvatar, usePeople } from "./people";
import { ErrorText, Panel, PanelHeader } from "./ui";

const NONE = "__none__";

export function ContactDialog({ workspace, onCreated, accountId: fixedAccount }: { workspace: Workspace; onCreated: () => void; accountId?: string }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(fixedAccount ?? "");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/contacts`, { method: "POST", body: JSON.stringify({ accountId, name, title, email }) });
      setOpen(false);
      setName("");
      setTitle("");
      setEmail("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The contact wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size={fixedAccount ? "sm" : "default"} onClick={() => setOpen(true)}><UserRound /> Add contact</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
              <DialogDescription>Someone at the customer. Give them a role on each deal from the deal page.</DialogDescription>
            </DialogHeader>
            {!fixedAccount ? (
              <div className="grid gap-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                  <SelectContent>{workspace.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2"><Label htmlFor="contact-name">Name</Label><Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus /></div>
            <div className="grid gap-2"><Label htmlFor="contact-title">Job title (optional)</Label><Input id="contact-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VP Operations" maxLength={120} /></div>
            <div className="grid gap-2"><Label htmlFor="contact-email">Email (optional)</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} /></div>
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !accountId || name.trim().length < 2}><Plus /> Add contact</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** People on a deal: every contact on the deal's account, with their role in this deal and how much they've spoken. */
export function DealPeople({ workspace, deal, onChanged }: { workspace: Workspace; deal: WorkspaceDeal; onChanged: () => void }) {
  const writer = canWrite(workspace.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const contacts = workspace.contacts
    .filter((contact) => contact.accountId === deal.accountId)
    .sort((a, b) => Number(Boolean(b.dealRoles.find((entry) => entry.dealId === deal.id))) - Number(Boolean(a.dealRoles.find((entry) => entry.dealId === deal.id))));
  const roleOf = new Map(deal.contacts.map((entry) => [entry.contactId, entry.role]));

  async function setRole(contactId: string, value: string) {
    setPending(contactId);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/contacts/${contactId}/deal-role`, {
        method: "PUT",
        body: JSON.stringify({ dealId: deal.id, role: value === NONE ? null : value }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Buying committee"
        icon={Users}
        description={`${deal.contacts.length} of ${contacts.length} contact${contacts.length === 1 ? "" : "s"} on this deal`}
        actions={writer ? <ContactDialog workspace={workspace} accountId={deal.accountId} onCreated={onChanged} /> : null}
      />
      <ErrorText>{error}</ErrorText>
      {contacts.length ? (
        <ul className="divide-y divide-border">
          {contacts.map((contact) => {
            const heard = contact.engagement && contact.engagement.dealIds.includes(deal.id);
            return (
              <li key={contact.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <ContactAvatar id={contact.id} name={contact.name} size="lg" />
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium">{contact.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {contact.title || "No title"} · {heard ? `${formatTimestamp(contact.engagement!.talkSeconds)} on ${contact.engagement!.calls} call${contact.engagement!.calls === 1 ? "" : "s"}` : "not heard on calls yet"}
                    </span>
                  </span>
                </span>
                {writer ? (
                  <Select value={roleOf.get(contact.id) ?? NONE} onValueChange={(value) => void setRole(contact.id, value)} disabled={pending === contact.id}>
                    <SelectTrigger aria-label={`Role of ${contact.name}`} size="sm" className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not on deal</SelectItem>
                      {DEAL_ROLES.map((role) => <SelectItem key={role} value={role}>{DEAL_ROLE_LABELS[role]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{roleOf.get(contact.id) ? DEAL_ROLE_LABELS[roleOf.get(contact.id)!] : "Not on deal"}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">Add the champion, the economic buyer and anyone else involved. Multi-threaded deals close more often, and Revenue warns you when a deal hangs on one person.</p>
      )}
    </Panel>
  );
}

type LinkContact = { id: string; name: string; accountId: string; email: string; title: string };

/** Links each transcript speaker to a contact on the deal's account or to a teammate. */
export function SpeakerLinker({
  tenantId,
  callId,
  speakers,
  links,
  accountId,
  contacts,
  members,
  canEdit,
  onChanged,
}: {
  tenantId: string;
  callId: string;
  speakers: string[];
  links: SpeakerLink[];
  accountId: string | null;
  contacts: LinkContact[];
  members: Array<{ email: string; name: string }>;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const people = usePeople();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const accountContacts = contacts.filter((contact) => contact.accountId === accountId);
  const linkOf = new Map(links.map((link) => [link.speaker, link]));
  const suggestions = new Map(suggestSpeakerLinks(speakers, accountContacts, members, links).map((link) => [link.speaker, link]));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const valueOf = (link: SpeakerLink | undefined) => (!link ? NONE : link.kind === "contact" ? `contact:${link.contactId}` : `member:${link.email}`);

  async function save(speaker: string, value: string) {
    setPending(speaker);
    setError(null);
    const [kind, id] = value === NONE ? [null, null] : [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
    const link = kind === "contact" ? { kind, contactId: id } : kind === "member" ? { kind, email: id } : null;
    try {
      await api(`/api/revenue/tenants/${tenantId}/calls/${callId}/speakers`, { method: "PUT", body: JSON.stringify({ speaker, link }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Who's on the call" icon={Link2} description="Link each speaker to a contact or a teammate. It powers talk time per person and the single-threaded warning." />
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-border">
        {speakers.map((speaker) => {
          const link = linkOf.get(speaker);
          const suggestion = suggestions.get(speaker);
          const contact = link?.kind === "contact" ? contactById.get(link.contactId) : null;
          return (
            <li key={speaker} className="grid gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                {link?.kind === "member" ? (
                  <PersonAvatar email={link.email} size="md" />
                ) : contact ? (
                  <ContactAvatar id={contact.id} name={contact.name} size="md" />
                ) : (
                  <ContactAvatar id={`speaker:${speaker}`} name={speaker} size="md" className="opacity-70" />
                )}
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{speaker}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {!link ? "Not linked" : link.kind === "contact" ? `${contact?.title || "Contact"}` : `${people.teammate(link.email).title || "Your team"}`}
                  </span>
                </span>
              </div>
              {canEdit ? (
                <Select value={valueOf(link)} onValueChange={(value) => void save(speaker, value)} disabled={pending === speaker}>
                  <SelectTrigger aria-label={`Link ${speaker}`} size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked</SelectItem>
                    {accountContacts.map((entry) => <SelectItem key={entry.id} value={`contact:${entry.id}`}>{entry.name} · contact</SelectItem>)}
                    {members.map((member) => <SelectItem key={member.email} value={`member:${member.email}`}>{people.name(member.email)} · your team</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
              {canEdit && suggestion ? (
                <Button type="button" size="xs" variant="secondary" className="w-fit" onClick={() => void save(speaker, valueOf(suggestion))}>
                  Link to {suggestion.kind === "contact" ? contactById.get(suggestion.contactId)?.name : people.name(suggestion.email)} (same name)
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!accountContacts.length && canEdit ? <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Add contacts to this account to link the customer&apos;s speakers.</p> : null}
    </Panel>
  );
}
