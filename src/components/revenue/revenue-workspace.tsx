"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Download,
  History,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { METRIC_DEFINITIONS } from "@/lib/revenue/coaching";
import { buildCrmFieldPreview } from "@/lib/revenue/crm";
import {
  allowedNextStages,
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  RISK_RULE_DEFINITIONS,
  type DealStage,
} from "@/lib/revenue/deals";
import { canCoach, canWrite, INVITABLE_ROLES, isAdmin, ROLE_LABELS } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";

import { CallDetailView } from "./call-detail";
import { api, daysAgo, money, percent, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import { LogCallForm } from "./log-call-form";
import styles from "./revenue.module.css";

type TenantSummary = { id: string; name: string; role: string };
type AuditEvent = { id: string; action: string; actor: { email: string }; target: { type: string; id: string }; details: Record<string, unknown>; occurredAt: string | null };

const TENANT_KEY = "saasassin-revenue-tenant";

function readStoredTenant() {
  try {
    return window.localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

function storeTenant(id: string) {
  try {
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* storage unavailable: selection just isn't remembered */
  }
}

export function RevenueWorkspace({ userEmail, userName }: { userEmail: string; userName: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ tenants: TenantSummary[] }>("/api/fleet/revenue/tenants")
      .then(({ tenants: list }) => {
        if (cancelled) return;
        setTenants(list);
        const stored = readStoredTenant();
        setTenantId(list.find((tenant) => tenant.id === stored)?.id ?? list[0]?.id ?? null);
      })
      .catch((error: Error) => !cancelled && setTenantsError(error.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOutEverywhere() {
    await fetch("/api/fleet/revenue/session", { method: "DELETE" });
    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      /* the product session is already cleared */
    }
    router.push("/apps/revenue/sign-in");
    router.refresh();
  }

  function selectTenant(id: string) {
    storeTenant(id);
    setTenantId(id);
  }

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <div className="flex items-center gap-3">
            <span className={styles.mark} aria-hidden="true">R</span>
            <div className="grid leading-tight">
              <strong>SaaSassin Revenue</strong>
              <span className={styles.eyebrow}>Conversation intelligence</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tenants && tenants.length ? (
              <Select value={tenantId ?? undefined} onValueChange={selectTenant}>
                <SelectTrigger aria-label="Workspace" className="min-w-44 bg-white"><SelectValue placeholder="Workspace" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {tenants && tenants.length ? (
              <CreateWorkspaceDialog
                onCreated={(tenant) => {
                  setTenants((current) => [...(current ?? []), tenant]);
                  selectTenant(tenant.id);
                }}
              />
            ) : null}
            <span className="hidden text-sm text-[#5f5c56] sm:inline">{userName || userEmail}</span>
            <Button variant="outline" onClick={() => void signOutEverywhere()}><LogOut /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className={`${styles.shell} py-6 sm:py-10`}>
        {tenantsError ? (
          <Alert variant="destructive">
            <AlertTitle>Workspaces unavailable</AlertTitle>
            <AlertDescription>{tenantsError}</AlertDescription>
          </Alert>
        ) : tenants === null ? (
          <div className="grid gap-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full" /></div>
        ) : !tenants.length || !tenantId ? (
          <Onboarding
            onCreated={(tenant) => {
              setTenants([tenant]);
              selectTenant(tenant.id);
            }}
          />
        ) : (
          <TenantWorkspace key={tenantId} tenantId={tenantId} />
        )}
      </div>
    </main>
  );
}

function useCreateWorkspace(onCreated: (tenant: TenantSummary) => void) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { tenant } = await api<{ tenant: TenantSummary }>("/api/fleet/revenue/tenants", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      onCreated(tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The workspace could not be created.");
    } finally {
      setPending(false);
    }
  }
  return { name, setName, pending, error, submit };
}

function Onboarding({ onCreated }: { onCreated: (tenant: TenantSummary) => void }) {
  const form = useCreateWorkspace(onCreated);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <p className={styles.eyebrow}>Get started</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Turn consented sales calls into coaching you can check.</h1>
        <ol className="grid gap-2 text-[#5f5c56]">
          <li>1. Create your team workspace.</li>
          <li>2. Add accounts and deals with stage, amount, close date and owner.</li>
          <li>3. Log calls from VTT/SRT/plain transcripts with a recording-consent record.</li>
          <li>4. Review talk ratio, questions, trackers and next steps — every number links to the transcript.</li>
        </ol>
      </div>
      <form className={`${styles.panel} grid content-start gap-4 p-6`} onSubmit={form.submit}>
        <h2 className="text-xl font-bold">Create a workspace</h2>
        <div className="grid gap-2">
          <Label htmlFor="ws-name">Team name</Label>
          <Input id="ws-name" value={form.name} onChange={(event) => form.setName(event.target.value)} placeholder="Acme Sales" maxLength={80} />
        </div>
        {form.error ? <p className="text-sm text-[#b42318]">{form.error}</p> : null}
        <Button type="submit" disabled={form.pending || form.name.trim().length < 2}>
          {form.pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace
        </Button>
      </form>
    </div>
  );
}

function CreateWorkspaceDialog({ onCreated }: { onCreated: (tenant: TenantSummary) => void }) {
  const [open, setOpen] = useState(false);
  const form = useCreateWorkspace((tenant) => {
    setOpen(false);
    onCreated(tenant);
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus /> Workspace</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={form.submit}>
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>Workspaces are fully isolated: deals, calls and members never cross between them.</DialogDescription>
            </DialogHeader>
            <Input aria-label="Workspace name" value={form.name} onChange={(event) => form.setName(event.target.value)} placeholder="Team name" maxLength={80} />
            {form.error ? <p className="text-sm text-[#b42318]">{form.error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={form.pending || form.name.trim().length < 2}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TenantWorkspace({ tenantId }: { tenantId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("deals");
  const [openCall, setOpenCallState] = useState<{ id: string; at: number | null } | null>(null);
  const setOpenCall = useCallback((id: string | null, at: number | null = null) => setOpenCallState(id ? { id, at } : null), []);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api<Workspace>(`/api/revenue/tenants/${tenantId}/workspace`)
      .then((result) => {
        if (!cancelled) {
          setWorkspace(result);
          setError(null);
        }
      })
      .catch((err: Error & { status?: number }) => !cancelled && setError({ message: err.message, status: err.status }));
    return () => {
      cancelled = true;
    };
  }, [tenantId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{error.status === 403 ? "No access" : error.status === 404 ? "Workspace not found" : "Could not load the workspace"}</AlertTitle>
        <AlertDescription className="grid gap-2">
          {error.message}
          <Button variant="outline" className="w-fit" onClick={reload}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!workspace) {
    return <div className="grid gap-3"><Skeleton className="h-10 w-80" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (openCall) {
    return (
      <CallDetailView
        key={`${openCall.id}-${openCall.at ?? ""}`}
        tenantId={tenantId}
        callId={openCall.id}
        focusAt={openCall.at}
        role={workspace.role}
        playlists={[...new Set(workspace.snippets.map((snippet) => snippet.playlist))]}
        members={workspace.members.map((member) => member.email)}
        onBack={() => setOpenCall(null)}
        onChanged={reload}
      />
    );
  }

  const admin = isAdmin(workspace.role);
  const coach = canCoach(workspace.role);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={styles.eyebrow}>{ROLE_LABELS[workspace.role] ?? workspace.role} · {workspace.members.length} member{workspace.members.length === 1 ? "" : "s"}</p>
          <h1 className="text-3xl font-bold tracking-tight">{workspace.tenant.name}</h1>
        </div>
        {admin ? (
          <Button asChild variant="outline">
            <a href={`/api/revenue/tenants/${tenantId}/export`} download>
              <Download /> Export JSON
            </a>
          </Button>
        ) : null}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="calls">Calls ({workspace.calls.length})</TabsTrigger>
          {canWrite(workspace.role) ? <TabsTrigger value="log">Log call</TabsTrigger> : null}
          <TabsTrigger value="library">Coaching ({workspace.assignments.filter((entry) => entry.status === "assigned" && entry.assigneeEmail === workspace.user.email).length} to review)</TabsTrigger>
          <TabsTrigger value="dashboard">Team dashboard</TabsTrigger>
          <TabsTrigger value="trackers">Trackers & settings</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {coach ? <TabsTrigger value="audit">Audit log</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="deals" className="pt-4">
          <DealsBoard
            workspace={workspace}
            onChanged={reload}
            onOpenCall={setOpenCall}
            onLogCall={(dealId) => {
              setLogDealId(dealId);
              setTab("log");
            }}
          />
        </TabsContent>
        <TabsContent value="calls" className="pt-4">
          <div className="grid gap-4">
            {workspace.calls.length ? <TranscriptSearch workspace={workspace} onOpenCall={setOpenCall} /> : null}
            <CallsTable workspace={workspace} onOpenCall={setOpenCall} />
          </div>
        </TabsContent>
        <TabsContent value="log" className="pt-4">
          <LogCallForm
            key={logDealId ?? "none"}
            workspace={workspace}
            defaultDealId={logDealId}
            onLogged={(callId) => {
              reload();
              setOpenCall(callId);
              setTab("calls");
            }}
          />
        </TabsContent>
        <TabsContent value="library" className="pt-4">
          <div className="grid gap-6">
            <CoachingQueue workspace={workspace} onOpenCall={setOpenCall} onChanged={reload} />
            <CoachingLibrary workspace={workspace} onOpenCall={setOpenCall} onChanged={reload} />
          </div>
        </TabsContent>
        <TabsContent value="dashboard" className="pt-4">
          <Dashboard workspace={workspace} />
        </TabsContent>
        <TabsContent value="trackers" className="pt-4">
          <TrackersPanel workspace={workspace} onChanged={reload} />
        </TabsContent>
        <TabsContent value="integrations" className="pt-4">
          <IntegrationsPanel />
        </TabsContent>
        <TabsContent value="team" className="pt-4">
          <TeamPanel workspace={workspace} onChanged={reload} />
        </TabsContent>
        {coach ? (
          <TabsContent value="audit" className="pt-4">
            {tab === "audit" ? <AuditPanel tenantId={tenantId} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

const RISK_STYLES: Record<string, string> = {
  high: "border-[#b42318] bg-[#fee4e2] text-[#7a271a]",
  medium: "border-[#b54708] bg-[#fef0c7] text-[#7a2e0e]",
  low: "border-[#171715] bg-[#eef2ff] text-[#171715]",
};

function DealsBoard({
  workspace,
  onChanged,
  onOpenCall,
  onLogCall,
}: {
  workspace: Workspace;
  onChanged: () => void;
  onOpenCall: (id: string, at?: number | null) => void;
  onLogCall: (dealId: string) => void;
}) {
  const [selected, setSelected] = useState<WorkspaceDeal | null>(null);
  const writer = canWrite(workspace.role);
  const accountName = useMemo(() => new Map(workspace.accounts.map((account) => [account.id, account.name])), [workspace.accounts]);
  const openPipeline = workspace.deals.filter((deal) => !deal.stage.startsWith("closed")).reduce((sum, deal) => sum + deal.amount, 0);
  const atRisk = workspace.deals.filter((deal) => deal.risks.length).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{workspace.deals.length} deals</Badge>
          <Badge variant="outline">Open pipeline {money(openPipeline)}</Badge>
          <Badge variant="outline">{atRisk} with risk signals</Badge>
        </div>
        {writer ? (
          <div className="flex flex-wrap gap-2">
            <AccountDialog tenantId={workspace.tenant.id} onCreated={onChanged} />
            <DealDialog workspace={workspace} onCreated={onChanged} />
          </div>
        ) : null}
      </div>
      {!workspace.deals.length ? (
        <div className={`${styles.panel} grid gap-2 p-6`}>
          <h2 className="text-lg font-bold">No deals yet</h2>
          <p className="text-sm text-[#5f5c56]">
            {workspace.accounts.length ? "Create a deal for one of your accounts to start logging calls." : "Add an account, then a deal. Calls are always logged against a deal."}
          </p>
        </div>
      ) : (
        <div className={styles.board}>
          {DEAL_STAGES.map((stage) => {
            const deals = workspace.deals.filter((deal) => deal.stage === stage);
            return (
              <section key={stage} className={styles.column} aria-label={DEAL_STAGE_LABELS[stage]}>
                <div className={styles.columnHeader}>
                  <span>{DEAL_STAGE_LABELS[stage]}</span>
                  <span className={`${styles.mono} text-xs`}>{deals.length} · {money(deals.reduce((sum, deal) => sum + deal.amount, 0))}</span>
                </div>
                <div className="grid content-start gap-2 p-2">
                  {deals.map((deal) => (
                    <button key={deal.id} type="button" className={styles.dealCard} onClick={() => setSelected(deal)}>
                      <strong className="text-sm">{deal.name}</strong>
                      <span className="text-xs text-[#5f5c56]">{accountName.get(deal.accountId) ?? "Unknown account"} · {deal.ownerEmail}</span>
                      <span className="flex justify-between text-xs">
                        <span className={styles.mono}>{money(deal.amount, deal.currency)}</span>
                        <span>Close {shortDate(deal.closeDate)}</span>
                      </span>
                      <span className="text-xs">{deal.lastCall ? `Last call ${daysAgo(deal.lastCall.occurredAt)}` : "No calls yet"}</span>
                      {deal.risks.length ? (
                        <span className="flex flex-wrap gap-1">
                          {deal.risks.map((risk) => (
                            <span key={risk.code} className={`border px-1.5 py-0.5 text-[0.68rem] font-semibold ${RISK_STYLES[risk.severity]}`}>
                              {risk.code.replaceAll("_", " ")}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <DealDetailDialog
        workspace={workspace}
        deal={selected ? workspace.deals.find((deal) => deal.id === selected.id) ?? null : null}
        onClose={() => setSelected(null)}
        onChanged={onChanged}
        onOpenCall={onOpenCall}
        onLogCall={onLogCall}
      />
    </div>
  );
}

function AccountDialog({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Building2 /> New account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New account</DialogTitle>
              <DialogDescription>The customer company your deals belong to.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2"><Label htmlFor="acc-name">Name</Label><Input id="acc-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></div>
            <div className="grid gap-2"><Label htmlFor="acc-domain">Domain (optional)</Label><Input id="acc-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="acme.com" maxLength={120} /></div>
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            <DialogFooter><Button type="submit" disabled={pending || name.trim().length < 2}>Create account</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DealDialog({ workspace, onCreated }: { workspace: Workspace; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [stage, setStage] = useState<DealStage>("prospecting");
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
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!workspace.accounts.length}><Plus /> New deal</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New deal</DialogTitle>
              <DialogDescription>Stage, amount, close date and owner drive the board and its risk signals.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2"><Label htmlFor="deal-name">Deal name</Label><Input id="deal-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme — 50 seats" maxLength={120} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Account"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{workspace.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
                <SelectContent>{workspace.members.map((member) => <SelectItem key={member.uid} value={member.email}>{member.name || member.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            <DialogFooter><Button type="submit" disabled={pending || !accountId || name.trim().length < 2}>Create deal</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DealDetailDialog({
  workspace,
  deal,
  onClose,
  onChanged,
  onOpenCall,
  onLogCall,
}: {
  workspace: Workspace;
  deal: WorkspaceDeal | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenCall: (id: string, at?: number | null) => void;
  onLogCall: (dealId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const writer = canWrite(workspace.role);
  const nextStages = deal ? allowedNextStages(deal.stage, { privileged: isAdmin(workspace.role) }) : [];
  const calls = deal ? workspace.calls.filter((call) => call.dealId === deal.id) : [];
  const crmPreview = deal
    ? buildCrmFieldPreview(
        deal,
        calls.map((call) => ({
          id: call.id,
          occurredAt: call.occurredAt,
          nextSteps: call.analysis.nextSteps,
          competitorKeywords: call.analysis.competitorHits.map((hit) => hit.keyword),
          firstCompetitorAt: call.analysis.competitorHits[0]?.start ?? null,
        })),
      )
    : [];

  async function patch(body: Record<string, unknown>) {
    if (!deal) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(deal)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {deal ? (
          <>
            <DialogHeader>
              <DialogTitle>{deal.name}</DialogTitle>
              <DialogDescription>
                {DEAL_STAGE_LABELS[deal.stage]} · {money(deal.amount, deal.currency)} · close {shortDate(deal.closeDate)} · {deal.ownerEmail}
              </DialogDescription>
            </DialogHeader>
            {deal.risks.length ? (
              <div className="grid gap-2">
                {deal.risks.map((risk) => (
                  <div key={risk.code} className={`flex items-start gap-2 border p-2 text-sm ${RISK_STYLES[risk.severity]}`}>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      {risk.message}{" "}
                      {risk.callId ? (
                        <button type="button" className="underline" onClick={() => { onClose(); onOpenCall(risk.callId!, risk.at ?? null); }}>
                          Open call{risk.at !== undefined ? ` at ${formatTimestamp(risk.at)}` : ""}
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-[#027a48]">No risk signals.</p>}
            {writer ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Move stage</Label>
                  <Select value="" onValueChange={(value) => void patch({ stage: value })} disabled={pending || !nextStages.length}>
                    <SelectTrigger aria-label="Move stage"><SelectValue placeholder={nextStages.length ? "Choose a stage" : "Closed (owner/admin can reopen)"} /></SelectTrigger>
                    <SelectContent>{nextStages.map((stage) => <SelectItem key={stage} value={stage}>{DEAL_STAGE_LABELS[stage]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deal-close-edit">Close date</Label>
                  <Input
                    id="deal-close-edit"
                    type="date"
                    defaultValue={deal.closeDate ?? ""}
                    onBlur={(event) => event.target.value !== (deal.closeDate ?? "") && void patch({ closeDate: event.target.value || null })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deal-amount-edit">Amount ({deal.currency})</Label>
                  <Input
                    id="deal-amount-edit"
                    type="number"
                    min={0}
                    defaultValue={deal.amount}
                    onBlur={(event) => Number(event.target.value) !== deal.amount && event.target.value !== "" && void patch({ amount: Number(event.target.value) })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Owner</Label>
                  <Select value={deal.ownerEmail} onValueChange={(value) => value !== deal.ownerEmail && void patch({ ownerEmail: value })} disabled={pending}>
                    <SelectTrigger aria-label="Owner"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([deal.ownerEmail, ...workspace.members.map((member) => member.email)])].map((email) => (
                        <SelectItem key={email} value={email}>{email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className={styles.eyebrow}>Calls ({calls.length})</p>
                {writer ? <Button size="sm" onClick={() => { onClose(); onLogCall(deal.id); }}><Plus /> Log call</Button> : null}
              </div>
              {calls.length ? calls.map((call) => (
                <button key={call.id} type="button" className="flex justify-between gap-2 border border-[#171715] bg-white p-2 text-left text-sm" onClick={() => { onClose(); onOpenCall(call.id); }}>
                  <span>{call.title}</span>
                  <span className="text-[#5f5c56]">{shortDate(call.occurredAt)}</span>
                </button>
              )) : <p className="text-sm text-[#5f5c56]">No calls logged.</p>}
            </div>
            <div className="grid gap-2">
              <p className={styles.eyebrow}>CRM write preview</p>
              <div className="overflow-x-auto border border-[#171715] bg-white">
                <Table>
                  <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Would write</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {crmPreview.map((proposal) => (
                      <TableRow key={proposal.field}>
                        <TableCell className="text-xs font-semibold">{proposal.field}</TableCell>
                        <TableCell className="max-w-64 text-xs whitespace-normal">{proposal.proposed || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {proposal.evidence ? (
                            <button type="button" className="underline" onClick={() => { onClose(); onOpenCall(proposal.evidence!.callId, proposal.evidence!.at); }}>
                              {proposal.evidence.at === null ? "Open call" : `Call at ${formatTimestamp(proposal.evidence.at)}`}
                            </button>
                          ) : "Deal record"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-[#5f5c56]">No CRM connection is configured for this workspace, so nothing is written. This preview shows exactly what an approved sync would send.</p>
            </div>
            <div className="grid gap-1">
              <p className={styles.eyebrow}><History className="inline size-3" /> Stage history</p>
              {[...deal.stageHistory].reverse().map((change, i) => (
                <p key={i} className="text-xs">
                  {shortDate(change.at)} · {change.from ? `${DEAL_STAGE_LABELS[change.from]} → ` : "Created in "}{DEAL_STAGE_LABELS[change.to]} · {change.by}
                </p>
              ))}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type SearchResponse = {
  results: Array<{ callId: string; title: string; dealId: string; occurredAt: string; segmentIndex: number; start: number; speaker: string; text: string; charStart: number; charEnd: number }>;
  truncated: boolean;
};

function TranscriptSearch({ workspace, onOpenCall }: { workspace: Workspace; onOpenCall: (id: string, at?: number | null) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<(SearchResponse & { query: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await api<SearchResponse>(`/api/revenue/tenants/${workspace.tenant.id}/search?q=${encodeURIComponent(query.trim())}`);
      setResult({ ...response, query: query.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${styles.panel} grid gap-3 p-4`}>
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <Input aria-label="Search transcripts" className="min-w-0 flex-1 bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every transcript for a word or phrase" maxLength={120} />
        <Button type="submit" disabled={pending || query.trim().length < 2}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Search />} Search
        </Button>
        {result ? <Button type="button" variant="ghost" onClick={() => setResult(null)}>Clear</Button> : null}
      </form>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {result ? (
        <div className="grid gap-2">
          <p className={styles.eyebrow}>{result.results.length}{result.truncated ? "+" : ""} match{result.results.length === 1 ? "" : "es"} for “{result.query}”</p>
          {result.results.map((hit) => (
            <button
              key={`${hit.callId}-${hit.segmentIndex}`}
              type="button"
              className="grid gap-1 border border-[#171715] bg-white p-2 text-left text-sm"
              onClick={() => onOpenCall(hit.callId, hit.start)}
            >
              <span className="text-xs text-[#5f5c56]">{hit.title} · {dealName.get(hit.dealId) ?? "—"} · {shortDate(hit.occurredAt)} · {formatTimestamp(hit.start)} · {hit.speaker}</span>
              <span>
                {hit.text.slice(Math.max(0, hit.charStart - 80), hit.charStart)}
                <mark className={styles.hit}>{hit.text.slice(hit.charStart, hit.charEnd)}</mark>
                {hit.text.slice(hit.charEnd, hit.charEnd + 120)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CallsTable({ workspace, onOpenCall }: { workspace: Workspace; onOpenCall: (id: string, at?: number | null) => void }) {
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));
  if (!workspace.calls.length) {
    return (
      <div className={`${styles.panel} grid gap-2 p-6`}>
        <h2 className="text-lg font-bold">No calls logged</h2>
        <p className="text-sm text-[#5f5c56]">Log a call with a transcript and a consent record to see its analysis here.</p>
      </div>
    );
  }
  return (
    <div className={`${styles.panel} overflow-x-auto`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Call</TableHead>
            <TableHead>Deal</TableHead>
            <TableHead>Rep</TableHead>
            <TableHead>Length</TableHead>
            <TableHead>Rep talk</TableHead>
            <TableHead>Questions</TableHead>
            <TableHead>Trackers</TableHead>
            <TableHead>Next steps</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workspace.calls.map((call) => {
            const rep = call.analysis.speakers.find((speaker) => speaker.speaker === call.repSpeaker);
            return (
              <TableRow key={call.id} className="cursor-pointer" onClick={() => onOpenCall(call.id)}>
                <TableCell>
                  <button type="button" className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => onOpenCall(call.id)}>{call.title}</button>
                  <div className="text-xs text-[#5f5c56]">{shortDate(call.occurredAt)}</div>
                </TableCell>
                <TableCell>{dealName.get(call.dealId) ?? "—"}</TableCell>
                <TableCell className="text-xs">{call.repEmail}</TableCell>
                <TableCell className={styles.mono}>{formatTimestamp(call.analysis.durationSeconds)}</TableCell>
                <TableCell className={styles.mono}>{rep ? percent(rep.talkRatio) : "—"}</TableCell>
                <TableCell className={styles.mono}>{call.analysis.questionCount}</TableCell>
                <TableCell className="text-xs">{call.analysis.trackerSummary.map((entry) => `${entry.trackerName} ${entry.count}`).join(", ") || "—"}</TableCell>
                <TableCell className={styles.mono}>{call.analysis.nextSteps.length}</TableCell>
                <TableCell className={styles.mono}>{call.scorePercent === null ? "—" : `${call.scorePercent}%`}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CoachingQueue({
  workspace,
  onOpenCall,
  onChanged,
}: {
  workspace: Workspace;
  onOpenCall: (id: string, at?: number | null) => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coach = canCoach(workspace.role);
  const me = workspace.user.email.toLowerCase();
  const visible = workspace.assignments.filter((entry) => coach || entry.assigneeEmail.toLowerCase() === me);
  const callTitle = new Map(workspace.calls.map((call) => [call.id, call.title]));

  async function acknowledge(id: string) {
    setPending(id);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/assignments/${id}/acknowledge`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={`${styles.panel} grid gap-2 p-4`}>
      <p className={styles.eyebrow}>{coach ? "Coaching assignments" : "Your coaching queue"} · {visible.filter((entry) => entry.status === "assigned").length} open</p>
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {visible.length ? visible.map((entry) => (
        <div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#e3dfd3] pt-2">
          <div className="grid gap-0.5">
            <strong className="text-sm">{callTitle.get(entry.callId) ?? "Call"}{entry.at !== null ? ` at ${formatTimestamp(entry.at)}` : ""}</strong>
            <span className="text-xs text-[#5f5c56]">{entry.createdBy} → {entry.assigneeEmail} · {shortDate(entry.createdAt)}</span>
            <span className="text-sm">{entry.note}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={entry.status === "acknowledged" ? "secondary" : "outline"}>
              {entry.status === "acknowledged" ? `Acknowledged ${shortDate(entry.acknowledgedAt)}` : "Awaiting review"}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => onOpenCall(entry.callId, entry.at)}>Open call</Button>
            {entry.status === "assigned" && entry.assigneeEmail.toLowerCase() === me ? (
              <Button size="sm" disabled={pending === entry.id} onClick={() => void acknowledge(entry.id)}>Acknowledge</Button>
            ) : null}
          </div>
        </div>
      )) : <p className="text-sm text-[#5f5c56]">{coach ? "Assign a call from its page to start a coaching loop." : "Nothing assigned to you."}</p>}
    </section>
  );
}

function CoachingLibrary({
  workspace,
  onOpenCall,
  onChanged,
}: {
  workspace: Workspace;
  onOpenCall: (id: string, at?: number | null) => void;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const callTitle = new Map(workspace.calls.map((call) => [call.id, call.title]));
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));
  const playlists = new Map<string, Workspace["snippets"]>();
  for (const snippet of workspace.snippets) playlists.set(snippet.playlist, [...(playlists.get(snippet.playlist) ?? []), snippet]);
  const admin = isAdmin(workspace.role);

  async function remove() {
    if (!removing) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/snippets/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not removed.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.snippets.length) {
    return (
      <div className={`${styles.panel} grid gap-2 p-6`}>
        <h2 className="text-lg font-bold">No clips yet</h2>
        <p className="text-sm text-[#5f5c56]">Open a call and use “Clip from here” on any transcript segment to build playlists of moments worth learning from.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {[...playlists.entries()].map(([name, snippets]) => (
        <section key={name} className={`${styles.panel} grid gap-2 p-4`}>
          <p className={styles.eyebrow}>{name} · {snippets.length} clip{snippets.length === 1 ? "" : "s"}</p>
          {snippets.map((snippet) => (
            <div key={snippet.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#e3dfd3] pt-2">
              <div className="grid gap-0.5">
                <strong className="text-sm">{snippet.title}</strong>
                <span className="text-xs text-[#5f5c56]">
                  {callTitle.get(snippet.callId) ?? "Call"} · {dealName.get(snippet.dealId) ?? "—"} · {formatTimestamp(snippet.start)}–{formatTimestamp(snippet.end)} · {snippet.createdBy}
                </span>
                {snippet.note ? <span className="text-sm">{snippet.note}</span> : null}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onOpenCall(snippet.callId, snippet.start)}>Open at {formatTimestamp(snippet.start)}</Button>
                {admin || snippet.createdBy === workspace.user.email ? (
                  <Button size="sm" variant="ghost" aria-label={`Remove ${snippet.title}`} onClick={() => setRemoving({ id: snippet.id, title: snippet.title })}><Trash2 /></Button>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ))}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove “{removing?.title}”?</DialogTitle>
            <DialogDescription>The call and transcript are not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void remove()}>Remove clip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Dashboard({ workspace }: { workspace: Workspace }) {
  const totalMinutes = workspace.repStats.reduce((sum, rep) => sum + rep.totalMinutes, 0);
  const competitorCalls = workspace.calls.filter((call) => call.analysis.competitorMentioned).length;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Calls logged", String(workspace.calls.length)],
          ["Minutes analysed", String(Math.round(totalMinutes))],
          ["Calls with a next step", workspace.calls.length ? percent(workspace.calls.filter((call) => call.analysis.nextSteps.length).length / workspace.calls.length) : "—"],
          ["Calls mentioning a competitor", String(competitorCalls)],
        ].map(([label, value]) => (
          <div key={label} className={`${styles.panel} p-4`}>
            <p className={styles.eyebrow}>{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      {workspace.repStats.length ? (
        <div className={`${styles.panel} overflow-x-auto`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Avg rep talk</TableHead>
                <TableHead>Avg longest monologue</TableHead>
                <TableHead>Questions / call</TableHead>
                <TableHead>Interactivity</TableHead>
                <TableHead>Next-step rate</TableHead>
                <TableHead>Avg score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.repStats.map((rep) => (
                <TableRow key={rep.repEmail}>
                  <TableCell className="font-semibold">{rep.repEmail}</TableCell>
                  <TableCell className={styles.mono}>{rep.calls}</TableCell>
                  <TableCell className={styles.mono}>{percent(rep.avgRepTalkRatio)}</TableCell>
                  <TableCell className={styles.mono}>{rep.avgLongestRepMonologueSeconds === null ? "—" : formatTimestamp(rep.avgLongestRepMonologueSeconds)}</TableCell>
                  <TableCell className={styles.mono}>{rep.avgQuestionsPerCall}</TableCell>
                  <TableCell className={styles.mono}>{rep.avgInteractivity}/10</TableCell>
                  <TableCell className={styles.mono}>{percent(rep.nextStepRate)}</TableCell>
                  <TableCell className={styles.mono}>{rep.avgScorePercent === null ? "—" : `${rep.avgScorePercent}% (${rep.scoredCalls})`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className={`${styles.panel} p-6 text-sm text-[#5f5c56]`}>
          The dashboard is computed only from calls logged in this workspace. Log a call to see rep statistics.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${styles.panel} grid gap-2 p-4`}>
          <p className={styles.eyebrow}>Metric definitions</p>
          {METRIC_DEFINITIONS.map((entry) => (
            <p key={entry.metric} className="text-sm"><strong>{entry.metric}:</strong> {entry.definition}</p>
          ))}
        </div>
        <div className={`${styles.panel} grid gap-2 p-4`}>
          <p className={styles.eyebrow}>Risk rules</p>
          {Object.entries(RISK_RULE_DEFINITIONS).map(([code, definition]) => (
            <p key={code} className="text-sm"><strong>{code.replaceAll("_", " ")}:</strong> {definition}</p>
          ))}
          <p className="text-xs text-[#5f5c56]">Stale threshold: {workspace.settings.staleAfterDays} days.</p>
        </div>
      </div>
    </div>
  );
}

function TrackersPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<{ id: string | null; name: string; kind: string; keywords: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [staleDays, setStaleDays] = useState(String(workspace.settings.staleAfterDays));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/revenue/tenants/${workspace.tenant.id}`;

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function saveTracker(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const body = JSON.stringify({ name: editing.name, kind: editing.kind, keywords: editing.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean) });
    const ok = await run(() => api(editing.id ? `${base}/trackers/${editing.id}` : `${base}/trackers`, { method: editing.id ? "PUT" : "POST", body }));
    if (ok) setEditing(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[#5f5c56]">Whole-word, case-insensitive phrase matching. Changes apply to new calls; use “Re-analyze” on a call to apply them retroactively.</p>
          {admin ? <Button onClick={() => setEditing({ id: null, name: "", kind: "keyword", keywords: "" })}><Plus /> New tracker</Button> : null}
        </div>
        {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
        {workspace.trackers.map((tracker) => (
          <div key={tracker.id} className={`${styles.panel} flex flex-wrap items-start justify-between gap-3 p-4`}>
            <div className="grid gap-1">
              <strong>{tracker.name} {tracker.kind === "competitor" ? <Badge variant="secondary">Competitor</Badge> : null}</strong>
              <div className="flex flex-wrap gap-1">{tracker.keywords.map((keyword) => <Badge key={keyword} variant="outline">{keyword}</Badge>)}</div>
            </div>
            {admin ? (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing({ id: tracker.id, name: tracker.name, kind: tracker.kind, keywords: tracker.keywords.join(", ") })}><Pencil /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setDeleting({ id: tracker.id, name: tracker.name })}><Trash2 /> Delete</Button>
              </div>
            ) : null}
          </div>
        ))}
        {!workspace.trackers.length ? <p className="text-sm text-[#5f5c56]">No trackers configured.</p> : null}
      </div>
      <div className="grid content-start gap-4">
        <div className={`${styles.panel} grid content-start gap-3 p-4`}>
          <p className={styles.eyebrow}>Risk settings</p>
          <Label htmlFor="stale-days">Flag deals with no call in (days)</Label>
          <Input id="stale-days" type="number" min={1} max={365} value={staleDays} disabled={!admin} onChange={(event) => setStaleDays(event.target.value)} />
          {admin ? (
            <Button disabled={pending || Number(staleDays) === workspace.settings.staleAfterDays} onClick={() => void run(() => api(`${base}/settings`, { method: "PUT", body: JSON.stringify({ staleAfterDays: Number(staleDays) }) }))}>
              Save threshold
            </Button>
          ) : <p className="text-xs text-[#5f5c56]">Owners and admins can change trackers, thresholds and retention.</p>}
        </div>
        <RetentionCard workspace={workspace} onChanged={onChanged} />
        <RubricCard workspace={workspace} onChanged={onChanged} />
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing ? (
            <form className="grid gap-4" onSubmit={saveTracker}>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Edit tracker" : "New tracker"}</DialogTitle>
                <DialogDescription>Competitor trackers raise a “competitor mentioned” risk on the deal.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2"><Label htmlFor="tr-name">Name</Label><Input id="tr-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} maxLength={60} /></div>
              <div className="grid gap-2">
                <Label>Kind</Label>
                <Select value={editing.kind} onValueChange={(kind) => setEditing({ ...editing, kind })}>
                  <SelectTrigger aria-label="Kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Keyword</SelectItem>
                    <SelectItem value="competitor">Competitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label htmlFor="tr-keywords">Keywords (comma-separated)</Label><Input id="tr-keywords" value={editing.keywords} onChange={(event) => setEditing({ ...editing, keywords: event.target.value })} placeholder="pricing, budget, discount" /></div>
              {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
              <DialogFooter><Button type="submit" disabled={pending}>Save tracker</Button></DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>Existing call analyses keep their hits until re-analyzed. This is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (deleting && (await run(() => api(`${base}/trackers/${deleting.id}`, { method: "DELETE" })))) setDeleting(null);
              }}
            >
              Delete tracker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RubricCard({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<Array<{ label: string; weight: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/settings`, {
        method: "PUT",
        body: JSON.stringify({ rubric: editing.map((row) => ({ label: row.label, weight: Number(row.weight) })) }),
      });
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${styles.panel} grid content-start gap-2 p-4`}>
      <p className={styles.eyebrow}>Scorecard rubric</p>
      {workspace.settings.rubric.map((criterion) => (
        <p key={criterion.id} className="text-sm">{criterion.label} <span className="text-[#5f5c56]">×{criterion.weight}</span></p>
      ))}
      <p className="text-xs text-[#5f5c56]">New scorecards use the current rubric; saved scorecards keep the rubric they were scored with.</p>
      {admin ? (
        <Button variant="outline" onClick={() => setEditing(workspace.settings.rubric.map((criterion) => ({ label: criterion.label, weight: String(criterion.weight) })))}>
          <Pencil /> Edit rubric
        </Button>
      ) : null}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit scorecard rubric</DialogTitle>
            <DialogDescription>Up to 10 criteria, each weighted 1–5. Calls are scored 1–5 per criterion.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-2">
              {editing.map((row, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_72px_auto] gap-2">
                  <Input aria-label={`Criterion ${i + 1}`} value={row.label} onChange={(event) => setEditing(editing.map((entry, j) => (j === i ? { ...entry, label: event.target.value } : entry)))} maxLength={160} />
                  <Input aria-label={`Weight ${i + 1}`} type="number" min={1} max={5} value={row.weight} onChange={(event) => setEditing(editing.map((entry, j) => (j === i ? { ...entry, weight: event.target.value } : entry)))} />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove criterion ${i + 1}`} disabled={editing.length === 1} onClick={() => setEditing(editing.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" disabled={editing.length >= 10} onClick={() => setEditing([...editing, { label: "", weight: "1" }])}><Plus /> Add criterion</Button>
            </div>
          ) : null}
          {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => void save()}>Save rubric</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RetentionCard({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const current = workspace.settings.retentionDays ?? null;
  const [days, setDays] = useState(current === null ? "" : String(current));
  const [preview, setPreview] = useState<{ retentionDays: number | null; calls: Array<{ id: string; title: string; occurredAt: string }> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/revenue/tenants/${workspace.tenant.id}`;
  const next = days.trim() === "" ? null : Number(days);

  async function act(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${styles.panel} grid content-start gap-3 p-4`}>
      <p className={styles.eyebrow}>Transcript retention</p>
      <p className="text-sm">{current === null ? "Calls are kept until deleted." : `Calls older than ${current} days are due for deletion.`}</p>
      {admin ? (
        <>
          <Label htmlFor="retention-days">Delete calls older than (days, blank = keep)</Label>
          <Input id="retention-days" type="number" min={7} max={3650} value={days} onChange={(event) => setDays(event.target.value)} />
          <Button
            variant="outline"
            disabled={pending || next === current}
            onClick={() => void act(async () => {
              await api(`${base}/settings`, { method: "PUT", body: JSON.stringify({ retentionDays: next }) });
              setPreview(null);
              onChanged();
            })}
          >
            Save retention
          </Button>
          <Button
            variant="outline"
            disabled={pending || current === null}
            onClick={() => void act(async () => setPreview(await api(`${base}/retention`)))}
          >
            Preview deletions
          </Button>
          {preview ? (
            <div className="grid gap-1 text-sm">
              <p><strong>{preview.calls.length}</strong> call{preview.calls.length === 1 ? "" : "s"} past retention.</p>
              {preview.calls.slice(0, 5).map((call) => <p key={call.id} className="text-xs">{shortDate(call.occurredAt)} · {call.title}</p>)}
              {preview.calls.length ? <Button variant="destructive" onClick={() => setConfirming(true)}><Trash2 /> Delete {preview.calls.length}</Button> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {message ? <p className="text-sm text-[#027a48]">{message}</p> : null}
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply retention now?</DialogTitle>
            <DialogDescription>
              {preview?.calls.length ?? 0} calls and their transcripts, comments and scorecards will be permanently deleted. The audit log records the call ids.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void act(async () => {
                const result = await api<{ deleted: number }>(`${base}/retention`, { method: "POST" });
                setConfirming(false);
                setPreview(null);
                setMessage(`Deleted ${result.deleted} call${result.deleted === 1 ? "" : "s"}.`);
                onChanged();
              })}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const INTEGRATIONS = [
  {
    name: "Transcript import",
    state: "Active",
    detail: "Paste or upload WebVTT, SRT or “Speaker: text” transcripts exported from any meeting tool. Every import requires a consent record.",
  },
  {
    name: "Meeting capture (Vexa adapter)",
    state: "Not configured",
    detail: "Automatic capture runs through a self-hosted Vexa deployment. No Vexa endpoint or API key is configured for this workspace, so Revenue never joins or records meetings.",
  },
  {
    name: "CRM sync (HubSpot / Salesforce)",
    state: "Not configured",
    detail: "No CRM connection exists. Each deal shows a field-by-field write preview with transcript evidence; writes will require approval once a connection is added.",
  },
];

function IntegrationsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {INTEGRATIONS.map((integration) => (
        <div key={integration.name} className={`${styles.panel} grid content-start gap-2 p-4`}>
          <div className="flex items-start justify-between gap-2">
            <strong>{integration.name}</strong>
            <Badge variant={integration.state === "Active" ? "default" : "outline"}>{integration.state}</Badge>
          </div>
          <p className="text-sm text-[#5f5c56]">{integration.detail}</p>
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("rep");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setDone(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
      setDone(`${email} now has ${ROLE_LABELS[role]} access.`);
      setEmail("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className={`${styles.panel} overflow-x-auto`}>
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
          <TableBody>
            {workspace.members.map((member) => (
              <TableRow key={member.uid}>
                <TableCell><div className="font-semibold">{member.name || member.email}</div><div className="text-xs text-[#5f5c56]">{member.email}</div></TableCell>
                <TableCell><Badge variant="outline">{ROLE_LABELS[member.role] ?? member.role}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid content-start gap-4">
        {admin ? (
          <form className={`${styles.panel} grid gap-3 p-4`} onSubmit={invite}>
            <p className={styles.eyebrow}><UserPlus className="inline size-3" /> Add a teammate</p>
            <Input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>{INVITABLE_ROLES.map((value) => <SelectItem key={value} value={value}>{ROLE_LABELS[value]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-[#5f5c56]">They need a SaaSassin Revenue account first.</p>
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            {done ? <p className="text-sm text-[#027a48]">{done}</p> : null}
            <Button type="submit" disabled={pending || !email}>Grant access</Button>
          </form>
        ) : null}
        <div className={`${styles.panel} grid gap-1 p-4 text-sm`}>
          <p className={styles.eyebrow}>Roles</p>
          <p><strong>Owner / Admin:</strong> everything, including trackers, members, export, reopening closed deals.</p>
          <p><strong>Manager:</strong> log calls, score calls, redact transcripts, read audit.</p>
          <p><strong>Rep:</strong> accounts, deals, calls and comments.</p>
          <p><strong>Viewer:</strong> read-only.</p>
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ tenantId }: { tenantId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ events: AuditEvent[] }>(`/api/revenue/tenants/${tenantId}/audit`)
      .then((result) => !cancelled && setEvents(result.events))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);
  if (error) return <Alert variant="destructive"><AlertTitle>Audit log unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!events) return <Skeleton className="h-64 w-full" />;
  return (
    <div className={`${styles.panel} overflow-x-auto`}>
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="text-xs">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : "—"}</TableCell>
              <TableCell className="text-xs">{event.actor?.email}</TableCell>
              <TableCell><Badge variant="outline">{event.action}</Badge></TableCell>
              <TableCell className={`${styles.mono} max-w-md truncate text-xs`}>{JSON.stringify(event.details)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
