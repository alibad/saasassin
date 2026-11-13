"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  Gavel,
  Highlighter,
  History,
  Lightbulb,
  LoaderCircle,
  Lock,
  MailPlus,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { readableAuthError } from "@/components/account/auth-errors";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "@/components/account/client";
import { TeamPanel } from "@/components/account/team-panel";
import { acceptPendingInvitation } from "@/components/account/workspace-switcher";
import { ResearchMark } from "@/brands/research/mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { canEdit, canManage, type Project, type ResearchRole } from "@/lib/research/model";

import { api, errorMessage, formatDateTime } from "./api";
import { AvatarStack, Byline, PeopleProvider, PersonAvatar, PersonName, relativeTime, type ResearchPerson } from "./people";
import { ProjectView } from "./project-view";
import { EmptyState, PageHeader, WorkspaceShell, type ResearchView } from "./workspace-shell";

type ProjectStats = { interviews: number; highlights: number; insights: number; contributors: string[]; lastActivityAt: string | null };
type AuditEvent = {
  id: string;
  action: string;
  actor: { uid: string; email: string };
  target: { type: string; id: string };
  details: Record<string, unknown>;
  occurredAt: string | null;
};
type Workspace = {
  tenant: { id: string; name: string };
  role: ResearchRole;
  roleLabel: string;
  projects: Project[];
  projectStats: Record<string, ProjectStats>;
  members: ResearchPerson[];
  audit: AuditEvent[];
};

type RetentionItem = {
  sourceId: string;
  projectId: string;
  projectName: string;
  title: string;
  participant: string;
  consentStatus: string;
  retentionUntil: string;
  reason: "expired" | "withdrawn" | "soon" | "pending";
};
type RetentionRunEntry = { sourceId: string; projectId: string; title: string; retentionUntil: string; reason: "retention_expired" | "consent_withdrawn" };
type RetentionRun = { dryRun: boolean; toDelete: RetentionRunEntry[]; held: RetentionRunEntry[]; deleted: number };

const VIEWS: ResearchView[] = ["projects", "project", "consent", "activity", "team", "export"];
const LAST_WORKSPACE_KEY = "research:last-workspace";

function readLastWorkspace() {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function rememberWorkspace(id: string) {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, id);
  } catch {
    /* private mode: the URL still carries the workspace */
  }
}

type Location = { workspace?: string | null; view?: ResearchView; project?: string | null; interview?: string | null };

/** Workspace, page, project and interview live in the URL, so links and the back button work. */
function writeLocation(next: Location, mode: "push" | "replace" = "push") {
  const params = new URLSearchParams();
  if (next.workspace) params.set("workspace", next.workspace);
  const view = next.view ?? "projects";
  if (view !== "projects") params.set("view", view);
  if (view === "project" && next.project) params.set("project", next.project);
  if (view === "project" && next.interview) params.set("interview", next.interview);
  const query = params.toString();
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", query ? `?${query}` : window.location.pathname);
  if (mode === "push") window.scrollTo({ top: 0 });
}

