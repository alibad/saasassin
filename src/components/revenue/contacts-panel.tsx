"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Link2, Plus, Trash2, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEAL_ROLE_LABELS, DEAL_ROLES, suggestSpeakerLinks, type SpeakerLink } from "@/lib/revenue/contacts";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { canWrite } from "@/lib/revenue/schemas";

import { api, percent, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import styles from "./revenue.module.css";

const NONE = "__none__";

export function ContactsPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const writer = canWrite(workspace.role);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));
  const byAccount = useMemo(() => {
    const groups = new Map<string, Workspace["contacts"]>();
    for (const contact of workspace.contacts) groups.set(contact.accountId, [...(groups.get(contact.accountId) ?? []), contact]);
    return groups;
  }, [workspace.contacts]);

  async function remove() {
    if (!removing) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/contacts/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not removed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[#5f5c56]">
          People on your accounts and their role in each deal. Talk time comes only from transcript speakers someone linked to a contact on the call page — nothing is inferred from names.
        </p>
        {writer && workspace.accounts.length ? <ContactDialog workspace={workspace} onCreated={onChanged} /> : null}
      </div>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {!workspace.contacts.length ? (
        <div className={`${styles.panel} grid gap-2 p-6`}>
          <h2 className="text-lg font-bold">No contacts yet</h2>
          <p className="text-sm text-[#5f5c56]">
            {workspace.accounts.length ? "Add the champion, decision maker and other stakeholders on an account, then link them to speakers on calls." : "Add an account first; contacts belong to accounts."}
          </p>
        </div>
      ) : (
        workspace.accounts
          .filter((account) => byAccount.has(account.id))
          .map((account) => (
            <section key={account.id} className={`${styles.panel} grid gap-2 p-4`}>
              <p className={styles.eyebrow}>{account.name} · {byAccount.get(account.id)!.length} contact{byAccount.get(account.id)!.length === 1 ? "" : "s"}</p>
              {byAccount.get(account.id)!.map((contact) => (
                <div key={contact.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#e3dfd3] pt-2">
                  <div className="grid gap-1">
                    <strong className="text-sm">{contact.name}{contact.title ? <span className="font-normal text-[#5f5c56]"> · {contact.title}</span> : null}</strong>
                    {contact.email ? <span className="text-xs text-[#5f5c56]">{contact.email}</span> : null}
                    <span className="flex flex-wrap gap-1">
                      {contact.dealRoles.map((entry) => (
                        <Badge key={entry.dealId} variant="outline">{DEAL_ROLE_LABELS[entry.role]} · {dealName.get(entry.dealId) ?? "Deal"}</Badge>
                      ))}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="grid text-right text-xs">
                      {contact.engagement ? (
                        <>
                          <span className={styles.mono}>{formatTimestamp(contact.engagement.talkSeconds)} talk · {contact.engagement.calls} call{contact.engagement.calls === 1 ? "" : "s"}</span>
                          <span className="text-[#5f5c56]">{percent(contact.engagement.talkShare)} of talk on their calls · last {shortDate(contact.engagement.lastCallAt)}</span>
                        </>
                      ) : (
                        <span className="text-[#5f5c56]">Not linked to any call speaker</span>
                      )}
                    </div>
                    {writer ? (
                      <Button size="sm" variant="ghost" aria-label={`Remove ${contact.name}`} onClick={() => setRemoving({ id: contact.id, name: contact.name })}><Trash2 /></Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ))
      )}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>Their deal roles are removed and any call speakers linked to them become unlinked. Transcripts are not changed. This is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void remove()}>Remove contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant={fixedAccount ? "outline" : "default"} size={fixedAccount ? "sm" : "default"} onClick={() => setOpen(true)}><UserRound /> Add contact</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
              <DialogDescription>A person at the customer. Set their role per deal from the deal.</DialogDescription>
            </DialogHeader>
            {!fixedAccount ? (
              <div className="grid gap-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Account"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{workspace.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2"><Label htmlFor="contact-name">Name</Label><Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></div>
            <div className="grid gap-2"><Label htmlFor="contact-title">Title (optional)</Label><Input id="contact-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VP Sales" maxLength={120} /></div>
            <div className="grid gap-2"><Label htmlFor="contact-email">Email (optional)</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} /></div>
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            <DialogFooter><Button type="submit" disabled={pending || !accountId || name.trim().length < 2}><Plus /> Add contact</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** People on a deal: every contact on the deal's account, with their role in this deal. */
export function DealPeople({ workspace, deal, onChanged }: { workspace: Workspace; deal: WorkspaceDeal; onChanged: () => void }) {
  const writer = canWrite(workspace.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const contacts = workspace.contacts.filter((contact) => contact.accountId === deal.accountId);
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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className={styles.eyebrow}>People on this deal ({deal.contacts.length})</p>
        {writer ? <ContactDialog workspace={workspace} accountId={deal.accountId} onCreated={onChanged} /> : null}
      </div>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {contacts.length ? (
        contacts.map((contact) => (
          <div key={contact.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[#171715] bg-white p-2 text-sm">
            <span className="min-w-0">
              <strong>{contact.name}</strong>{contact.title ? <span className="text-[#5f5c56]"> · {contact.title}</span> : null}
              <span className="block text-xs text-[#5f5c56]">
                {contact.engagement && contact.engagement.dealIds.includes(deal.id)
                  ? `${formatTimestamp(contact.engagement.talkSeconds)} talk across ${contact.engagement.calls} call${contact.engagement.calls === 1 ? "" : "s"}`
                  : "Not heard on this deal's calls yet"}
              </span>
            </span>
            {writer ? (
              <Select value={roleOf.get(contact.id) ?? NONE} onValueChange={(value) => void setRole(contact.id, value)} disabled={pending === contact.id}>
                <SelectTrigger aria-label={`Role of ${contact.name}`} className="w-40 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not on deal</SelectItem>
                  {DEAL_ROLES.map((role) => <SelectItem key={role} value={role}>{DEAL_ROLE_LABELS[role]}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{roleOf.get(contact.id) ? DEAL_ROLE_LABELS[roleOf.get(contact.id)!] : "Not on deal"}</Badge>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-[#5f5c56]">No contacts on this account yet.</p>
      )}
    </div>
  );
}

type LinkContact = { id: string; name: string; accountId: string; email: string; title: string };

/** Links each transcript speaker to a contact on the deal's account or to a workspace member. */
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const accountContacts = contacts.filter((contact) => contact.accountId === accountId);
  const linkOf = new Map(links.map((link) => [link.speaker, link]));
  const suggestions = new Map(suggestSpeakerLinks(speakers, accountContacts, members, links).map((link) => [link.speaker, link]));
  const contactName = new Map(contacts.map((contact) => [contact.id, contact.name]));
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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={`${styles.panel} grid gap-2 p-4`}>
      <p className={styles.eyebrow}><Link2 className="inline size-3" /> Speakers</p>
      <p className="text-xs text-[#5f5c56]">Link customer speakers to contacts and your team to members. This drives per-contact talk time and the single-threaded risk.</p>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {speakers.map((speaker) => {
        const link = linkOf.get(speaker);
        const suggestion = suggestions.get(speaker);
        return (
          <div key={speaker} className="grid gap-1 border-t border-[#e3dfd3] pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{speaker}</strong>
              {canEdit ? (
                <Select value={valueOf(link)} onValueChange={(value) => void save(speaker, value)} disabled={pending === speaker}>
                  <SelectTrigger aria-label={`Link ${speaker}`} className="w-52 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked</SelectItem>
                    {accountContacts.map((contact) => <SelectItem key={contact.id} value={`contact:${contact.id}`}>Contact · {contact.name}</SelectItem>)}
                    {members.map((member) => <SelectItem key={member.email} value={`member:${member.email}`}>Team · {member.name || member.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs">{!link ? "Not linked" : link.kind === "contact" ? `Contact · ${contactName.get(link.contactId) ?? "Removed"}` : `Team · ${link.email}`}</span>
              )}
            </div>
            {canEdit && suggestion ? (
              <button type="button" className="w-fit text-xs underline" onClick={() => void save(speaker, valueOf(suggestion))}>
                Suggested: {suggestion.kind === "contact" ? contactName.get(suggestion.contactId) : suggestion.email} (same name) — link
              </button>
            ) : null}
          </div>
        );
      })}
      {!accountContacts.length && canEdit ? <p className="text-xs text-[#5f5c56]">Add contacts to this deal&apos;s account to link customer speakers.</p> : null}
    </div>
  );
}
