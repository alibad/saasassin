"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronLeft,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  FileUp,
  FlaskConical,
  History,
  Link2,
  LoaderCircle,
  MailPlus,
  Plus,
  RefreshCw,
  Save,
  Share2,
  X,
} from "lucide-react";

import { readableAuthError } from "@/components/account/auth-errors";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "@/components/account/client";
import { TeamPanel } from "@/components/account/team-panel";
import { acceptPendingInvitation } from "@/components/account/workspace-switcher";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResultsPayload } from "@/lib/studies/data";
import type { FindingInput } from "@/lib/studies/findings";
import {
  availableTransitions,
  defaultBlock,
  effectiveStatus,
  validateStudyStructure,
  type StudyDraft,
  type StudyRecord,
  type StudyStatus,
  type StudyTransition,
} from "@/lib/studies/model";
import { cn } from "@/lib/utils";

import { FindingsPanel } from "./findings-panel";
import { MazeImportDialog } from "./maze-import";
import { ParticipantRunner } from "./participant-runner";
import { Byline, PeopleProvider, PersonAvatar, PersonName, relativeTime, type StudiesPerson } from "./people";
import { BLOCK_ICONS, ResultsView, seconds } from "./results-view";
import { SessionsPanel, type EvidenceDraft } from "./sessions-panel";
import { StudyBuilder } from "./study-builder";
import { WebhooksPanel } from "./webhooks-panel";
import { EmptyState, PageHeader, StudiesWordmark, WorkspaceShell, type StudiesView } from "./workspace-shell";

type AuditEvent = { id: string; action: string; actor: { uid?: string; email: string }; occurredAt: string | null; target: { type: string; id: string }; details?: Record<string, unknown> };

const STATUS_COPY: Record<StudyStatus, { label: string; className: string; dot: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  live: { label: "Live", className: "bg-secondary text-secondary-foreground", dot: "bg-primary animate-pulse" },
  closed: { label: "Closed", className: "bg-accent text-accent-foreground", dot: "bg-brand-accent" },
};

export function StatusPill({ status, className }: { status: StudyStatus; className?: string }) {
  const copy = STATUS_COPY[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", copy.className, className)}>
      <span className={cn("size-1.5 rounded-full", copy.dot)} aria-hidden="true" />
      {copy.label}
    </span>
  );
}

const TRANSITION_COPY: Record<StudyTransition, { label: string; title: string; body: string }> = {
  publish: {
    label: "Publish",
    title: "Publish this study?",
    body: "Publishing freezes these blocks as a new version and opens the participant link. To change questions later, duplicate the study.",
  },
  close: { label: "Close", title: "Close this study?", body: "The participant link stops accepting new responses. You can reopen it later." },
  reopen: { label: "Reopen", title: "Reopen this study?", body: "The participant link accepts responses again, for the same published version." },
};

const VIEWS: StudiesView[] = ["studies", "study", "activity", "team", "integrations", "export"];
const LAST_WORKSPACE_KEY = "studies:last-workspace";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

function toDraft(study: StudyRecord): StudyDraft {
  return { title: study.title, description: study.description, blocks: study.draftBlocks, settings: study.settings };
}

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
    /* the URL still carries the workspace */
  }
}

type Location = { workspace?: string | null; view?: StudiesView; study?: string | null; tab?: string | null };

function writeLocation(next: Location, mode: "push" | "replace" = "push") {
  const params = new URLSearchParams();
  if (next.workspace) params.set("workspace", next.workspace);
  const view = next.view ?? "studies";
  if (view !== "studies") params.set("view", view);
  if (view === "study" && next.study) params.set("study", next.study);
  if (view === "study" && next.tab && next.tab !== "build") params.set("tab", next.tab);
  const query = params.toString();
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", query ? `?${query}` : window.location.pathname);
  if (mode === "push") window.scrollTo({ top: 0 });
}

