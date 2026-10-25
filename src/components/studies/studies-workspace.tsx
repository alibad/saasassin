"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  History,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import type { ResultsPayload } from "@/lib/studies/data";
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

import { ParticipantRunner } from "./participant-runner";
import { panel, ResultsView } from "./results-view";
import { StudyBuilder } from "./study-builder";

type Tenant = { id: string; name: string; role: string };
type Member = { uid: string; email: string; name: string; role: string };
type AuditEvent = { id: string; action: string; actor: { email: string }; occurredAt: string | null; target: { type: string; id: string } };

const STATUS_STYLE: Record<StudyStatus, string> = {
  draft: "bg-white",
  live: "bg-[#ffbd2e]",
  closed: "bg-[#ddd]",
};

const TRANSITION_COPY: Record<StudyTransition, { label: string; title: string; body: string }> = {
  publish: {
    label: "Publish",
    title: "Publish this study?",
    body: "Publishing freezes the current blocks as an immutable version and opens the participant link. To change questions later, duplicate the study.",
  },
  close: { label: "Close", title: "Close this study?", body: "The participant link stops accepting new responses. You can reopen it later." },
  reopen: { label: "Reopen", title: "Reopen this study?", body: "The participant link starts accepting responses again for the same frozen version." },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

function toDraft(study: StudyRecord): StudyDraft {
  return { title: study.title, description: study.description, blocks: study.draftBlocks, settings: study.settings };
}

export function StudiesWorkspace({ user }: { user: { email: string; name: string } }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [studies, setStudies] = useState<StudyRecord[] | null>(null);
  const [role, setRole] = useState("viewer");
  const [selected, setSelected] = useState<StudyRecord | null>(null);
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<StudyTransition | null>(null);
  const [inviteRole, setInviteRole] = useState("member");
  const [workspaceDialog, setWorkspaceDialog] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const canEdit = ["owner", "admin", "member"].includes(role);
  const privileged = ["owner", "admin"].includes(role);
  const base = `/api/studies/tenants/${tenantId}`;

  const run = useCallback(async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    api<{ tenants: Tenant[] }>("/api/fleet/studies/tenants")
      .then(({ tenants: list }) => {
        setTenants(list);
        if (list[0]) setTenantId(list[0].id);
      })
      .catch((caught: Error) => {
        setTenants([]);
        setError(caught.message);
      });
  }, []);

  const loadStudies = useCallback(async () => {
    if (!tenantId) return;
    const payload = await api<{ role: string; studies: StudyRecord[] }>(`/api/studies/tenants/${tenantId}/studies`);
    setRole(payload.role);
    setStudies(payload.studies);
  }, [tenantId]);

  const loadSide = useCallback(async () => {
    if (!tenantId) return;
    const [memberPayload, auditPayload] = await Promise.all([
      api<{ members: Member[] }>(`/api/studies/tenants/${tenantId}/members`),
      api<{ events: AuditEvent[] }>(`/api/studies/tenants/${tenantId}/audit`),
    ]);
    setMembers(memberPayload.members);
    setAudit(auditPayload.events);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset view when the workspace changes
    setSelected(null);
    setStudies(null);
    loadStudies().catch((caught: Error) => setError(caught.message));
    loadSide().catch(() => undefined);
  }, [tenantId, loadStudies, loadSide]);

  function openStudy(study: StudyRecord) {
    setSelected(study);
    setDraft(toDraft(study));
    setDirty(false);
    setResults(null);
    setNotice("");
    setError("");
  }

  async function loadResults(study: StudyRecord) {
    await run("results", async () => {
      setResults(await api<ResultsPayload>(`${base}/studies/${study.id}/results`));
    });
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    await run("tenant", async () => {
      const { tenant } = await api<{ tenant: Tenant }>("/api/fleet/studies/tenants", { method: "POST", body: JSON.stringify({ name }) });
      setTenants((previous) => [...(previous ?? []), tenant]);
      setTenantId(tenant.id);
      form.reset();
      setWorkspaceDialog(false);
    });
  }

  const workspaceForm = (
    <form onSubmit={createWorkspace} className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-56 flex-1 gap-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input id="workspace-name" name="name" required maxLength={80} placeholder="e.g. Acme product research" />
      </div>
      <Button type="submit" disabled={busy === "tenant"}>
        <Plus className="size-4" aria-hidden="true" /> Create workspace
      </Button>
    </form>
  );

  async function createStudy() {
    await run("create", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies`, {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled study",
          description: "",
          blocks: [defaultBlock("welcome"), defaultBlock("multiple_choice")],
          settings: { participantCap: null, closeAt: null, endMessage: "Thank you — your responses were recorded." },
        }),
      });
      await loadStudies();
      openStudy(study);
    });
  }

  async function save() {
    if (!selected || !draft) return;
    await run("save", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}`, { method: "PUT", body: JSON.stringify(draft) });
      setSelected(study);
      setDirty(false);
      setNotice("Saved.");
      await loadStudies();
    });
  }

  async function transition(next: StudyTransition) {
    if (!selected || !draft) return;
    setConfirm(null);
    await run(next, async () => {
      if (dirty) {
        await api(`${base}/studies/${selected.id}`, { method: "PUT", body: JSON.stringify(draft) });
        setDirty(false);
      }
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ transition: next }),
      });
      openStudy(study);
      setNotice(next === "publish" ? `Published version ${study.currentVersion}. The participant link is live.` : `Study ${study.status}.`);
      await Promise.all([loadStudies(), loadSide()]);
    });
  }

  async function duplicate() {
    if (!selected) return;
    await run("duplicate", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/duplicate`, { method: "POST" });
      await loadStudies();
      openStudy(study);
      setNotice("Duplicated as a new draft.");
    });
  }

  async function toggleShare(enabled: boolean) {
    if (!selected) return;
    await run("share", async () => {
      const { study } = await api<{ study: StudyRecord }>(`${base}/studies/${selected.id}/share`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
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

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    await run("invite", async () => {
      await api(`${base}/members`, { method: "POST", body: JSON.stringify({ email, role: inviteRole }) });
      form.reset();
      setNotice(`${email} now has access.`);
      await loadSide();
    });
  }

  async function logout() {
    await fetch("/api/fleet/studies/session", { method: "DELETE" });
    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      /* the server session is already cleared */
    }
    router.push("/apps/studies/sign-in");
    router.refresh();
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const participantPath = selected ? `/apps/studies/p/${tenantId}/${selected.id}` : "";
  const sharePath = selected?.shareToken ? `/apps/studies/r/${tenantId}/${selected.id}/${selected.shareToken}` : "";
  const problems = draft ? validateStudyStructure(draft.blocks) : [];

  return (
    <main className="min-h-screen bg-[#f6f1e7] px-4 py-6 text-[#111]">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest">SaaSassin Studies</p>
            <h1 className="text-2xl font-semibold">Unmoderated research, your data</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tenants && tenants.length > 0 ? (
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger aria-label="Workspace" className="w-56 bg-white">
                  <SelectValue placeholder="Choose workspace" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} · {tenant.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {tenants && tenants.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setWorkspaceDialog(true)}>
                <Plus className="size-4" aria-hidden="true" /> Workspace
              </Button>
            ) : null}
            <span className="hidden text-sm sm:inline">{user.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </Button>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert>
            <AlertDescription className="break-all">{notice}</AlertDescription>
          </Alert>
        ) : null}

        {tenants === null ? (
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading workspaces…
          </p>
        ) : null}

        {tenants !== null && tenants.length === 0 ? (
          <section className={`${panel} grid gap-3 p-5`}>
            <h2 className="text-lg font-semibold">Create your research workspace</h2>
            <p className="text-sm text-[#555]">Studies, responses and teammates live inside a workspace. You can export all of it at any time.</p>
            {workspaceForm}
          </section>
        ) : null}

        {tenantId ? (
          <Tabs defaultValue="studies">
            <TabsList className="flex-wrap">
              <TabsTrigger value="studies">Studies</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="studies" className="grid gap-4 pt-3">
              {!selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Studies</h2>
                    {canEdit ? (
                      <Button onClick={createStudy} disabled={busy === "create"}>
                        <Plus className="size-4" aria-hidden="true" /> New study
                      </Button>
                    ) : null}
                  </div>
                  {studies === null ? (
                    <p className="flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading studies…
                    </p>
                  ) : studies.length === 0 ? (
                    <div className={`${panel} p-6`}>
                      <p className="font-semibold">No studies yet.</p>
                      <p className="text-sm text-[#555]">
                        Build a study from blocks — consent, questions, a website task, a card sort — then publish a participant link.
                      </p>
                    </div>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {studies.map((study) => {
                        const status = effectiveStatus(study);
                        return (
                          <li key={study.id}>
                            <button
                              type="button"
                              onClick={() => openStudy(study)}
                              className={`${panel} grid w-full gap-1 p-4 text-left transition-transform hover:-translate-y-0.5`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold">{study.title}</span>
                                <Badge className={`${STATUS_STYLE[status]} border border-[#111] text-[#111]`}>{status}</Badge>
                              </span>
                              <span className="text-sm text-[#555]">
                                {study.draftBlocks.length} blocks · v{study.currentVersion || "—"} · {study.completedCount} completed
                                {study.settings.participantCap ? ` / ${study.settings.participantCap}` : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : draft ? (
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                      <ArrowLeft className="size-4" aria-hidden="true" /> All studies
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <Button variant="outline" size="sm" onClick={save} disabled={!dirty || busy === "save"}>
                          <Save className="size-4" aria-hidden="true" /> {dirty ? "Save" : "Saved"}
                        </Button>
                      ) : null}
                      {canEdit
                        ? availableTransitions(selected.status).map((next) => (
                            <Button
                              key={next}
                              size="sm"
                              variant={next === "publish" ? "default" : "outline"}
                              disabled={Boolean(busy) || (next === "publish" && problems.length > 0)}
                              onClick={() => setConfirm(next)}
                            >
                              {TRANSITION_COPY[next].label}
                            </Button>
                          ))
                        : null}
                      <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!draft.blocks.length}>
                        <Eye className="size-4" aria-hidden="true" /> Preview
                      </Button>
                      {canEdit ? (
                        <Button variant="outline" size="sm" onClick={duplicate} disabled={busy === "duplicate"}>
                          <CopyPlus className="size-4" aria-hidden="true" /> Duplicate
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className={`${panel} grid gap-2 p-4`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-xl font-semibold">{selected.title}</h2>
                      <Badge className={`${STATUS_STYLE[effectiveStatus(selected)]} border border-[#111] text-[#111]`}>
                        {effectiveStatus(selected)}
                      </Badge>
                      {selected.currentVersion ? <Badge variant="outline">version {selected.currentVersion}</Badge> : null}
                    </div>
                    {selected.status === "draft" && problems.length ? (
                      <p className="text-sm text-[#8a1c1c]">Before publishing: {problems[0]}</p>
                    ) : null}
                    {selected.status !== "draft" ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Link2 className="size-4" aria-hidden="true" />
                        <code className="min-w-0 break-all bg-white px-1">{origin}{participantPath}</code>
                        <Button variant="outline" size="sm" onClick={() => copy(`${origin}${participantPath}`, "Participant link copied.")}>
                          <Copy className="size-4" aria-hidden="true" /> Copy
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={participantPath} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" aria-hidden="true" /> Open
                          </a>
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <Tabs key={selected.id} defaultValue="build" onValueChange={(value) => value === "results" && loadResults(selected)}>
                    <TabsList>
                      <TabsTrigger value="build">Build</TabsTrigger>
                      <TabsTrigger value="results" disabled={!selected.currentVersion}>
                        Results
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="build" className="pt-3">
                      <StudyBuilder
                        draft={draft}
                        locked={selected.status !== "draft" || !canEdit}
                        onChange={(next) => {
                          setDraft(next);
                          setDirty(true);
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="results" className="grid gap-4 pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => loadResults(selected)} disabled={busy === "results"}>
                            <RefreshCw className={`size-4 ${busy === "results" ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={`${base}/studies/${selected.id}/export`} download>
                              <Download className="size-4" aria-hidden="true" /> Responses JSON
                            </a>
                          </Button>
                        </div>
                        {privileged ? (
                          <label className="flex flex-wrap items-center gap-2 text-sm">
                            <Switch checked={Boolean(selected.shareToken)} onCheckedChange={toggleShare} disabled={busy === "share"} />
                            Read-only results link
                            {sharePath ? (
                              <Button variant="outline" size="sm" onClick={() => copy(`${origin}${sharePath}`, "Read-only results link copied.")}>
                                <Copy className="size-4" aria-hidden="true" /> Copy
                              </Button>
                            ) : null}
                          </label>
                        ) : null}
                      </div>
                      {results?.results && results.version ? (
                        <ResultsView
                          results={results.results}
                          version={results.version}
                          otherVersionResponses={results.otherVersionResponses}
                          exportBase={`${base}/studies/${selected.id}/export`}
                        />
                      ) : busy === "results" ? (
                        <p className="flex items-center gap-2">
                          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading results…
                        </p>
                      ) : null}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="members" className="grid gap-4 pt-3">
              {privileged ? (
                <form onSubmit={invite} className={`${panel} flex flex-wrap items-end gap-3 p-4`}>
                  <div className="grid min-w-56 flex-1 gap-1.5">
                    <Label htmlFor="invite-email">Invite by email</Label>
                    <Input id="invite-email" name="email" type="email" required placeholder="researcher@company.com" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger id="invite-role" className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Researcher</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={busy === "invite"}>
                    <Users className="size-4" aria-hidden="true" /> Invite
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-[#555]">Only owners and admins can invite members.</p>
              )}
              <div className={`${panel} overflow-x-auto p-2`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.uid}>
                        <TableCell className="break-all">{member.email}</TableCell>
                        <TableCell>{member.role === "member" ? "researcher" : member.role}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="grid gap-3 pt-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <History className="size-4" aria-hidden="true" /> Audit log
                </h2>
                <Button variant="outline" size="sm" onClick={() => run("audit", loadSide)}>
                  <RefreshCw className="size-4" aria-hidden="true" /> Refresh
                </Button>
              </div>
              <div className={`${panel} overflow-x-auto p-2`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : "—"}</TableCell>
                        <TableCell className="break-all">{event.actor?.email}</TableCell>
                        <TableCell>
                          <code>{event.action}</code>
                        </TableCell>
                        <TableCell className="text-xs">
                          {event.target.type} {event.target.id.slice(0, 8)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="export" className="pt-3">
              <div className={`${panel} grid gap-3 p-4`}>
                <h2 className="text-lg font-semibold">Export the whole workspace</h2>
                <p className="text-sm text-[#555]">
                  One versioned JSON bundle: every study, every frozen version, every raw response, members and the audit log. Participant
                  data contains no names or emails.
                </p>
                <Button asChild className="justify-self-start">
                  <a href={`${base}/export`} download>
                    <Download className="size-4" aria-hidden="true" /> Download workspace export
                  </a>
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>Runs the current draft with its logic and screeners. Nothing is recorded.</DialogDescription>
          </DialogHeader>
          {previewOpen && draft ? (
            <ParticipantRunner
              preview
              study={{
                studyId: selected?.id ?? "preview",
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

      <Dialog open={workspaceDialog} onOpenChange={setWorkspaceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Each workspace has its own studies, members, audit log and export.</DialogDescription>
          </DialogHeader>
          {workspaceForm}
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{TRANSITION_COPY[confirm].title}</DialogTitle>
                <DialogDescription>{TRANSITION_COPY[confirm].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button onClick={() => transition(confirm)}>{TRANSITION_COPY[confirm].label}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
