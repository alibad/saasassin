"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Cable, ClipboardList, Clock, Download, FileText, History, Mic, Pencil, Plus, Radar, ShieldAlert, Trash2, Webhook } from "lucide-react";

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
import { canCoach, isAdmin } from "@/lib/revenue/schemas";
import { cn } from "@/lib/utils";

import { api, shortDate, type Workspace } from "./client";
import { PersonChip } from "./people";
import { RetentionQueue } from "./retention-queue";
import { ErrorText, PageHeader, Panel, PanelHeader, SuccessText } from "./ui";
import { WebhooksPanel } from "./webhooks-panel";

const TABS = ["general", "trackers", "retention", "integrations", "data"] as const;

export function SettingsView({
  workspace,
  tab,
  onTab,
  onChanged,
  onOpenCall,
}: {
  workspace: Workspace;
  tab?: string;
  onTab: (tab: string) => void;
  onChanged: () => void;
  onOpenCall: (id: string, at?: number | null) => void;
}) {
  const admin = isAdmin(workspace.role);
  const current = (TABS as readonly string[]).includes(tab ?? "") ? tab! : "general";
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Settings"
        description={admin ? `How ${workspace.tenant.name} measures calls, flags deals and keeps data.` : "How this workspace measures calls and flags deals. Owners and admins can change these."}
      />
      {admin && workspace.retentionDueCount ? (
        <Alert>
          <Clock />
          <AlertTitle>{workspace.retentionDueCount} call{workspace.retentionDueCount === 1 ? " is" : "s are"} past your retention period</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Nothing is deleted until an owner or admin applies retention.
            <Button size="sm" variant="outline" onClick={() => onTab("retention")}>Review</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs value={current} onValueChange={onTab} className="gap-5">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="general">Deal rules &amp; scoring</TabsTrigger>
            <TabsTrigger value="trackers">Trackers</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data &amp; activity</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general">
          <div className="grid gap-6 lg:grid-cols-2">
            <RiskSettings workspace={workspace} onChanged={onChanged} />
            <RubricCard workspace={workspace} onChanged={onChanged} />
          </div>
        </TabsContent>
        <TabsContent value="trackers"><TrackersPanel workspace={workspace} onChanged={onChanged} /></TabsContent>
        <TabsContent value="retention">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {admin && current === "retention" ? (
              <RetentionQueue key={String(workspace.settings.retentionDays ?? "keep")} tenantId={workspace.tenant.id} onChanged={onChanged} onOpenCall={(id) => onOpenCall(id)} />
            ) : (
              <Panel className="p-4 text-sm text-muted-foreground">Owners and admins review and apply retention.</Panel>
            )}
            <RetentionCard workspace={workspace} onChanged={onChanged} />
          </div>
        </TabsContent>
        <TabsContent value="integrations">
          <div className="grid gap-6">
            <IntegrationsPanel />
            {admin ? (current === "integrations" ? <WebhooksPanel tenantId={workspace.tenant.id} /> : null) : (
              <Panel className="p-4 text-sm text-muted-foreground">Owners and admins manage webhooks that send call and deal events to your other tools.</Panel>
            )}
          </div>
        </TabsContent>
        <TabsContent value="data">
          <div className="grid gap-6">
            <Panel>
              <PanelHeader title="Export everything" icon={Download} description="Accounts, deals, contacts, calls with transcripts and analysis, comments, scorecards and settings, as one JSON file." />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-muted-foreground">Your data is yours. Take it to a spreadsheet, a warehouse or another tool whenever you like.</p>
                {admin ? (
                  <Button asChild variant="outline"><a href={`/api/revenue/tenants/${workspace.tenant.id}/export`} download><Download /> Download export</a></Button>
                ) : <span className="text-sm text-muted-foreground">Owners and admins can export.</span>}
              </div>
            </Panel>
            {canCoach(workspace.role) && current === "data" ? <AuditPanel tenantId={workspace.tenant.id} /> : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RiskSettings({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [staleDays, setStaleDays] = useState(String(workspace.settings.staleAfterDays));
  const stalledNow = workspace.settings.stalledAfterDays ?? 30;
  const [stalledDays, setStalledDays] = useState(String(stalledNow));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(body: Record<string, number>, label: string) {
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/settings`, { method: "PUT", body: JSON.stringify(body) });
      setSaved(label);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Deal risk rules" icon={ShieldAlert} description="When a deal is flagged as gone quiet or stalled." />
      <div className="grid gap-5 p-4">
        <div className="grid gap-2">
          <Label htmlFor="stale-days">Flag a deal as gone quiet after this many days without a call</Label>
          <div className="flex gap-2">
            <Input id="stale-days" type="number" min={1} max={365} value={staleDays} disabled={!admin} onChange={(event) => setStaleDays(event.target.value)} className="w-28" />
            {admin ? <Button variant="outline" disabled={pending || Number(staleDays) === workspace.settings.staleAfterDays} onClick={() => void save({ staleAfterDays: Number(staleDays) }, "Gone-quiet rule saved.")}>Save</Button> : null}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="stalled-days">Flag a deal as stalled after this many days in one stage</Label>
          <div className="flex gap-2">
            <Input id="stalled-days" type="number" min={1} max={365} value={stalledDays} disabled={!admin} onChange={(event) => setStalledDays(event.target.value)} className="w-28" />
            {admin ? <Button variant="outline" disabled={pending || Number(stalledDays) === stalledNow} onClick={() => void save({ stalledAfterDays: Number(stalledDays) }, "Stalled rule saved.")}>Save</Button> : null}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <SuccessText>{saved}</SuccessText>
      </div>
    </Panel>
  );
}

function TrackersPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<{ id: string | null; name: string; kind: string; keywords: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/revenue/tenants/${workspace.tenant.id}`;
  const callsWith = new Map<string, number>();
  for (const call of workspace.calls) for (const entry of call.analysis.trackerSummary) callsWith.set(entry.trackerId, (callsWith.get(entry.trackerId) ?? 0) + 1);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
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
    <Panel>
      <PanelHeader
        title="Trackers"
        icon={Radar}
        description="Words and phrases to spot on every call, matched as whole words regardless of case. Changes apply to new calls; re-analyze a call to apply them to it."
        actions={admin ? <Button size="sm" onClick={() => setEditing({ id: null, name: "", kind: "keyword", keywords: "" })}><Plus /> New tracker</Button> : null}
      />
      <ErrorText>{error}</ErrorText>
      {workspace.trackers.length ? (
        <ul className="divide-y divide-border">
          {workspace.trackers.map((tracker) => (
            <li key={tracker.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="grid gap-1.5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {tracker.name}
                  {tracker.kind === "competitor" ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.7rem] font-medium text-destructive">Competitor</span> : null}
                  <span className="text-xs font-normal text-muted-foreground">on {callsWith.get(tracker.id) ?? 0} call{callsWith.get(tracker.id) === 1 ? "" : "s"}</span>
                </p>
                <div className="flex flex-wrap gap-1">{tracker.keywords.map((keyword) => <Badge key={keyword} variant="secondary">{keyword}</Badge>)}</div>
              </div>
              {admin ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: tracker.id, name: tracker.name, kind: tracker.kind, keywords: tracker.keywords.join(", ") })}><Pencil /> Edit</Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${tracker.name}`} onClick={() => setDeleting({ id: tracker.id, name: tracker.name })}><Trash2 /></Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-6 text-sm text-muted-foreground">No trackers yet. Add your competitors and the topics you want to hear about.</p>}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing ? (
            <form className="grid gap-4" onSubmit={saveTracker}>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Edit tracker" : "New tracker"}</DialogTitle>
                <DialogDescription>Competitor trackers raise a “competitor mentioned” signal on the deal.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2"><Label htmlFor="tr-name">Name</Label><Input id="tr-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} maxLength={60} /></div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={editing.kind} onValueChange={(kind) => setEditing({ ...editing, kind })}>
                  <SelectTrigger aria-label="Type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Topic</SelectItem>
                    <SelectItem value="competitor">Competitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label htmlFor="tr-keywords">Words and phrases, separated by commas</Label><Input id="tr-keywords" value={editing.keywords} onChange={(event) => setEditing({ ...editing, keywords: event.target.value })} placeholder="pricing, budget, discount" /></div>
              <ErrorText>{error}</ErrorText>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={pending}>Save tracker</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>Calls already analysed keep their matches until they&apos;re re-analysed.</DialogDescription>
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
    </Panel>
  );
}

function RubricCard({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const [editing, setEditing] = useState<Array<{ label: string; weight: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const totalWeight = workspace.settings.rubric.reduce((sum, criterion) => sum + criterion.weight, 0) || 1;

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
      setError(err instanceof Error ? err.message : "The rubric wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Call scorecard"
        icon={ClipboardList}
        description="What managers score each call on. Saved scorecards keep the rubric they were scored with."
        actions={admin ? <Button size="sm" variant="outline" onClick={() => setEditing(workspace.settings.rubric.map((criterion) => ({ label: criterion.label, weight: String(criterion.weight) })))}><Pencil /> Edit</Button> : null}
      />
      <ul className="grid gap-3 p-4">
        {workspace.settings.rubric.map((criterion) => (
          <li key={criterion.id} className="grid gap-1">
            <span className="flex items-baseline justify-between gap-3 text-sm"><span>{criterion.label}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">weight {criterion.weight}</span></span>
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-brand-accent" style={{ width: `${(criterion.weight / totalWeight) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit the scorecard</DialogTitle>
            <DialogDescription>Up to 10 criteria, each weighted 1 to 5. Calls are scored 1 to 5 on each.</DialogDescription>
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
              <Button type="button" variant="outline" className="w-fit" disabled={editing.length >= 10} onClick={() => setEditing([...editing, { label: "", weight: "1" }])}><Plus /> Add criterion</Button>
            </div>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => void save()}>Save scorecard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function RetentionCard({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  const admin = isAdmin(workspace.role);
  const current = workspace.settings.retentionDays ?? null;
  const [days, setDays] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = days.trim() === "" ? null : Number(days);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/settings`, { method: "PUT", body: JSON.stringify({ retentionDays: next }) });
      setSaved(next === null ? "Calls are now kept until someone deletes them." : `Calls older than ${next} days will be listed for deletion.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="h-fit">
      <PanelHeader title="Transcript retention" icon={Clock} description={current === null ? "Calls are kept until someone deletes them." : `Calls older than ${current} days are due for deletion.`} />
      {admin ? (
        <div className="grid gap-2 p-4">
          <Label htmlFor="retention-days">Delete calls older than (days). Leave blank to keep them.</Label>
          <div className="flex gap-2">
            <Input id="retention-days" type="number" min={7} max={3650} value={days} onChange={(event) => setDays(event.target.value)} className="w-28" />
            <Button variant="outline" disabled={pending || next === current} onClick={() => void save()}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">Nothing is ever deleted automatically. Due calls are listed for an owner or admin to review and delete.</p>
          <ErrorText>{error}</ErrorText>
          <SuccessText>{saved}</SuccessText>
        </div>
      ) : null}
    </Panel>
  );
}

const INTEGRATIONS = [
  {
    name: "Transcript import",
    icon: FileText,
    state: "On",
    detail: "Paste or upload VTT, SRT or “Speaker: text” transcripts from Zoom, Google Meet, Teams or any recorder. Every call carries a consent record.",
  },
  {
    name: "Meeting recorder",
    icon: Mic,
    state: "Not connected",
    detail: "Revenue doesn't join or record meetings for you yet. Connecting a recorder you host will bring calls in automatically; until then, log them from transcripts.",
  },
  {
    name: "CRM sync",
    icon: Cable,
    state: "Not connected",
    detail: "HubSpot and Salesforce aren't connected. Each deal already shows exactly what a sync would write, with the transcript evidence, and writes will need approval.",
  },
  {
    name: "Webhooks",
    icon: Webhook,
    state: "On",
    detail: "Signed events when a call is analysed or a deal changes stage, sent to your own HTTPS endpoints with a delivery log.",
  },
];

function IntegrationsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {INTEGRATIONS.map((integration) => (
        <Panel key={integration.name} className="grid content-start gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><integration.icon className="size-4" aria-hidden="true" /></span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", integration.state === "On" ? "bg-chart-3/15 text-foreground" : "bg-muted text-muted-foreground")}>
              {integration.state === "On" ? <span className="mr-1 inline-block size-1.5 rounded-full bg-chart-3 align-middle" aria-hidden="true" /> : null}{integration.state}
            </span>
          </div>
          <p className="font-semibold">{integration.name}</p>
          <p className="text-sm text-muted-foreground">{integration.detail}</p>
        </Panel>
      ))}
    </div>
  );
}

type AuditEvent = { id: string; action: string; actor: { email: string }; target: { type: string; id: string }; details: Record<string, unknown>; occurredAt: string | null };

const ACTION_LABELS: Record<string, string> = {
  "workspace.seeded": "Set up default trackers",
  "account.created": "Added an account",
  "deal.created": "Created a deal",
  "deal.updated": "Updated a deal",
  "deal.stage_changed": "Moved a deal",
  "deal.forecast_called": "Called a forecast",
  "deal.forecast_overridden": "Overrode a forecast",
  "deal.forecast_override_cleared": "Cleared a forecast override",
  "call.logged": "Logged a call",
  "call.reanalyzed": "Re-analysed a call",
  "call.redacted": "Redacted a transcript",
  "call.deleted": "Deleted a call",
  "call.commented": "Commented on a call",
  "call.scored": "Scored a call",
  "call.speaker_linked": "Linked a speaker",
  "call.speaker_unlinked": "Unlinked a speaker",
  "snippet.created": "Saved a clip",
  "snippet.deleted": "Removed a clip",
  "coaching.assigned": "Assigned coaching",
  "coaching.acknowledged": "Reviewed a coaching assignment",
  "contact.created": "Added a contact",
  "contact.updated": "Updated a contact",
  "contact.deleted": "Removed a contact",
  "contact.deal_role_set": "Set a contact's deal role",
  "tracker.created": "Added a tracker",
  "tracker.updated": "Edited a tracker",
  "tracker.deleted": "Deleted a tracker",
  "settings.updated": "Changed settings",
  "retention.applied": "Applied retention",
  "webhook.created": "Added a webhook",
  "webhook.enabled": "Turned a webhook on",
  "webhook.disabled": "Paused a webhook",
  "webhook.tested": "Sent a test webhook",
  "webhook.deleted": "Deleted a webhook",
  "workspace.exported": "Exported the workspace",
  "tenant.created": "Created the workspace",
  "membership.granted": "Added a teammate",
  "membership.role_changed": "Changed a role",
  "membership.removed": "Removed a teammate",
  "membership.left": "Left the workspace",
  "invitation.created": "Invited a teammate",
  "invitation.resent": "Resent an invitation",
  "invitation.revoked": "Revoked an invitation",
  "invitation.accepted": "Joined by invitation",
  "ownership.transferred": "Transferred ownership",
};

function describe(event: AuditEvent) {
  const details = event.details ?? {};
  const name = typeof details.name === "string" ? details.name : typeof details.title === "string" ? details.title : null;
  const stage = details.stage as { from?: string; to?: string } | undefined;
  if (stage && typeof stage === "object" && stage.to) return `${String(stage.from ?? "").replaceAll("_", " ")} → ${String(stage.to).replaceAll("_", " ")}`;
  return name ?? "";
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
  if (error) return <Alert variant="destructive"><AlertTitle>The activity log isn&apos;t available</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!events) return <Skeleton className="h-64 w-full" />;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Activity log" icon={History} description="Every change in this workspace: who, what and when. Visible to managers, admins and owners." />
      <Table>
        <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="pl-4">When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead className="pr-4">Detail</TableHead></TableRow></TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">{event.occurredAt ? `${shortDate(event.occurredAt)} · ${new Date(event.occurredAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "—"}</TableCell>
              <TableCell><PersonChip email={event.actor?.email} size="sm" /></TableCell>
              <TableCell className="text-sm">{ACTION_LABELS[event.action] ?? event.action.replaceAll(".", " ").replaceAll("_", " ")}</TableCell>
              <TableCell className="max-w-md truncate pr-4 text-sm text-muted-foreground">{describe(event)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