export function StudiesWorkspace({ user }: { user: { email: string; name: string } }) {
  const params = useSearchParams();
  const account = useAccount("studies");
  const workspaces = useMemo(() => account.data?.workspaces ?? [], [account.data]);
  const viewerUid = account.data?.profile.uid ?? null;

  const urlWorkspace = params.get("workspace");
  const urlView = params.get("view");
  const view: StudiesView = VIEWS.includes(urlView as StudiesView) ? (urlView as StudiesView) : params.get("study") ? "study" : "studies";
  const studyId = view === "study" ? params.get("study") : null;
  const studyTab = params.get("tab") ?? "build";

  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRemembered(readLastWorkspace());
  }, []);
  const known = (id: string | null) => (id && workspaces.some((workspace) => workspace.id === id) ? id : null);
  const tenantId = known(urlWorkspace) ?? known(remembered) ?? workspaces[0]?.id ?? null;

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

  const [studies, setStudies] = useState<StudyRecord[] | null>(null);
  const [studiesFor, setStudiesFor] = useState<string | null>(null);
  const [role, setRole] = useState("viewer");
  const [members, setMembers] = useState<StudiesPerson[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [mazeOpen, setMazeOpen] = useState(false);

  const canEdit = ["owner", "admin", "member"].includes(role);
  const privileged = ["owner", "admin"].includes(role);
  const base = `/api/studies/tenants/${tenantId}`;

  const loadStudies = useCallback(async () => {
    if (!tenantId) return;
    const payload = await api<{ role: string; studies: StudyRecord[] }>(`/api/studies/tenants/${tenantId}/studies`);
    setRole(payload.role);
    setStudies(payload.studies);
    setStudiesFor(tenantId);
  }, [tenantId]);

  const loadSide = useCallback(async () => {
    if (!tenantId) return;
    const [memberPayload, auditPayload] = await Promise.all([
      api<{ members: StudiesPerson[] }>(`/api/studies/tenants/${tenantId}/members`),
      api<{ events: AuditEvent[] }>(`/api/studies/tenants/${tenantId}/audit`),
    ]);
    setMembers(memberPayload.members);
    setAudit(auditPayload.events);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the workspace's studies when it changes
    loadStudies().catch((caught: Error) => setError(caught.message));
    loadSide().catch(() => undefined);
  }, [tenantId, loadStudies, loadSide]);

  const go = useCallback((next: Omit<Location, "workspace">, mode: "push" | "replace" = "push") => {
    writeLocation({ ...next, workspace: tenantId }, mode);
  }, [tenantId]);

  function switchWorkspace(id: string) {
    rememberWorkspace(id);
    setRemembered(id);
    writeLocation({ workspace: id, view: "studies" });
  }

  async function createStudy() {
    setBusy("create");
    setError("");
    try {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies`, {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled study",
          description: "",
          blocks: [defaultBlock("welcome"), defaultBlock("multiple_choice")],
          settings: { participantCap: null, closeAt: null, endMessage: "Thank you — your responses were recorded.", minDurationSeconds: null },
        }),
      });
      await loadStudies();
      go({ view: "study", study: study.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const currentStudies = studiesFor === tenantId ? studies : null;

  const shell = (children: React.ReactNode) => (
    <WorkspaceShell tenantId={tenantId} view={view} onNavigate={(next) => go({ view: next })} onSwitchWorkspace={switchWorkspace}>
      <PeopleProvider people={members} viewerUid={viewerUid}>
        {error ? (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription className="flex items-center justify-between gap-3">{error}<Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setError("")}><X /></Button></AlertDescription>
          </Alert>
        ) : null}
        {children}
      </PeopleProvider>
      {tenantId ? (
        <MazeImportDialog
          open={mazeOpen}
          onOpenChange={setMazeOpen}
          tenantId={tenantId}
          onImported={(study) => {
            void loadStudies();
            void loadSide();
            go({ view: "study", study: study.id, tab: "results" });
          }}
        />
      ) : null}
    </WorkspaceShell>
  );

  if (account.loading && !account.data) {
    return shell(<div className="grid gap-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-56 w-full" /></div>);
  }

  if (!tenantId) {
    return <FirstWorkspace email={account.data?.profile.email ?? user.email} onCreated={switchWorkspace} />;
  }

  if (view === "study" && studyId) {
    const study = currentStudies?.find((entry) => entry.id === studyId) ?? null;
    if (!currentStudies) return shell(<div className="grid gap-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-96 w-full" /></div>);
    if (!study) {
      return shell(
        <EmptyState icon={FlaskConical} title="This study isn't here" action={<Button variant="outline" onClick={() => go({ view: "studies" })}><ChevronLeft /> All studies</Button>}>
          It may have been deleted, or it belongs to another workspace.
        </EmptyState>,
      );
    }
    return shell(
      <StudyDetail
        key={study.id}
        tenantId={tenantId}
        initial={study}
        tab={studyTab}
        canEdit={canEdit}
        privileged={privileged}
        onTab={(tab) => go({ view: "study", study: study.id, tab }, "replace")}
        onBack={() => go({ view: "studies" })}
        onChanged={async () => { await Promise.all([loadStudies(), loadSide()]); }}
        onOpenStudy={(id) => go({ view: "study", study: id })}
      />,
    );
  }

  if (view === "activity") {
    return shell(<ActivityView audit={audit} studies={currentStudies ?? []} onRefresh={() => loadSide().catch((caught: Error) => setError(caught.message))} />);
  }

  if (view === "team") {
    return shell(
      <>
        <PageHeader kicker="Team" title={workspaces.find((workspace) => workspace.id === tenantId)?.name ?? "Team"} description="Researchers build and launch studies, viewers read the results. Invite anyone by email — they don't need an account yet." />
        <TeamPanel product="studies" productName="Studies" tenantId={tenantId} onLeft={() => { void refreshAccount("studies").then(() => writeLocation({ view: "studies" })); }} />
      </>,
    );
  }

  if (view === "integrations") {
    return shell(
      <>
        <PageHeader title="Integrations" description="Send study events to your own tools. Each delivery is signed so you can check it came from this workspace." />
        <WebhooksPanel key={tenantId} tenantId={tenantId} privileged={privileged} />
      </>,
    );
  }

  if (view === "export") {
    return shell(
      <>
        <PageHeader title="Export" description="Your studies and every response stay yours. Download the whole workspace whenever you like." />
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary"><Download className="size-5" aria-hidden="true" /></span>
            <h2 className="brand-heading mt-4 text-xl">Export the whole workspace</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              One JSON bundle with every study, every published version, every response and its quality decision, findings, webhook endpoints (secrets removed) with their delivery log, members and the activity log. Responses never contain names or emails.
            </p>
            <Button asChild className="mt-5"><a href={`${base}/export`} download><Download /> Download workspace export</a></Button>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="brand-heading text-xl">Export one study</h2>
            <p className="mt-1 text-sm text-muted-foreground">Responses as JSON, or any block as CSV from its results.</p>
            <ul className="mt-4 divide-y divide-border">
              {(currentStudies ?? []).filter((study) => study.currentVersion).map((study) => (
                <li key={study.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm font-medium">{study.title}</span>
                  <Button asChild size="sm" variant="ghost"><a href={`${base}/studies/${study.id}/export`} download><Download /> JSON</a></Button>
                </li>
              ))}
              {(currentStudies ?? []).every((study) => !study.currentVersion) ? <li className="py-2.5 text-sm text-muted-foreground">Publish a study to export its responses.</li> : null}
            </ul>
          </section>
        </div>
      </>,
    );
  }

  return shell(
    <StudiesHome
      studies={currentStudies}
      canEdit={canEdit}
      busy={busy === "create"}
      onCreate={createStudy}
      onImport={() => setMazeOpen(true)}
      onOpen={(id) => go({ view: "study", study: id })}
    />,
  );
}

/* ---------------------------------------------------------------------------------------- */
/* First run                                                                                 */
/* ---------------------------------------------------------------------------------------- */

function FirstWorkspace({ email, onCreated }: { email: string; onCreated: (tenantId: string) => void }) {
  const { data } = useAccount("studies");
  const invitations = data?.pendingInvitations ?? [];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase("studies")}/tenants`, { method: "POST", json: { name: name.trim() } });
      await refreshAccount("studies");
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
        <StudiesWordmark size={32} className="mb-8" />
        <h1 className="brand-heading text-4xl leading-tight">Set up your research workspace</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Studies, responses and teammates live in a workspace. Build your first study in minutes and share one link with participants.
        </p>
        {invitations.length ? (
          <div className="mt-8 grid gap-2">
            <p className="text-sm font-semibold">Waiting for you</p>
            {invitations.map((invitation) => (
              <div key={invitation.invitationId} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
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
                      await acceptPendingInvitation("studies", invitation);
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
        <form className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 shadow-xs" onSubmit={create}>
          <Label htmlFor="workspace-name">{invitations.length ? "Or create a new workspace" : "Workspace name"}</Label>
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
/* Studies list                                                                              */
/* ---------------------------------------------------------------------------------------- */

type Filter = "all" | StudyStatus;

function StudiesHome({ studies, canEdit, busy, onCreate, onImport, onOpen }: { studies: StudyRecord[] | null; canEdit: boolean; busy: boolean; onCreate: () => void; onImport: () => void; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = { all: studies?.length ?? 0, live: 0, draft: 0, closed: 0 } as Record<Filter, number>;
  for (const study of studies ?? []) counts[effectiveStatus(study)] += 1;
  const shown = (studies ?? []).filter((study) => filter === "all" || effectiveStatus(study) === filter);
  const responses = (studies ?? []).reduce((sum, study) => sum + study.completedCount, 0);

  return (
    <>
      <PageHeader
        title="Studies"
        description={studies?.length ? `${counts.live} live · ${responses} completed responses across ${studies.length} ${studies.length === 1 ? "study" : "studies"}` : "Surveys, tree tests, card sorts and website tasks — one link for participants."}
        actions={canEdit ? (
          <>
            <Button variant="outline" onClick={onImport}><FileUp /> Import from Maze</Button>
            <Button onClick={onCreate} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} New study</Button>
          </>
        ) : null}
      />
      {studies === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      ) : studies.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Launch your first study"
          action={canEdit ? <div className="flex flex-wrap justify-center gap-2"><Button onClick={onCreate} disabled={busy}><Plus /> New study</Button><Button variant="outline" onClick={onImport}><FileUp /> Import from Maze</Button></div> : null}
        >
          Stack blocks — consent, questions, a tree test, a card sort, a website task — then publish and share one link. Results update as people finish.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter studies">
            {(["all", "live", "draft", "closed"] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={filter === option}
                onClick={() => setFilter(option)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  filter === option ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "all" ? "All" : STATUS_COPY[option].label}
                <span className={cn("tabular-nums", filter === option ? "opacity-80" : "")}>{counts[option]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">No {filter === "all" ? "" : STATUS_COPY[filter as StudyStatus].label.toLowerCase()} studies.</p> : null}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((study) => (
              <li key={study.id}>
                <StudyCard study={study} onOpen={() => onOpen(study.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function StudyCard({ study, onOpen }: { study: StudyRecord; onOpen: () => void }) {
  const status = effectiveStatus(study);
  const cap = study.settings.participantCap;
  const progress = cap ? Math.min(1, study.completedCount / cap) : null;
  const types = study.draftBlocks.map((block) => block.type);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-xs transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="flex items-center justify-between gap-2">
        <StatusPill status={status} />
        <span className="flex items-center gap-1.5">
          {study.imported ? <Badge variant="outline">From Maze</Badge> : null}
          {study.currentVersion ? <span className="text-xs text-muted-foreground">v{study.currentVersion}</span> : null}
        </span>
      </span>
      <span className="brand-heading mt-3 text-lg leading-snug break-words group-hover:text-primary">{study.title}</span>
      {study.description ? <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{study.description}</span> : null}
      <span className="mt-4 flex flex-wrap gap-1" aria-label={`${types.length} blocks`}>
        {types.slice(0, 8).map((type, index) => {
          const Icon = BLOCK_ICONS[type];
          return (
            <span key={`${type}-${index}`} className="grid size-7 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
          );
        })}
        {types.length > 8 ? <span className="grid h-7 place-items-center px-1 text-xs text-muted-foreground">+{types.length - 8}</span> : null}
      </span>
      {status === "draft" && !study.completedCount ? (
        <span className="mt-5 text-sm text-muted-foreground">Not published yet · {types.length} {types.length === 1 ? "block" : "blocks"}</span>
      ) : (
      <span className="mt-5 grid gap-1.5">
        <span className="flex items-baseline justify-between text-sm">
          <span><span className="brand-heading text-xl tabular-nums">{study.completedCount}</span> <span className="text-muted-foreground">{cap ? `of ${cap} responses` : study.completedCount === 1 ? "response" : "responses"}</span></span>
          {progress !== null ? <span className="text-xs tabular-nums text-muted-foreground">{Math.round(progress * 100)}%</span> : null}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className={cn("block h-full rounded-full", status === "live" ? "bg-primary" : "bg-muted-foreground/40")} style={{ width: `${progress !== null ? Math.max(2, progress * 100) : study.completedCount ? 100 : 0}%` }} />
        </span>
      </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        {study.createdBy ? <Byline uid={study.createdBy} /> : <span />}
        <span>Edited {relativeTime(study.updatedAt)}</span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* One study                                                                                 */
/* ---------------------------------------------------------------------------------------- */

function StudyDetail({
  tenantId,
  initial,
  tab,
  canEdit,
  privileged,
  onTab,
  onBack,
  onChanged,
  onOpenStudy,
}: {
  tenantId: string;
  initial: StudyRecord;
  tab: string;
  canEdit: boolean;
  privileged: boolean;
  onTab: (tab: string) => void;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onOpenStudy: (id: string) => void;
}) {
  const base = `/api/studies/tenants/${tenantId}`;
  const [selected, setSelected] = useState<StudyRecord>(initial);
  const [draft, setDraft] = useState<StudyDraft>(toDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceDraft | null>(null);
  const clearPendingEvidence = useCallback(() => setPendingEvidence(null), []);
  const [confirm, setConfirm] = useState<StudyTransition | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const status = effectiveStatus(selected);
  const problems = validateStudyStructure(draft.blocks);
  const published = Boolean(selected.currentVersion);
  const activeTab = published || tab === "build" ? tab : "build";

  const run = useCallback(async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }, []);

  const loadResults = useCallback(async (all: boolean) => {
    setBusy("results");
    try {
      setResults(await api<ResultsPayload>(`${base}/studies/${selected.id}/results${all ? "?all=1" : ""}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load results.");
    } finally {
      setBusy("");
    }
  }, [base, selected.id]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!published || loadedOnce.current || (activeTab !== "results" && activeTab !== "findings")) return;
    loadedOnce.current = true;
    void loadResults(includeExcluded);
  }, [activeTab, published, includeExcluded, loadResults]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshResults() {
    setResults(await api<ResultsPayload>(`${base}/studies/${selected.id}/results${includeExcluded ? "?all=1" : ""}`));
  }

  async function save() {
    await run("save", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}`, { method: "PUT", body: JSON.stringify(draft) });
      setSelected(study);
      setDirty(false);
      setNotice("Saved.");
      await onChanged();
    });
  }

  async function transition(next: StudyTransition) {
    setConfirm(null);
    await run(next, async () => {
      if (dirty) {
        await api(`${base}/studies/${selected.id}`, { method: "PUT", body: JSON.stringify(draft) });
        setDirty(false);
      }
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/transition`, { method: "POST", body: JSON.stringify({ transition: next }) });
      setSelected(study);
      setDraft(toDraft(study));
      setNotice(next === "publish" ? `Version ${study.currentVersion} is live. Share the participant link below.` : next === "close" ? "Study closed. The link no longer accepts responses." : "Study reopened.");
      await onChanged();
    });
  }

  async function duplicate() {
    await run("duplicate", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/duplicate`, { method: "POST" });
      await onChanged();
      onOpenStudy(study.id);
    });
  }

  async function toggleShare(enabled: boolean) {
    await run("share", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/share`, { method: "POST", body: JSON.stringify({ enabled }) });
      setSelected(study);
    });
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setNotice(text);
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const participantPath = `/apps/studies/p/${tenantId}/${selected.id}`;
  const sharePath = selected.shareToken ? `/apps/studies/r/${tenantId}/${selected.id}/${selected.shareToken}` : "";
  const cap = selected.settings.participantCap;
  const editableDraft = canEdit && !selected.imported;

  return (
    <div>
      <PageHeader
        kicker={<button type="button" onClick={onBack} className="inline-flex items-center gap-1 hover:text-foreground"><ChevronLeft className="size-4" aria-hidden="true" /> All studies</button>}
        title={selected.title}
        description={selected.description || undefined}
        className="mb-4"
        actions={
          <>
            <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!draft.blocks.length}><Eye /> Preview</Button>
            {canEdit ? <Button variant="outline" size="icon" aria-label="Duplicate study" onClick={duplicate} disabled={busy === "duplicate"}><CopyPlus /></Button> : null}
            {editableDraft ? (
              <Button variant="outline" onClick={save} disabled={!dirty || busy === "save"}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />} {dirty ? "Save" : "Saved"}</Button>
            ) : null}
            {editableDraft
              ? availableTransitions(selected.status).map((next) => (
                <Button
                  key={next}
                  variant={next === "publish" ? "default" : "outline"}
                  disabled={Boolean(busy) || (next === "publish" && problems.length > 0)}
                  onClick={() => setConfirm(next)}
                >
                  {busy === next ? <LoaderCircle className="animate-spin" /> : null}
                  {TRANSITION_COPY[next].label}
                </Button>
              ))
              : null}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <StatusPill status={status} />
        {selected.currentVersion ? <span className="text-muted-foreground">Version {selected.currentVersion}</span> : null}
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{selected.completedCount}</span>{cap ? ` of ${cap}` : ""} responses
        </span>
        {selected.createdBy ? <Byline uid={selected.createdBy} at={selected.updatedAt} prefix="Created by" className="text-sm" /> : null}
      </div>

      {notice ? (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          <span className="min-w-0 break-words">{notice}</span>
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice("")}><X /></Button>
        </div>
      ) : null}
      {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}

      {selected.imported ? (
        <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Imported from Maze ({selected.imported.fileName}): {selected.imported.importedResponses} of {selected.imported.rows} rows. It stays read-only — review sessions, write findings and export as usual, or duplicate it to run it again here.
        </div>
      ) : null}
      {selected.status === "draft" && problems.length ? (
        <div className="mb-5 rounded-xl border border-brand-accent/40 bg-accent px-4 py-3 text-sm text-accent-foreground">Before you publish: {problems[0]}</div>
      ) : null}

      {selected.status !== "draft" && !selected.imported ? (
        <section className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4 text-primary" aria-hidden="true" /> Participant link</p>
            <p className="mt-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[13px] text-muted-foreground">{origin}{participantPath}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => copy(`${origin}${participantPath}`, "Participant link copied.")}><Copy /> Copy link</Button>
            <Button asChild variant="ghost"><a href={participantPath} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
          </div>
        </section>
      ) : null}

      <Tabs value={activeTab} onValueChange={onTab} className="min-w-0">
        <div className="sticky top-16 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 bg-brand-subtle/95 px-4 py-2 backdrop-blur max-lg:top-[6.5rem] sm:-mx-6 sm:px-6">
          <TabsList className="h-10 rounded-full bg-muted p-1">
            <TabsTrigger value="build" className="rounded-full px-4">Build</TabsTrigger>
            <TabsTrigger value="results" className="rounded-full px-4" disabled={!published}>Results</TabsTrigger>
            <TabsTrigger value="findings" className="rounded-full px-4" disabled={!published}>Findings{results?.findings.length ? ` · ${results.findings.length}` : ""}</TabsTrigger>
          </TabsList>
          {activeTab === "results" && published ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => void loadResults(includeExcluded)} disabled={busy === "results"}>
                <RefreshCw className={busy === "results" ? "animate-spin" : undefined} aria-hidden="true" /> Refresh
              </Button>
              <Button asChild variant="ghost" size="sm"><a href={`${base}/studies/${selected.id}/export`} download><Download /> Responses</a></Button>
              {privileged ? (
                <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm">
                  <Share2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Read-only link
                  <Switch checked={Boolean(selected.shareToken)} onCheckedChange={toggleShare} disabled={busy === "share"} />
                  {sharePath ? <Button variant="ghost" size="icon-xs" aria-label="Copy read-only results link" onClick={() => copy(`${origin}${sharePath}`, "Read-only results link copied. Anyone with it can see results and findings, never raw answers.")}><Copy /></Button> : null}
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <TabsContent value="build" className="min-w-0">
          <StudyBuilder
            draft={draft}
            locked={selected.status !== "draft" || !canEdit || Boolean(selected.imported)}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
            }}
          />
        </TabsContent>
        <TabsContent value="results" className="grid min-w-0 grid-cols-1 gap-5">
          {results?.results && results.version ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{results.quality.flagged} flagged</span> · {results.quality.excluded} excluded
                  {results.quality.threshold
                    ? ` · speeders are faster than ${seconds(results.quality.threshold.ms)} (${results.quality.threshold.source === "setting" ? "study setting" : "set automatically"})`
                    : " · speeder check starts after 5 completed sessions"}
                </p>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={includeExcluded}
                    onCheckedChange={(checked) => {
                      setIncludeExcluded(checked);
                      void loadResults(checked);
                    }}
                  />
                  Include excluded sessions
                </label>
              </div>
              <ResultsView
                results={results.results}
                version={results.version}
                otherVersionResponses={results.otherVersionResponses}
                exportBase={`${base}/studies/${selected.id}/export`}
                includeExcluded={includeExcluded}
              />
              <SessionsPanel
                sessions={results.sessions}
                blocks={results.version.blocks}
                canEdit={canEdit}
                onDecide={async (responseId, excluded, reason) => {
                  await api(`${base}/studies/${selected.id}/responses/${responseId}/quality`, { method: "POST", body: JSON.stringify({ excluded, reason }) });
                  await refreshResults();
                  setNotice(excluded ? "Session excluded from results." : "Session kept in results.");
                }}
                onCite={(evidence) => {
                  setPendingEvidence(evidence);
                  onTab("findings");
                }}
              />
            </>
          ) : (
            <div className="grid gap-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-24" />)}</div><Skeleton className="h-64" /></div>
          )}
        </TabsContent>
        <TabsContent value="findings" className="grid min-w-0 grid-cols-1 gap-4">
          {results?.version ? (
            <FindingsPanel
              findings={results.findings}
              blocks={results.version.blocks}
              sessions={results.sessions}
              canEdit={canEdit}
              pending={pendingEvidence}
              onPendingHandled={clearPendingEvidence}
              onSave={async (input: FindingInput, findingId?: string) => {
                await api(`${base}/studies/${selected.id}/findings${findingId ? `/${findingId}` : ""}`, { method: findingId ? "PUT" : "POST", body: JSON.stringify(input) });
                await refreshResults();
                setNotice(findingId ? "Finding updated." : "Finding added.");
              }}
              onDelete={(findingId) => run("finding", async () => {
                await api(`${base}/studies/${selected.id}/findings/${findingId}`, { method: "DELETE" });
                await refreshResults();
                setNotice("Finding deleted.");
              })}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>Runs the current draft with its logic and screeners, exactly as participants will see it. Nothing is recorded.</DialogDescription>
          </DialogHeader>
          {previewOpen ? (
            <ParticipantRunner
              preview
              study={{
                studyId: selected.id,
                tenantId,
                version: 0,
                title: draft.title,
                blocks: draft.blocks,
                endMessage: draft.settings.endMessage,
                open: true,
                closedReason: null,
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{TRANSITION_COPY[confirm].title}</AlertDialogTitle>
                <AlertDialogDescription>{TRANSITION_COPY[confirm].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void transition(confirm)}>{TRANSITION_COPY[confirm].label}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Activity                                                                                  */
/* ---------------------------------------------------------------------------------------- */

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Researcher", viewer: "Viewer" };

function hostOf(value: unknown) {
  try {
    return typeof value === "string" ? new URL(value).host : "";
  } catch {
    return "";
  }
}

function describeEvent(event: AuditEvent, studyTitle: (id: string) => string) {
  const d = event.details ?? {};
  const study = event.target.type === "study" ? studyTitle(event.target.id) : d.studyId ? studyTitle(String(d.studyId)) : "a study";
  switch (event.action) {
    case "tenant.created": return `created the workspace${d.name ? ` “${String(d.name)}”` : ""}`;
    case "study.created": return `created ${study}`;
    case "study.updated": return `edited ${study}`;
    case "study.publish": return `published ${study}${d.version ? ` (version ${String(d.version)})` : ""}`;
    case "study.close": return `closed ${study}`;
    case "study.reopen": return `reopened ${study}`;
    case "study.duplicated": return `duplicated a study as ${study}`;
    case "study.imported": return `imported ${study} from Maze`;
    case "study.results_shared": return `turned on the read-only results link for ${study}`;
    case "study.results_unshared": return `turned off the read-only results link for ${study}`;
    case "study.exported_csv": return `downloaded a CSV from ${study}`;
    case "study.exported_json": return `downloaded the responses for ${study}`;
    case "workspace.exported": return "exported the workspace";
    case "finding.created": return `wrote the finding${d.title ? ` “${String(d.title)}”` : ""} on ${study}`;
    case "finding.updated": return `updated a finding on ${study}`;
    case "finding.deleted": return `deleted the finding${d.title ? ` “${String(d.title)}”` : ""}`;
    case "response.excluded": return `excluded a session from ${study}${d.reason ? ` (${String(d.reason)})` : ""}`;
    case "response.included": return `kept a flagged session in ${study}`;
    case "webhook.created": return `connected a webhook${hostOf(d.url) ? ` to ${hostOf(d.url)}` : ""}`;
    case "webhook.enabled": return "turned a webhook on";
    case "webhook.disabled": return "turned a webhook off";
    case "webhook.deleted": return "removed a webhook";
    case "webhook.tested": return `sent a test event (${String(d.status ?? "sent")})`;
    case "invitation.created": return `invited ${String(d.email ?? "someone")} as ${ROLE_WORDS[String(d.role)] ?? "a member"}`;
    case "invitation.resent": return `sent a new invitation link to ${String(d.email ?? "someone")}`;
    case "invitation.revoked": return `withdrew the invitation for ${String(d.email ?? "someone")}`;
    case "invitation.accepted": return "joined the workspace";
    case "membership.granted": return `added a member as ${ROLE_WORDS[String(d.role)] ?? "member"}`;
    case "membership.role_changed": return `changed a member's role to ${ROLE_WORDS[String(d.to)] ?? String(d.to ?? "")}`;
    case "membership.removed": return "removed a member";
    case "membership.left": return "left the workspace";
    case "ownership.transferred": return "transferred ownership of the workspace";
    default: return event.action.replace(/[._]/g, " ");
  }
}

function ActivityView({ audit, studies, onRefresh }: { audit: AuditEvent[]; studies: StudyRecord[]; onRefresh: () => void }) {
  const titles = new Map(studies.map((study) => [study.id, study.title]));
  const studyTitle = (id: string) => (titles.has(id) ? `“${titles.get(id)}”` : "a study");
  return (
    <>
      <PageHeader title="Activity" description="Everything your team changed in this workspace, newest first." actions={<Button variant="outline" onClick={onRefresh}><History /> Refresh</Button>} />
      {audit.length === 0 ? (
        <EmptyState icon={History} title="Nothing yet">Studies you build, publish and analyse will show up here.</EmptyState>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {audit.map((event) => (
            <li key={event.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <PersonAvatar uid={event.actor.uid} email={event.actor.email} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold"><PersonName uid={event.actor.uid} email={event.actor.email} /></span> {describeEvent(event, studyTitle)}
                </p>
                <p className="text-xs text-muted-foreground">{event.occurredAt ? `${relativeTime(event.occurredAt)} · ${new Date(event.occurredAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