export function ResearchApp({ userEmail }: { userEmail: string }) {
  const params = useSearchParams();
  const account = useAccount("research");
  const workspaces = useMemo(() => account.data?.workspaces ?? [], [account.data]);
  const viewerUid = account.data?.profile.uid ?? null;

  const urlWorkspace = params.get("workspace");
  const urlView = params.get("view");
  const view: ResearchView = VIEWS.includes(urlView as ResearchView) ? (urlView as ResearchView) : params.get("project") ? "project" : "projects";
  const projectId = view === "project" ? params.get("project") : null;
  const interviewId = view === "project" ? params.get("interview") : null;

  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRemembered(readLastWorkspace());
  }, []);

  const known = (id: string | null) => (id && workspaces.some((workspace) => workspace.id === id) ? id : null);
  const tenantId = known(urlWorkspace) ?? known(remembered) ?? workspaces[0]?.id ?? null;

  // A workspace in the URL we don't know yet (an invitation just accepted): refresh the account once.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!urlWorkspace || account.loading || known(urlWorkspace) || refreshedFor.current === urlWorkspace) return;
    refreshedFor.current = urlWorkspace;
    void account.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once per unknown id
  }, [urlWorkspace, account.loading, workspaces]);

  useEffect(() => {
    if (tenantId) rememberWorkspace(tenantId);
  }, [tenantId]);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      const next = await api<Workspace>(`/api/research/tenants/${id}`);
      setWorkspace(next);
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    api<Workspace>(`/api/research/tenants/${tenantId}`)
      .then((next) => {
        if (!active) return;
        setWorkspace(next);
        setLoadError(null);
      })
      .catch((caught) => { if (active) setLoadError(errorMessage(caught)); });
    return () => { active = false; };
  }, [tenantId]);

  const current = workspace && workspace.tenant.id === tenantId ? workspace : null;

  const go = useCallback((next: Omit<Location, "workspace">, mode: "push" | "replace" = "push") => {
    writeLocation({ ...next, workspace: tenantId }, mode);
  }, [tenantId]);

  function switchWorkspace(id: string) {
    rememberWorkspace(id);
    setRemembered(id);
    writeLocation({ workspace: id, view: "projects" });
  }

  const projectsForNav = (current?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    interviews: current?.projectStats[project.id]?.interviews ?? 0,
  }));

  const shell = (children: React.ReactNode) => (
    <WorkspaceShell
      tenantId={tenantId}
      view={view}
      projects={projectsForNav}
      activeProjectId={projectId}
      canCreateProject={current ? canEdit(current.role) : false}
      onNavigate={(next) => go({ view: next })}
      onOpenProject={(id) => go({ view: "project", project: id })}
      onNewProject={() => setNewProjectOpen(true)}
      onSwitchWorkspace={switchWorkspace}
    >
      <PeopleProvider people={current?.members ?? []} viewerUid={viewerUid}>
        {children}
      </PeopleProvider>
      {tenantId ? (
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          tenantId={tenantId}
          onCreated={async (id) => {
            setNewProjectOpen(false);
            await loadWorkspace(tenantId);
            go({ view: "project", project: id });
          }}
        />
      ) : null}
    </WorkspaceShell>
  );

  if (account.loading && !account.data) {
    return shell(<div className="grid gap-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-48 w-full" /></div>);
  }

  if (!tenantId) {
    return <FirstWorkspace email={account.data?.profile.email ?? userEmail} onCreated={switchWorkspace} />;
  }

  if (loadError && !current) {
    return shell(
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          {loadError}
          <Button size="sm" variant="outline" onClick={() => void loadWorkspace(tenantId)}>Try again</Button>
        </AlertDescription>
      </Alert>,
    );
  }

  if (!current) {
    return shell(<div className="grid gap-4"><Skeleton className="h-12 w-72" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></div>);
  }

  const reload = () => loadWorkspace(tenantId);

  if (view === "project" && projectId) {
    return shell(
      <ProjectView
        key={projectId}
        tenantId={tenantId}
        projectId={projectId}
        initialSourceId={interviewId}
        members={current.members}
        onSourceChange={(sourceId) => go({ view: "project", project: projectId, interview: sourceId }, "replace")}
        onBack={() => { go({ view: "projects" }); void reload(); }}
      />,
    );
  }

  if (view === "consent") {
    return shell(<ConsentView tenantId={tenantId} role={current.role} onOpen={(project, interview) => go({ view: "project", project, interview })} onChanged={reload} />);
  }

  if (view === "activity") {
    return shell(<ActivityView workspace={current} onRefresh={reload} />);
  }

  if (view === "team") {
    return shell(
      <>
        <PageHeader kicker="Team" title={current.tenant.name} description="Invite researchers to add interviews and write insights, or viewers to read and search. People without an account can join from their invitation link." />
        <TeamPanel product="research" productName="Research" tenantId={tenantId} onLeft={() => { void refreshAccount("research").then(() => writeLocation({ view: "projects" })); }} />
      </>,
    );
  }

  if (view === "export") {
    return shell(<ExportView workspace={current} tenantId={tenantId} />);
  }

  return shell(<ProjectsHome workspace={current} onOpen={(id) => go({ view: "project", project: id })} onNew={() => setNewProjectOpen(true)} />);
}

/* ---------------------------------------------------------------------------------------- */
/* First run                                                                                 */
/* ---------------------------------------------------------------------------------------- */

