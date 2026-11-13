"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, Columns3, Handshake, List, Phone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEAL_STAGE_LABELS, DEAL_STAGES, isOpenStage, OPEN_STAGES, type DealStage } from "@/lib/revenue/deals";
import { FORECAST_CATEGORY_LABELS } from "@/lib/revenue/forecast";
import { canWrite } from "@/lib/revenue/schemas";
import { cn } from "@/lib/utils";

import { api, daysAgo, money, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { compactMoney, EmptyState, ErrorText, PageHeader, Panel, RiskChip, StageBadge, stageDot } from "./ui";

const ALL = "__all__";

export function DealsView({ workspace, onChanged, onOpenDeal }: { workspace: Workspace; onChanged: () => void; onOpenDeal: (id: string) => void }) {
  const writer = canWrite(workspace.role);
  const people = usePeople();
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [owner, setOwner] = useState(ALL);
  const accountName = useMemo(() => new Map(workspace.accounts.map((account) => [account.id, account.name])), [workspace.accounts]);
  const owners = [...new Set(workspace.deals.map((deal) => deal.ownerEmail.toLowerCase()))].sort((a, b) => people.name(a).localeCompare(people.name(b)));
  const deals = owner === ALL ? workspace.deals : workspace.deals.filter((deal) => deal.ownerEmail.toLowerCase() === owner);
  const open = deals.filter((deal) => isOpenStage(deal.stage));
  const openPipeline = open.reduce((sum, deal) => sum + deal.amount, 0);
  const atRisk = open.filter((deal) => deal.risks.some((risk) => risk.severity === "high")).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Deals"
        description={
          workspace.deals.length
            ? `${open.length} open · ${money(openPipeline)} in pipeline · ${atRisk} with a high-severity risk`
            : "Every call is logged against a deal, so this is where your pipeline starts."
        }
        actions={
          writer ? (
            <>
              <AccountDialog tenantId={workspace.tenant.id} onCreated={onChanged} />
              <DealDialog workspace={workspace} onCreated={onChanged} />
            </>
          ) : null
        }
      />

      {!workspace.deals.length ? (
        <EmptyState
          icon={Handshake}
          title={workspace.accounts.length ? "Add your first deal" : "Add the customer you're selling to"}
          action={writer ? (workspace.accounts.length ? <DealDialog workspace={workspace} onCreated={onChanged} /> : <AccountDialog tenantId={workspace.tenant.id} onCreated={onChanged} primary />) : null}
        >
          {workspace.accounts.length
            ? "Give it a stage, an amount and a close date. Risk signals and the forecast start from there."
            : "Accounts are the companies you sell to. Add one, then the deal you're working with them."}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={layout} onValueChange={(value) => setLayout(value as "board" | "list")}>
              <TabsList>
                <TabsTrigger value="board"><Columns3 /> Board</TabsTrigger>
                <TabsTrigger value="list"><List /> List</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger aria-label="Deal owner" className="w-56 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone&apos;s deals</SelectItem>
                {owners.map((email) => (
                  <SelectItem key={email} value={email}>
                    <PersonAvatar email={email} size="xs" /> {people.name(email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {layout === "board" ? (
            <DealBoard deals={deals} accountName={accountName} onOpenDeal={onOpenDeal} />
          ) : (
            <DealList deals={deals} accountName={accountName} onOpenDeal={onOpenDeal} />
          )}
        </>
      )}
    </div>
  );
}

function DealBoard({ deals, accountName, onOpenDeal }: { deals: WorkspaceDeal[]; accountName: Map<string, string>; onOpenDeal: (id: string) => void }) {
  const closed = CLOSED.map((stage) => ({ stage, deals: deals.filter((deal) => deal.stage === stage).sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? "")) }));
  return (
    <div className="grid gap-4">
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid auto-cols-[minmax(216px,1fr)] grid-flow-col gap-3">
        {OPEN_STAGES.map((stage) => {
          const column = deals.filter((deal) => deal.stage === stage).sort((a, b) => b.amount - a.amount);
          return (
            <section key={stage} className="flex min-h-48 flex-col rounded-lg border border-border bg-brand-subtle/70" aria-label={DEAL_STAGE_LABELS[stage]}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("size-2 rounded-full", stageDot(stage))} aria-hidden="true" />
                  {DEAL_STAGE_LABELS[stage]}
                  <span className="rounded-full bg-card px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{column.length}</span>
                </span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{compactMoney(column.reduce((sum, deal) => sum + deal.amount, 0))}</span>
              </div>
              <div className="grid content-start gap-2 p-2">
                {column.map((deal) => <DealCard key={deal.id} deal={deal} account={accountName.get(deal.accountId)} onOpen={() => onOpenDeal(deal.id)} />)}
                {!column.length ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">No deals in {DEAL_STAGE_LABELS[stage].toLowerCase()}</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {closed.map(({ stage, deals: list }) => (
        <section key={stage} className="rounded-lg border border-border bg-card" aria-label={DEAL_STAGE_LABELS[stage]}>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", stageDot(stage))} aria-hidden="true" />
              {DEAL_STAGE_LABELS[stage]}
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{list.length}</span>
            </span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">{compactMoney(list.reduce((sum, deal) => sum + deal.amount, 0))}</span>
          </div>
          {list.length ? (
            <ul className="divide-y divide-border">
              {list.map((deal) => (
                <li key={deal.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60" onClick={() => onOpenDeal(deal.id)}>
                    <PersonAvatar email={deal.ownerEmail} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{deal.name}<span className="font-normal text-muted-foreground"> · {accountName.get(deal.accountId) ?? "—"}</span></span>
                    <span className="text-xs text-muted-foreground">{shortDate(deal.closeDate)}</span>
                    <span className="w-20 text-right text-sm font-medium tabular-nums">{money(deal.amount, deal.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-3 py-4 text-xs text-muted-foreground">{stage === "closed_won" ? "Your first win will show up here." : "No lost deals. Long may it last."}</p>}
        </section>
      ))}
    </div>
    </div>
  );
}

const CLOSED: DealStage[] = ["closed_won", "closed_lost"];

function DealCard({ deal, account, onOpen }: { deal: WorkspaceDeal; account?: string; onOpen: () => void }) {
  const open = isOpenStage(deal.stage);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid gap-2.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-[border-color,box-shadow] hover:border-ring/50 hover:shadow-md focus-visible:border-ring"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="grid min-w-0">
          <span className="truncate text-xs text-muted-foreground">{account ?? "—"}</span>
          <span className="line-clamp-2 text-sm font-semibold text-foreground">{deal.name}</span>
        </span>
        <PersonAvatar email={deal.ownerEmail} size="sm" />
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="brand-heading text-base tabular-nums">{money(deal.amount, deal.currency)}</span>
        <span className="text-xs text-muted-foreground">{deal.closeDate ? `Close ${shortDate(deal.closeDate).replace(/, \d{4}$/, "")}` : "No close date"}</span>
      </span>
      {deal.risks.length ? (
        <span className="flex flex-wrap gap-1">{deal.risks.slice(0, 3).map((risk) => <RiskChip key={risk.code} code={risk.code} severity={risk.severity} />)}</span>
      ) : null}
      <span className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Phone className="size-3" aria-hidden="true" />{deal.lastCall ? daysAgo(deal.lastCall.occurredAt) : "No calls yet"}</span>
        {open ? <span>{deal.daysInStage}d in stage</span> : null}
      </span>
    </button>
  );
}

function DealList({ deals, accountName, onOpenDeal }: { deals: WorkspaceDeal[]; accountName: Map<string, string>; onOpenDeal: (id: string) => void }) {
  const sorted = [...deals].sort((a, b) => Number(isOpenStage(b.stage)) - Number(isOpenStage(a.stage)) || b.amount - a.amount);
  return (
    <Panel className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="pl-4">Deal</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Close</TableHead>
            <TableHead>Forecast</TableHead>
            <TableHead>Last call</TableHead>
            <TableHead className="pr-4">Signals</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((deal) => (
            <TableRow key={deal.id} className="cursor-pointer" onClick={() => onOpenDeal(deal.id)}>
              <TableCell className="pl-4">
                <button type="button" className="grid text-left" onClick={() => onOpenDeal(deal.id)}>
                  <span className="font-medium text-foreground hover:underline">{deal.name}</span>
                  <span className="text-xs text-muted-foreground">{accountName.get(deal.accountId) ?? "—"}</span>
                </button>
              </TableCell>
              <TableCell><PersonChip email={deal.ownerEmail} size="sm" /></TableCell>
              <TableCell><StageBadge stage={deal.stage} /></TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(deal.amount, deal.currency)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{shortDate(deal.closeDate)}</TableCell>
              <TableCell className="text-sm">{isOpenStage(deal.stage) ? FORECAST_CATEGORY_LABELS[deal.forecastCategory] : "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{deal.lastCall ? daysAgo(deal.lastCall.occurredAt) : "None"}</TableCell>
              <TableCell className="pr-4">
                <span className="flex flex-wrap gap-1">{deal.risks.length ? deal.risks.slice(0, 2).map((risk) => <RiskChip key={risk.code} code={risk.code} severity={risk.severity} />) : <span className="text-xs text-muted-foreground">On track</span>}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function AccountDialog({ tenantId, onCreated, primary = false }: { tenantId: string; onCreated: () => void; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${tenantId}/accounts`, { method: "POST", body: JSON.stringify({ name, domain }) });
      setOpen(false);
      setName("");
      setDomain("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant={primary ? "default" : "outline"} onClick={() => setOpen(true)}><Building2 /> New account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New account</DialogTitle>
              <DialogDescription>The company you&apos;re selling to. Its deals, contacts and calls live together.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2"><Label htmlFor="acc-name">Company name</Label><Input id="acc-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus /></div>
            <div className="grid gap-2"><Label htmlFor="acc-domain">Website (optional)</Label><Input id="acc-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="acme.com" maxLength={120} /></div>
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || name.trim().length < 2}>Create account</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DealDialog({ workspace, onCreated, accountId: fixedAccount }: { workspace: Workspace; onCreated: () => void; accountId?: string }) {
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(fixedAccount ?? "");
  const [stage, setStage] = useState<DealStage>("discovery");
  const [amount, setAmount] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [ownerEmail, setOwnerEmail] = useState(workspace.user.email);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/deals`, {
        method: "POST",
        body: JSON.stringify({ name, accountId, stage, amount: Number(amount || 0), currency: "USD", closeDate: closeDate || null, ownerEmail }),
      });
      setOpen(false);
      setName("");
      setAmount("");
      setCloseDate("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The deal wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button size={fixedAccount ? "sm" : "default"} variant={fixedAccount ? "outline" : "default"} onClick={() => setOpen(true)} disabled={!workspace.accounts.length}><Plus /> New deal</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New deal</DialogTitle>
              <DialogDescription>Stage, amount, close date and owner drive the board, the forecast and risk signals.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2"><Label htmlFor="deal-name">Deal name</Label><Input id="deal-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme — 50 seats" maxLength={120} autoFocus /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              {!fixedAccount ? (
                <div className="grid gap-2">
                  <Label>Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger aria-label="Account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                    <SelectContent>{workspace.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={stage} onValueChange={(value) => setStage(value as DealStage)}>
                  <SelectTrigger aria-label="Stage"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEAL_STAGES.map((value) => <SelectItem key={value} value={value}>{DEAL_STAGE_LABELS[value]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label htmlFor="deal-amount">Amount (USD)</Label><Input id="deal-amount" inputMode="decimal" type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
              <div className="grid gap-2"><Label htmlFor="deal-close">Close date</Label><Input id="deal-close" type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} /></div>
            </div>
            <div className="grid gap-2">
              <Label>Owner</Label>
              <Select value={ownerEmail} onValueChange={setOwnerEmail}>
                <SelectTrigger aria-label="Owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workspace.members.map((member) => (
                    <SelectItem key={member.uid} value={member.email}><PersonAvatar email={member.email} size="xs" /> {people.name(member.email)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !accountId || name.trim().length < 2}>Create deal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
