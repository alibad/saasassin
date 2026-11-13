"use client";

import { useMemo, useState } from "react";
import { Building2, Globe, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEAL_ROLE_LABELS } from "@/lib/revenue/contacts";
import { isOpenStage } from "@/lib/revenue/deals";
import { canWrite } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";

import { api, money, percent, shortDate, type Workspace } from "./client";
import { ContactDialog } from "./contacts-panel";
import { AccountDialog, DealDialog } from "./deals-view";
import { ContactAvatar, PersonAvatar } from "./people";
import { compactMoney, EmptyState, ErrorText, PageHeader, Panel, StageBadge } from "./ui";

/** Accounts with their deals and the people you talk to there. */
export function AccountsView({ workspace, onChanged, onOpenDeal }: { workspace: Workspace; onChanged: () => void; onOpenDeal: (id: string) => void }) {
  const writer = canWrite(workspace.role);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dealName = useMemo(() => new Map(workspace.deals.map((deal) => [deal.id, deal.name])), [workspace.deals]);

  const accounts = useMemo(
    () =>
      workspace.accounts
        .map((account) => {
          const deals = workspace.deals.filter((deal) => deal.accountId === account.id);
          const contacts = workspace.contacts.filter((contact) => contact.accountId === account.id);
          const open = deals.filter((deal) => isOpenStage(deal.stage));
          return { account, deals, contacts, openAmount: open.reduce((sum, deal) => sum + deal.amount, 0), won: deals.filter((deal) => deal.stage === "closed_won").reduce((sum, deal) => sum + deal.amount, 0) };
        })
        .sort((a, b) => b.openAmount - a.openAmount || a.account.name.localeCompare(b.account.name)),
    [workspace.accounts, workspace.deals, workspace.contacts],
  );

  async function remove() {
    if (!removing) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/contacts/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The contact wasn't removed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Accounts"
        description={`${workspace.accounts.length} account${workspace.accounts.length === 1 ? "" : "s"} · ${workspace.contacts.length} contact${workspace.contacts.length === 1 ? "" : "s"}. Talk time counts only speakers someone linked to a contact on a call.`}
        actions={
          writer ? (
            <>
              {workspace.accounts.length ? <ContactDialog workspace={workspace} onCreated={onChanged} /> : null}
              <AccountDialog tenantId={workspace.tenant.id} onCreated={onChanged} primary />
            </>
          ) : null
        }
      />
      <ErrorText>{error}</ErrorText>
      {!accounts.length ? (
        <EmptyState icon={Building2} title="Add the companies you sell to" action={writer ? <AccountDialog tenantId={workspace.tenant.id} onCreated={onChanged} primary /> : null}>
          Each account keeps its deals, its buying committee and every call in one place.
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {accounts.map(({ account, deals, contacts, openAmount, won }) => (
            <Panel key={account.id} className="grid content-start">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {account.name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
                  </span>
                  <div className="grid min-w-0">
                    <h2 className="truncate font-heading text-base font-semibold">{account.name}</h2>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {account.domain ? <><Globe className="size-3" aria-hidden="true" />{account.domain}</> : "No website"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-right text-xs text-muted-foreground">
                  <span className="grid"><span className="text-sm font-semibold tabular-nums text-foreground">{compactMoney(openAmount)}</span>open</span>
                  <span className="grid"><span className="text-sm font-semibold tabular-nums text-foreground">{compactMoney(won)}</span>won</span>
                </div>
              </div>
              <div className="grid gap-1 border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Deals</p>
                  {writer ? <DealDialog workspace={workspace} onCreated={onChanged} accountId={account.id} /> : null}
                </div>
                {deals.length ? deals.map((deal) => (
                  <button key={deal.id} type="button" className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60" onClick={() => onOpenDeal(deal.id)}>
                    <PersonAvatar email={deal.ownerEmail} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{deal.name}</span>
                    <StageBadge stage={deal.stage} className="hidden h-5 sm:inline-flex" />
                    <span className="w-20 text-right text-sm tabular-nums">{money(deal.amount, deal.currency)}</span>
                  </button>
                )) : <p className="text-sm text-muted-foreground">No deals yet.</p>}
              </div>
              <div className="grid gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">People ({contacts.length})</p>
                  {writer ? <ContactDialog workspace={workspace} accountId={account.id} onCreated={onChanged} /> : null}
                </div>
                {contacts.length ? contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 py-1.5">
                    <ContactAvatar id={contact.id} name={contact.name} size="md" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{contact.name}<span className="font-normal text-muted-foreground">{contact.title ? ` · ${contact.title}` : ""}</span></span>
                      <span className="flex flex-wrap gap-1">
                        {contact.dealRoles.map((entry) => (
                          <Badge key={entry.dealId} variant="secondary" className="h-4 px-1.5 text-[0.65rem]">{DEAL_ROLE_LABELS[entry.role]}{workspace.deals.length > 1 && deals.length > 1 ? ` · ${dealName.get(entry.dealId) ?? "Deal"}` : ""}</Badge>
                        ))}
                      </span>
                    </span>
                    <span className="hidden text-right text-xs text-muted-foreground sm:grid">
                      {contact.engagement ? (
                        <>
                          <span className="font-medium tabular-nums text-foreground">{formatTimestamp(contact.engagement.talkSeconds)} talk</span>
                          <span>{percent(contact.engagement.talkShare)} share · {shortDate(contact.engagement.lastCallAt)}</span>
                        </>
                      ) : <span>Not heard yet</span>}
                    </span>
                    {writer ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${contact.name}`} onClick={() => setRemoving({ id: contact.id, name: contact.name })}><Trash2 /></Button>
                    ) : null}
                  </div>
                )) : <p className="text-sm text-muted-foreground">Add the champion and decision makers to track who you&apos;re really talking to.</p>}
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>Their deal roles are removed and any call speakers linked to them become unlinked. Transcripts don&apos;t change.</DialogDescription>
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