function FirstWorkspace({ email, onCreated }: { email: string; onCreated: (tenantId: string) => void }) {
  const { data } = useAccount("research");
  const invitations = data?.pendingInvitations ?? [];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase("research")}/tenants`, { method: "POST", json: { name: name.trim() } });
      await refreshAccount("research");
      onCreated(tenant.id);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 py-12 text-foreground">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-2">
          <ResearchMark size={30} />
          <span className="font-heading text-2xl">Research</span>
        </div>
        <h1 className="brand-heading text-4xl leading-tight">Start your research repository</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          A workspace keeps your team&apos;s interviews, consent records, highlights and insights together. Only people you invite can open it.
        </p>
        {invitations.length ? (
          <div className="mt-8 grid gap-2">
            <p className="text-sm font-semibold">You&apos;ve been invited</p>
            {invitations.map((invitation) => (
              <div key={invitation.invitationId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <MailPlus className="size-4 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{invitation.workspaceName}</span>
                  <span className="block text-xs text-muted-foreground">{invitation.roleLabel}{invitation.invitedByName ? ` · from ${invitation.invitedByName}` : ""}</span>
                </span>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(invitation.invitationId);
                    setError(null);
                    try {
                      await acceptPendingInvitation("research", invitation);
                      onCreated(invitation.tenantId);
                    } catch (caught) {
                      setError(readableAuthError(caught));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === invitation.invitationId ? <LoaderCircle className="animate-spin" /> : null} Join
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <form className="mt-8 grid gap-3 rounded-lg border border-border bg-card p-5 shadow-xs" onSubmit={create}>
          <Label htmlFor="workspace-name">{invitations.length ? "Or name a new workspace" : "Name your workspace"}</Label>
          <Input id="workspace-name" value={name} placeholder="Acme product research" onChange={(event) => setName(event.target.value)} />
          <Button type="submit" disabled={busy !== null || name.trim().length < 2}>
            {busy === "create" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace
          </Button>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <p className="text-xs text-muted-foreground">Signed in as {email}.</p>
        </form>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Projects                                                                                  */
/* ---------------------------------------------------------------------------------------- */

function NewProjectDialog({ open, onOpenChange, tenantId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; tenantId: string; onCreated: (id: string) => Promise<void> | void }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await api<{ project: { id: string } }>(`/api/research/tenants/${tenantId}/projects`, { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", description: "" });
      await onCreated(project.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>One project per research question. Add interviews to it next.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input id="project-name" autoFocus value={form.name} placeholder="Checkout friction" onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-question">Research question</Label>
            <Textarea id="project-question" rows={3} value={form.description} placeholder="Why do teams abandon a booking at the payment step?" onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || form.name.trim().length < 2}>{busy ? <LoaderCircle className="animate-spin" /> : <FolderPlus />} Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof FileText; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ProjectsHome({ workspace, onOpen, onNew }: { workspace: Workspace; onOpen: (id: string) => void; onNew: () => void }) {
  const editable = canEdit(workspace.role);
  const totals = Object.values(workspace.projectStats).reduce(
    (sum, stats) => ({ interviews: sum.interviews + stats.interviews, highlights: sum.highlights + stats.highlights, insights: sum.insights + stats.insights }),
    { interviews: 0, highlights: 0, insights: 0 },
  );
  const projects = [...workspace.projects].sort((a, b) =>
    (workspace.projectStats[b.id]?.lastActivityAt ?? b.createdAt ?? "").localeCompare(workspace.projectStats[a.id]?.lastActivityAt ?? a.createdAt ?? ""));

  return (
    <>
      <PageHeader
        kicker={workspace.tenant.name}
        title="Projects"
        description={workspace.projects.length
          ? `${totals.interviews} interviews, ${totals.highlights} highlights and ${totals.insights} insights across ${workspace.projects.length} ${workspace.projects.length === 1 ? "project" : "projects"}.`
          : "Each project gathers the interviews, highlights and insights behind one research question."}
        actions={editable ? <Button onClick={onNew}><Plus /> New project</Button> : <Badge variant="secondary">{workspace.roleLabel} access</Badge>}
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Open your first project"
          action={editable ? <Button onClick={onNew}><Plus /> New project</Button> : null}
        >
          {editable
            ? "Name the question you are trying to answer, then add the interviews that speak to it. Highlights and insights follow from there."
            : "Projects your team creates will appear here for you to read and search."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const stats = workspace.projectStats[project.id] ?? { interviews: 0, highlights: 0, insights: 0, contributors: [], lastActivityAt: null };
            const people = stats.contributors.length ? stats.contributors : project.createdBy ? [project.createdBy] : [];
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onOpen(project.id)}
                  className="group flex h-full w-full flex-col rounded-lg border border-border bg-card p-5 text-left shadow-xs transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="brand-heading text-[1.35rem] leading-snug break-words group-hover:text-primary">{project.name}</span>
                    <ArrowRight className="mt-1.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  </span>
                  {project.description ? (
                    <span className="mt-2 line-clamp-3 font-heading text-[15px] leading-relaxed text-muted-foreground italic">{project.description}</span>
                  ) : null}
                  <span className="mt-5 mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <Stat icon={FileText} value={stats.interviews} label={stats.interviews === 1 ? "interview" : "interviews"} />
                    <Stat icon={Highlighter} value={stats.highlights} label={stats.highlights === 1 ? "highlight" : "highlights"} />
                    <Stat icon={Lightbulb} value={stats.insights} label={stats.insights === 1 ? "insight" : "insights"} />
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                    {people.length ? <AvatarStack uids={people} /> : <span />}
                    <span>Updated {relativeTime(stats.lastActivityAt ?? project.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Consent & retention                                                                       */
/* ---------------------------------------------------------------------------------------- */

const RETENTION_REASON: Record<RetentionItem["reason"], { label: string; tone: "destructive" | "secondary" | "outline" }> = {
  expired: { label: "Retention date passed", tone: "destructive" },
  withdrawn: { label: "Consent withdrawn", tone: "destructive" },
  soon: { label: "Retention ends soon", tone: "secondary" },
  pending: { label: "Consent not confirmed", tone: "outline" },
};

function ConsentView({ tenantId, role, onOpen, onChanged }: { tenantId: string; role: ResearchRole; onOpen: (projectId: string, sourceId: string) => void; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<RetentionItem[] | null>(null);
  const [plan, setPlan] = useState<RetentionRun | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manageable = canManage(role);

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: RetentionItem[] }>(`/api/research/tenants/${tenantId}/retention`);
      setItems(response.items);
    } catch (caught) {
      setError(errorMessage(caught));
      setItems([]);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    api<{ items: RetentionItem[] }>(`/api/research/tenants/${tenantId}/retention`)
      .then((response) => { if (active) setItems(response.items); })
      .catch((caught) => { if (active) { setError(errorMessage(caught)); setItems([]); } });
    return () => { active = false; };
  }, [tenantId]);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<RetentionRun>(`/api/research/tenants/${tenantId}/retention`, { method: "POST", body: JSON.stringify({ dryRun }) });
      setPlan(result);
      if (!dryRun) {
        await load();
        await onChanged();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const due = (items ?? []).filter((item) => item.reason === "expired" || item.reason === "withdrawn").length;

  return (
    <>
      <PageHeader
        title="Consent & retention"
        description="Interviews that need a consent or retention decision, across every project. Interviews under legal hold are never deleted."
        actions={manageable ? (
          <>
            <Button variant="outline" disabled={busy} onClick={() => run(true)}>{busy ? <LoaderCircle className="animate-spin" /> : <CalendarClock />} Preview retention run</Button>
            <Button variant="destructive" disabled={busy || !plan || plan.toDelete.length === 0} onClick={() => setConfirmOpen(true)}>Apply retention</Button>
          </>
        ) : null}
      />
      {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {plan ? (
        <div className="mb-6 rounded-lg border border-border bg-card p-5">
          <p className="font-medium">
            {plan.dryRun ? "This run would delete" : "Deleted"} {plan.dryRun ? plan.toDelete.length : plan.deleted} {plan.toDelete.length === 1 ? "interview" : "interviews"}
            {plan.held.length ? `, and keep ${plan.held.length} under legal hold` : ""}.
          </p>
          {plan.toDelete.length || plan.held.length ? (
            <ul className="mt-3 grid gap-1.5 text-sm">
              {plan.toDelete.map((entry) => (
                <li key={entry.sourceId} className="flex flex-wrap items-center gap-2"><FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />{entry.title}<span className="text-muted-foreground">— {entry.reason === "consent_withdrawn" ? "consent withdrawn" : `retention ended ${entry.retentionUntil}`}</span></li>
              ))}
              {plan.held.map((entry) => (
                <li key={entry.sourceId} className="flex flex-wrap items-center gap-2"><Gavel className="size-3.5 text-muted-foreground" aria-hidden="true" />{entry.title}<span className="text-muted-foreground">— kept, under legal hold</span></li>
              ))}
            </ul>
          ) : null}
          {plan.dryRun ? <p className="mt-3 text-sm text-muted-foreground">Nothing has been deleted. Apply the run to delete these interviews; each deletion is recorded in Activity with its reason.</p> : null}
        </div>
      ) : null}

      {items === null ? <Skeleton className="h-40 w-full" /> : null}
      {items && items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Everything is in order">
          Every interview has confirmed consent, and no retention date has passed or is coming up in the next 30 days.
        </EmptyState>
      ) : null}
      {items && items.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
            <span className="font-medium">{items.length} {items.length === 1 ? "interview needs" : "interviews need"} a decision</span>
            {due ? <Badge variant="destructive">{due} due now</Badge> : null}
          </div>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.sourceId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{item.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {item.projectName} · {item.participant || "Unnamed participant"}{item.retentionUntil ? ` · retain until ${item.retentionUntil}` : ""}
                  </span>
                </span>
                <Badge variant={RETENTION_REASON[item.reason].tone}>{RETENTION_REASON[item.reason].label}</Badge>
                <Button size="sm" variant="outline" onClick={() => onOpen(item.projectId, item.sourceId)}>Open interview</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!manageable ? <p className="mt-4 text-sm text-muted-foreground">Owners and admins run retention. You can open each interview to update its consent details.</p> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plan?.toDelete.length ?? 0} {plan?.toDelete.length === 1 ? "interview" : "interviews"} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Their transcripts, highlights and the evidence links to them are deleted. Interviews under legal hold are skipped. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void run(false)}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Activity                                                                                  */
/* ---------------------------------------------------------------------------------------- */

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Researcher", viewer: "Viewer" };

function quoted(value: unknown) {
  return typeof value === "string" && value ? `“${value}”` : "";
}

/** One readable sentence per audit event. Never shows redacted words: the log does not hold them. */
function describeEvent(event: AuditEvent, projectName: (id: unknown) => string) {
  const d = event.details;
  const inProject = d.projectId ? ` in ${projectName(d.projectId)}` : "";
  switch (event.action) {
    case "tenant.created": return `created the workspace ${quoted(d.name)}`;
    case "project.created": return `started the project ${quoted(d.name)}`;
    case "source.created": return `added the interview ${quoted(d.title)}${inProject}`;
    case "source.metadata_updated": return `updated an interview's details and consent${inProject}`;
    case "source.deleted": return `deleted the interview ${quoted(d.title)}${d.reason ? ` (${String(d.reason)})` : ""}`;
    case "source.moved": return `moved an interview to another folder${inProject}`;
    case "segment.corrected": return `corrected a transcript${inProject}`;
    case "segment.redacted": return `redacted part of a transcript${d.reason ? ` (${String(d.reason)})` : ""}`;
    case "speaker.renamed": return `renamed the speaker ${quoted(d.from)} to ${quoted(d.to)}`;
    case "highlight.created": return `highlighted a quote${Array.isArray(d.tags) && d.tags.length ? ` tagged ${d.tags.map((tag) => `#${tag}`).join(" ")}` : ""}${inProject}`;
    case "highlight.updated": return `retagged a highlight${inProject}`;
    case "highlight.deleted": return `deleted a highlight${inProject}`;
    case "insight.created": return `published an insight citing ${Number(d.evidence ?? 0)} ${Number(d.evidence) === 1 ? "quote" : "quotes"}${inProject}`;
    case "insight.updated": return `revised an insight (version ${Number(d.version ?? 2)})${inProject}`;
    case "insight.deleted": return `deleted the insight ${quoted(d.title)}`;
    case "theme.created": return `added the theme ${quoted(d.name)}${inProject}`;
    case "theme.deleted": return `removed the theme ${quoted(d.name)}`;
    case "tag.renamed": return `renamed #${event.target.id} to #${String(d.to ?? "")}`;
    case "folder.created": return `created the ${d.restricted ? "restricted " : ""}folder ${quoted(d.name)}${inProject}`;
    case "folder.access_changed": return `changed who can open a folder${inProject}`;
    case "folder.deleted": return `removed the folder ${quoted(d.name)}`;
    case "report.created": return `published the report ${quoted(d.title)}`;
    case "report.deleted": return `deleted the report ${quoted(d.title)}`;
    case "legal_hold.placed": return `placed a legal hold on ${quoted(d.title)}`;
    case "legal_hold.released": return `released the legal hold on ${quoted(d.title)}`;
    case "legal_hold.blocked": return `was stopped by a legal hold (${String(d.attempted ?? "change")})`;
    case "retention.applied": return `ran retention${typeof d.deleted === "number" ? `, deleting ${d.deleted} ${d.deleted === 1 ? "interview" : "interviews"}` : ""}`;
    case "dovetail.imported": return `imported highlights from Dovetail${inProject}`;
    case "invitation.created": return `invited ${String(d.email ?? "someone")} as ${ROLE_WORDS[String(d.role)] ?? String(d.role ?? "a member")}`;
    case "invitation.resent": return `sent a new invitation link to ${String(d.email ?? "someone")}`;
    case "invitation.revoked": return `withdrew the invitation for ${String(d.email ?? "someone")}`;
    case "invitation.accepted": return "joined the workspace";
    case "membership.granted": return `added a member as ${ROLE_WORDS[String(d.role)] ?? String(d.role ?? "member")}`;
    case "membership.role_changed": return `changed a member's role to ${ROLE_WORDS[String(d.to)] ?? String(d.to ?? "")}`;
    case "membership.removed": return "removed a member";
    case "membership.left": return "left the workspace";
    case "ownership.transferred": return "transferred ownership of the workspace";
    default: return event.action.replace(/[._]/g, " ");
  }
}

