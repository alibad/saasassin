"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { ArrowRight, Download, FolderPlus, History, LoaderCircle, LogOut, Plus, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { canEdit, canManage, type Project, type ResearchRole } from "@/lib/research/model";

import { api, errorMessage, formatDateTime } from "./api";
import { ProjectView } from "./project-view";
import styles from "./research.module.css";

type TenantSummary = { id: string; name: string; role: string };
type Workspace = {
  tenant: { id: string; name: string };
  role: ResearchRole;
  projects: Project[];
  members: Array<{ uid: string; email: string; name: string; role: string }>;
  audit: Array<{ id: string; action: string; actor: { uid: string; email: string }; target: { type: string; id: string }; details: Record<string, unknown>; occurredAt: string | null }>;
};

const ROLE_HELP: Record<string, string> = {
  admin: "Admin — edit everything, delete sources, invite people",
  member: "Researcher — add interviews, highlight, write insights",
  viewer: "Viewer — read, search and export only",
};

function describeDetails(details: Record<string, unknown>) {
  return Object.entries(details)
    .filter(([key]) => key !== "projectId")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export function ResearchApp({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState("projects");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [project, setProject] = useState({ name: "", description: "" });
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [notice, setNotice] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setWorkspace(await api<Workspace>(`/api/research/tenants/${id}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<{ tenants: TenantSummary[] }>("/api/fleet/research/tenants")
      .then((response) => {
        if (!active) return;
        setTenants(response.tenants);
        if (response.tenants.length === 1) setTenantId(response.tenants[0].id);
      })
      .catch((caught) => {
        if (!active) return;
        setError(errorMessage(caught));
        setTenants([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    api<Workspace>(`/api/research/tenants/${tenantId}`)
      .then((response) => { if (active) setWorkspace(response); })
      .catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [tenantId]);

  async function guarded(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    await fetch("/api/fleet/research/session", { method: "DELETE" });
    try { await signOut(getFirebaseClientAuth()); } catch { /* the server session is already cleared */ }
    router.push("/apps/research/sign-in");
    router.refresh();
  }

  function createTenant(event: FormEvent) {
    event.preventDefault();
    void guarded("tenant", async () => {
      const response = await api<{ tenant: TenantSummary }>("/api/fleet/research/tenants", { method: "POST", body: JSON.stringify({ name: tenantName }) });
      setTenantName("");
      setTenants((current) => [...(current ?? []), response.tenant]);
      setTenantId(response.tenant.id);
    });
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    void guarded("project", async () => {
      const response = await api<{ project: { id: string } }>(`/api/research/tenants/${tenantId}/projects`, { method: "POST", body: JSON.stringify(project) });
      setProject({ name: "", description: "" });
      await loadWorkspace(tenantId);
      setProjectId(response.project.id);
    });
  }

  function inviteMember(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    void guarded("invite", async () => {
      await api(`/api/research/tenants/${tenantId}/members`, { method: "POST", body: JSON.stringify(invite) });
      setNotice(`${invite.email} now has ${invite.role} access.`);
      setInvite({ email: "", role: "member" });
      await loadWorkspace(tenantId);
    });
  }

  const header = (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden>S</span>
        <span>SaaSassin <span style={{ color: "var(--research-accent)" }}>Research</span></span>
        {workspace && tenantId ? <Badge variant="outline">{workspace.tenant.name} · {workspace.role}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tenants && tenants.length > 1 ? (
          <Select value={tenantId ?? undefined} onValueChange={(value) => { setTenantId(value); setProjectId(null); setWorkspace(null); }}>
            <SelectTrigger aria-label="Switch workspace" className="w-48"><SelectValue placeholder="Choose workspace" /></SelectTrigger>
            <SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}
        <span className={styles.hint}>{userEmail}</span>
        <Button variant="outline" size="sm" onClick={logout} disabled={busy === "logout"}><LogOut /> Sign out</Button>
      </div>
    </header>
  );

  if (tenants === null) {
    return <main className={`fleet-app ${styles.app}`}><div className={styles.shell}>{header}<Skeleton className="h-48 w-full" /></div></main>;
  }

  if (!tenantId) {
    return (
      <main className={`fleet-app ${styles.app}`}>
        <div className={styles.shell}>
          {header}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="grid content-start gap-3">
              <p className={styles.eyebrow}>Research repository</p>
              <h1 className="text-3xl font-extrabold">Create a secure research workspace</h1>
              <p className={styles.hint}>A workspace holds your projects, interviews, consent records, evidence and insights. Only members you invite can see it, and every change is audited.</p>
              {tenants.length > 0 ? (
                <div className="grid gap-2">
                  <p className="font-bold">Or open one of yours</p>
                  {tenants.map((tenant) => (
                    <Button key={tenant.id} variant="outline" className="justify-between" onClick={() => setTenantId(tenant.id)}>{tenant.name} <span className={styles.hint}>{tenant.role}</span></Button>
                  ))}
                </div>
              ) : null}
            </section>
            <form className={`${styles.panel} ${styles.panelPad} grid content-start gap-3`} onSubmit={createTenant}>
              <Label htmlFor="tenant-name">Workspace name</Label>
              <Input id="tenant-name" value={tenantName} placeholder="Acme Product Research" onChange={(event) => setTenantName(event.target.value)} />
              <Button type="submit" disabled={busy === "tenant" || tenantName.trim().length < 2}>{busy === "tenant" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace</Button>
              {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`fleet-app ${styles.app}`}>
      <div className={styles.shell}>
        {header}
        {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {!workspace ? (
          <Skeleton className="h-64 w-full" />
        ) : projectId ? (
          <ProjectView key={projectId} tenantId={tenantId} projectId={projectId} onBack={() => { setProjectId(null); void loadWorkspace(tenantId); }} />
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="projects"><FolderPlus /> Projects ({workspace.projects.length})</TabsTrigger>
              <TabsTrigger value="members"><Users /> Members ({workspace.members.length})</TabsTrigger>
              <TabsTrigger value="audit"><History /> Audit log</TabsTrigger>
              <TabsTrigger value="export"><Download /> Export</TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="mt-4 grid gap-4">
              {canEdit(workspace.role) ? (
                <form className={`${styles.panel} ${styles.panelPad} grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end`} onSubmit={createProject}>
                  <div className="grid gap-1">
                    <Label htmlFor="project-name">New project</Label>
                    <Input id="project-name" value={project.name} placeholder="Q4 onboarding interviews" onChange={(event) => setProject({ ...project, name: event.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="project-description">Research question</Label>
                    <Textarea id="project-description" rows={1} value={project.description} placeholder="Why do new teams stall in week two?" onChange={(event) => setProject({ ...project, description: event.target.value })} />
                  </div>
                  <Button type="submit" disabled={busy === "project" || project.name.trim().length < 2}>{busy === "project" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create project</Button>
                </form>
              ) : (
                <Alert><AlertDescription>You have view access to this workspace.</AlertDescription></Alert>
              )}
              {workspace.projects.length === 0 ? (
                <div className={`${styles.panel} ${styles.panelPad}`}>
                  <h2 className="font-bold">No projects yet</h2>
                  <p className={styles.hint}>Create a project for one research question, then add interviews to it.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {workspace.projects.map((entry) => (
                    <button key={entry.id} type="button" className={`${styles.panel} ${styles.panelPad} ${styles.accentBar} grid gap-1 text-left`} onClick={() => setProjectId(entry.id)}>
                      <strong className="text-lg break-words">{entry.name}</strong>
                      {entry.description ? <span className={styles.hint}>{entry.description}</span> : null}
                      <span className={styles.hint}>Created {formatDateTime(entry.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="members" className="mt-4 grid gap-4">
              {notice ? <Alert><AlertDescription>{notice}</AlertDescription></Alert> : null}
              {canManage(workspace.role) ? (
                <form className={`${styles.panel} ${styles.panelPad} grid gap-3 md:grid-cols-[1fr_260px_auto] md:items-end`} onSubmit={inviteMember}>
                  <div className="grid gap-1">
                    <Label htmlFor="invite-email">Invite by email</Label>
                    <Input id="invite-email" type="email" value={invite.email} placeholder="teammate@company.com" onChange={(event) => setInvite({ ...invite, email: event.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select value={invite.role} onValueChange={(value) => setInvite({ ...invite, role: value })}>
                      <SelectTrigger id="invite-role" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_HELP).map(([role, help]) => <SelectItem key={role} value={role}>{help}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={busy === "invite" || !invite.email.includes("@")}>{busy === "invite" ? <LoaderCircle className="animate-spin" /> : <Users />} Invite</Button>
                  <p className={`${styles.hint} md:col-span-3`}>The person needs a SaaSassin account. Roles are enforced on the server for every read and write.</p>
                </form>
              ) : null}
              <div className={styles.panel}>
                <Table>
                  <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {workspace.members.map((member) => (
                      <TableRow key={member.uid}>
                        <TableCell className="break-all">{member.name ? `${member.name} · ` : ""}{member.email}</TableCell>
                        <TableCell><Badge variant={member.role === "viewer" ? "outline" : "secondary"}>{member.role}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <div className={`${styles.panel} overflow-x-auto`}>
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {workspace.audit.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(event.occurredAt)}</TableCell>
                        <TableCell className="break-all">{event.actor.email}</TableCell>
                        <TableCell><Badge variant="outline">{event.action}</Badge></TableCell>
                        <TableCell className={`${styles.mono} max-w-md whitespace-normal break-words`}>{describeDetails(event.details)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className={`${styles.hint} mt-2`}>Audit events are append-only. Redactions and deletions record who, when and why — never the removed words.</p>
            </TabsContent>

            <TabsContent value="export" className="mt-4">
              <div className={`${styles.panel} ${styles.panelPad} grid gap-3`}>
                <h2 className="text-lg font-bold"><ShieldCheck className="inline" aria-hidden /> Take everything with you</h2>
                <p className={styles.hint}>One versioned JSON file (schema net.saasassin.research.project 1.0.0 inside the shared workspace manifest) with every project, interview, corrected transcript, consent record, highlight span, insight, theme, the insight → highlight → transcript evidence chain, members and the audit log.</p>
                <Button asChild className="w-fit"><a href={`/api/research/tenants/${tenantId}/export`} download><Download /> Download workspace export</a></Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