function dayLabel(iso: string | null) {
  if (!iso) return "Earlier";
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function ActivityView({ workspace, onRefresh }: { workspace: Workspace; onRefresh: () => Promise<void> }) {
  const names = new Map(workspace.projects.map((project) => [project.id, project.name]));
  const projectName = (id: unknown) => names.get(String(id)) ?? "a project";
  const groups: Array<{ day: string; events: AuditEvent[] }> = [];
  for (const event of workspace.audit) {
    const day = dayLabel(event.occurredAt);
    const last = groups.at(-1);
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change to this workspace, newest first. The log is append-only: redactions and deletions record who, when and why — never the removed words."
        actions={<Button variant="outline" onClick={() => void onRefresh()}><History /> Refresh</Button>}
      />
      {workspace.audit.length === 0 ? (
        <EmptyState icon={History} title="Nothing has happened yet">Changes your team makes will be recorded here as they happen.</EmptyState>
      ) : (
        <div className="grid gap-8">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{group.day}</h2>
              <ol className="overflow-hidden rounded-lg border border-border bg-card">
                {group.events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                    <PersonAvatar uid={event.actor.uid} email={event.actor.email} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed">
                        <span className="font-semibold"><PersonName uid={event.actor.uid} email={event.actor.email} /></span>{" "}
                        <span>{describeEvent(event, projectName)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <time dateTime={event.occurredAt ?? undefined}>{event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</time>
                      </p>
                    </div>
                    {event.action.startsWith("legal_hold") || event.action === "source.deleted" || event.action === "segment.redacted" ? (
                      <Badge variant="outline" className="shrink-0"><Lock /> Compliance</Badge>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Export                                                                                    */
/* ---------------------------------------------------------------------------------------- */

function ExportView({ workspace, tenantId }: { workspace: Workspace; tenantId: string }) {
  const manageable = canManage(workspace.role);
  return (
    <>
      <PageHeader title="Data export" description="Your research belongs to your team. Download it whenever you like, in an open, documented format." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card p-6">
          <span className="grid size-10 place-items-center rounded-full bg-secondary text-primary"><Download className="size-5" aria-hidden="true" /></span>
          <h2 className="brand-heading mt-4 text-2xl">Export the whole workspace</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            One JSON file with every project, interview, corrected transcript, consent record, highlight, insight and theme — with the chain from each insight to the exact words it cites — plus members and the activity log.
          </p>
          {manageable ? (
            <Button asChild className="mt-5"><a href={`/api/research/tenants/${tenantId}/export`} download><Download /> Download workspace export</a></Button>
          ) : (
            <p className="mt-5 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Owners and admins can export the whole workspace. You can export any project you can open below.</p>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="brand-heading text-xl">Export a single project</h2>
          <p className="mt-1 text-sm text-muted-foreground">Includes only the interviews you can open.</p>
          {workspace.projects.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No projects yet.</p> : (
            <ul className="mt-4 divide-y divide-border">
              {workspace.projects.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm font-medium">{project.name}</span>
                  <Button asChild size="sm" variant="ghost"><a href={`/api/research/tenants/${tenantId}/projects/${project.id}/export`} download><Download /> JSON</a></Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {workspace.audit[0] ? (
        <p className="mt-6 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Last change {formatDateTime(workspace.audit[0].occurredAt)} by
          <Byline uid={workspace.audit[0].actor.uid} email={workspace.audit[0].actor.email} />
        </p>
      ) : null}
    </>
  );
}
