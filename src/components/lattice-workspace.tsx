"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Activity,
  BarChart3,
  GitCommitVertical,
  Target,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileUp,
  History,
  KeyRound,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  GrowthPanel,
  IntegrationsPanel,
  MyProgramPanel,
  ReportsPanel,
  ReviewProgramPanel,
  TimelinePanel,
} from "@/components/lattice-program";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import type { IntegrationsSnapshot } from "@/lib/lattice/integrations-data";
import { EMPTY_PROGRAM, type ProgramSnapshot } from "@/lib/lattice/program-types";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  hasPermission,
  type Permission,
} from "@/lib/lattice/permissions";
import {
  getAdjacentCycleStates,
  REVIEW_CYCLE_STATE_LABELS,
  type ReviewCycleState,
  type TransitionPreview,
} from "@/lib/lattice/state-machine";
import type {
  AssignedReview,
  ReviewCycle,
  ReviewTemplate,
  WorkspaceRole,
  WorkspaceSnapshot,
} from "@/types/lattice";

type CsvPreview = {
  rows: Array<{
    line: number;
    name: string;
    email: string;
    title: string;
    team: string;
    managerEmail: string;
    roleId: string;
  }>;
  errors: string[];
  warnings: string[];
};

async function apiJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body as T;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTimestamp(value: string | null) {
  if (!value) return "Pending timestamp";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EmptyPanel({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
}) {
  return (
    <Card className="lattice-empty-panel">
      <CardContent>
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
        <p>{copy}</p>
      </CardContent>
    </Card>
  );
}

function OrganizationOnboarding({ userName }: { userName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiJson("/api/lattice/workspace", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name") }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the organization.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="lattice-onboarding-page">
      <div className="shell lattice-onboarding-grid">
        <section>
          <p className="eyebrow">Authenticated as {userName}</p>
          <h1>Create your performance workspace.</h1>
          <p>
            This first step creates an isolated organization, an owner membership,
            four inspectable roles, and the first immutable audit event in one operation.
          </p>
          <div className="lattice-onboarding-steps">
            <span><strong>01</strong> Name the organization</span>
            <span><strong>02</strong> Import the directory</span>
            <span><strong>03</strong> Launch a review cycle</span>
          </div>
        </section>
        <Card>
          <CardHeader>
            <CardTitle>New organization</CardTitle>
            <CardDescription>Use the company name employees will recognize.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="lattice-form-stack" onSubmit={create}>
              <div className="grid gap-2">
                <Label htmlFor="organization-name">Organization name</Label>
                <Input id="organization-name" name="name" placeholder="Acme Studio" minLength={2} required />
              </div>
              {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                Create secure workspace
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ReviewEditor({
  organizationId,
  review,
  template,
  cycleState,
  onSubmitted,
}: {
  organizationId: string;
  review: AssignedReview;
  template: ReviewTemplate;
  cycleState: ReviewCycleState;
  onSubmitted: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | number>>(review.answers);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const initialized = useRef(false);
  const editable = review.state !== "submitted" && cycleState === "review_writing";
  const url = `/api/lattice/organizations/${organizationId}/cycles/${review.cycleId}/reviews/${review.id}`;

  useEffect(() => {
    if (!editable) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await apiJson(url, { method: "PUT", body: JSON.stringify({ answers, submit: false }) });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [answers, editable, url]);

  async function submit() {
    const missing = template.questions.find(
      (question) => question.required && String(answers[question.id] ?? "").trim() === "",
    );
    if (missing) {
      setError(`Complete “${missing.prompt}” before submitting.`);
      return;
    }
    setSaveState("saving");
    setError("");
    try {
      await apiJson(url, { method: "PUT", body: JSON.stringify({ answers, submit: true }) });
      setSaveState("saved");
      onSubmitted();
    } catch (caught) {
      setSaveState("error");
      setError(caught instanceof Error ? caught.message : "Could not submit the review.");
    }
  }

  return (
    <Card className="lattice-review-editor">
      <CardHeader>
        <div className="lattice-card-heading-row">
          <div>
            <Badge variant={review.state === "submitted" ? "default" : "secondary"}>
              {review.direction} review
            </Badge>
            <CardTitle>{review.subjectName}</CardTitle>
            <CardDescription>{review.cycleName} · {template.name}</CardDescription>
          </div>
          <span className={`autosave-state autosave-${saveState}`}>
            {saveState === "saving" ? <LoaderCircle className="animate-spin" /> : saveState === "error" ? <CircleAlert /> : <Save />}
            {saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Autosaved"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="lattice-form-stack">
        {template.questions.map((question) => (
          <div className="grid gap-2" key={question.id}>
            <Label htmlFor={`${review.cycleId}-${review.id}-${question.id}`}>
              {question.prompt}{question.required ? " *" : ""}
            </Label>
            {question.type === "rating" ? (
              <Select
                value={String(answers[question.id] ?? "")}
                onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: Number(value) }))}
                disabled={!editable}
              >
                <SelectTrigger id={`${review.cycleId}-${review.id}-${question.id}`}><SelectValue placeholder="Choose 1–5" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((rating) => <SelectItem key={rating} value={String(rating)}>{rating} — {rating === 1 ? "Needs focus" : rating === 5 ? "Exceptional" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Textarea
                id={`${review.cycleId}-${review.id}-${question.id}`}
                value={String(answers[question.id] ?? "")}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                disabled={!editable}
                rows={4}
                placeholder="Use specific evidence and outcomes."
              />
            )}
          </div>
        ))}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {review.state === "submitted" ? (
          <Alert><CheckCircle2 /><AlertTitle>Review submitted</AlertTitle><AlertDescription>The response is locked unless an administrator reopens it.</AlertDescription></Alert>
        ) : cycleState !== "review_writing" ? (
          <Alert><Clock3 /><AlertTitle>Review is not open</AlertTitle><AlertDescription>The cycle must be in Review writing before answers can be edited.</AlertDescription></Alert>
        ) : (
          <Button type="button" onClick={submit} disabled={saveState === "saving"}>
            <FileCheck2 /> Submit review
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionGrid({ role }: { role: WorkspaceRole }) {
  return (
    <div className="permission-grid">
      {PERMISSIONS.map((permission) => {
        const allowed = role.permissions.includes(permission);
        return (
          <div className={allowed ? "permission-allowed" : "permission-denied"} key={permission}>
            {allowed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
            <span>{PERMISSION_LABELS[permission]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LatticeWorkspace({
  snapshot,
  program = EMPTY_PROGRAM,
  integrations = null,
}: {
  snapshot: WorkspaceSnapshot;
  program?: ProgramSnapshot;
  integrations?: IntegrationsSnapshot | null;
}) {
  const router = useRouter();
  const organization = snapshot.organization;
  const [activeTab, setActiveTab] = useState("overview");
  const [viewAsRoleId, setViewAsRoleId] = useState("");
  const [requestError, setRequestError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [csv, setCsv] = useState("");
  const [csvName, setCsvName] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [transition, setTransition] = useState<{
    cycle: ReviewCycle;
    targetState: ReviewCycleState;
    preview: TransitionPreview;
  } | null>(null);
  const [simulatedRoleId, setSimulatedRoleId] = useState(snapshot.currentRole?.id ?? "");

  const effectiveRole = snapshot.roles.find((role) => role.id === viewAsRoleId)
    ?? snapshot.currentRole;
  const effectivePermissions = effectiveRole?.permissions ?? [];
  const can = (permission: Permission) => hasPermission(effectivePermissions, permission);

  if (!organization) {
    return <OrganizationOnboarding userName={snapshot.user.name} />;
  }
  const organizationId = organization.id;

  async function refreshAction(key: string, callback: () => Promise<unknown>) {
    setPendingAction(key);
    setRequestError("");
    try {
      await callback();
      router.refresh();
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setPendingAction("");
    }
  }

  async function logout() {
    setPendingAction("logout");
    await fetch("/api/lattice/session", { method: "DELETE" });
    try { await signOut(getFirebaseClientAuth()); } catch { /* server session is already cleared */ }
    router.push("/lattice/sign-in");
    router.refresh();
  }

  async function previewCsv() {
    if (!csv) return;
    setPendingAction("csv-preview");
    setRequestError("");
    try {
      const result = await apiJson<CsvPreview>(`/api/lattice/organizations/${organizationId}/imports`, {
        method: "POST",
        body: JSON.stringify({ csv, dryRun: true }),
      });
      setCsvPreview(result);
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : "Could not preview the import.");
    } finally {
      setPendingAction("");
    }
  }

  async function commitCsv() {
    await refreshAction("csv-import", async () => {
      const result = await apiJson<CsvPreview>(`/api/lattice/organizations/${organizationId}/imports`, {
        method: "POST",
        body: JSON.stringify({ csv, dryRun: false }),
      });
      if (result.errors.length) throw new Error(result.errors[0]);
      setCsv("");
      setCsvName("");
      setCsvPreview(null);
    });
  }

  function downloadSample() {
    const sample = [
      "name,email,title,team,manager_email,role",
      `${snapshot.user.name},${snapshot.user.email},Founder,Leadership,,manager`,
      `Sample Employee,employee@example.com,Designer,Product,${snapshot.user.email},employee`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "saasassin-employees.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const questions = String(form.get("questions") ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({
      prompt: line.replace(/^rating:\s*/i, ""),
      type: /^rating:/i.test(line) ? "rating" as const : "text" as const,
      required: true,
    }));
    const directions = ["self", "manager", "peer", "upward"].filter((direction) => form.get(direction) === "on");
    await refreshAction("template", () => apiJson(`/api/lattice/organizations/${organizationId}/templates`, {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), directions, questions }),
    }));
    formElement.reset();
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await refreshAction("cycle", () => apiJson(`/api/lattice/organizations/${organizationId}/cycles`, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        templateId: form.get("templateId"),
        dueDate: form.get("dueDate") || null,
        peerNominationEnabled: form.get("peerNominationEnabled") === "on",
        calibrationEnabled: form.get("calibrationEnabled") === "on",
        anonymityThreshold: Number(form.get("anonymityThreshold") || 3),
        schedule: {
          launchOn: form.get("launchOn") || null,
          nominationEndsOn: form.get("nominationEndsOn") || null,
          calibrationEndsOn: form.get("calibrationEndsOn") || null,
          acknowledgementEndsOn: form.get("acknowledgementEndsOn") || null,
        },
      }),
    }));
    formElement.reset();
  }

  async function previewTransition(cycle: ReviewCycle, targetState: ReviewCycleState) {
    setPendingAction(`transition-${cycle.id}`);
    setRequestError("");
    try {
      const preview = await apiJson<TransitionPreview>(`/api/lattice/organizations/${organizationId}/cycles/${cycle.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({ targetState, dryRun: true }),
      });
      setTransition({ cycle, targetState, preview });
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : "Could not preview the transition.");
    } finally {
      setPendingAction("");
    }
  }

  async function confirmTransition() {
    if (!transition) return;
    await refreshAction(`transition-${transition.cycle.id}`, () => apiJson(
      `/api/lattice/organizations/${organizationId}/cycles/${transition.cycle.id}/transitions`,
      { method: "POST", body: JSON.stringify({ targetState: transition.targetState, dryRun: false }) },
    ));
    setTransition(null);
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const permissions = PERMISSIONS.filter((permission) => form.get(permission) === "on");
    await refreshAction("role", () => apiJson(`/api/lattice/organizations/${organizationId}/roles`, {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), description: form.get("description"), permissions }),
    }));
    formElement.reset();
  }

  const completion = snapshot.cycles.length
    ? Math.round(snapshot.cycles.reduce((sum, cycle) => sum + (cycle.assignedReviews ? cycle.submittedReviews / cycle.assignedReviews : 0), 0) / snapshot.cycles.length * 100)
    : 0;
  const openReviews = snapshot.assignedReviews.filter((review) => review.state !== "submitted").length;

  return (
    <main className="lattice-app-page fleet-app">
      <div className="shell lattice-app-shell">
        <header className="lattice-app-header">
          <div>
            <p className="eyebrow">Mission 01 / Performance</p>
            <div className="lattice-app-title-row">
              <h1>{organization.name}</h1>
              <Badge variant="outline">{effectiveRole?.name ?? "No role"}</Badge>
            </div>
            <p>People graph, review operations, permissions, and evidence in one tenant-isolated workspace.</p>
          </div>
          <div className="lattice-app-account">
            <Avatar><AvatarFallback>{initials(snapshot.user.name)}</AvatarFallback></Avatar>
            <div><strong>{snapshot.user.name}</strong><span>{snapshot.user.email}</span></div>
            <Button variant="outline" size="icon" onClick={logout} disabled={pendingAction === "logout"} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </header>

        {viewAsRoleId ? (
          <Alert className="view-as-banner">
            <Eye />
            <AlertTitle>Viewing controls as {effectiveRole?.name}</AlertTitle>
            <AlertDescription>Server authorization still uses your real {snapshot.currentRole?.name} role.</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => setViewAsRoleId("")}>Exit view</Button>
          </Alert>
        ) : null}
        {requestError ? (
          <Alert variant="destructive"><CircleAlert /><AlertTitle>Action failed</AlertTitle><AlertDescription>{requestError}</AlertDescription></Alert>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="lattice-workspace-tabs">
          <TabsList className="lattice-tabs-list">
            <TabsTrigger value="overview"><Activity />Overview</TabsTrigger>
            {can("directory.read") ? <TabsTrigger value="people"><Users />People</TabsTrigger> : null}
            {can("reviews.read") || can("reviews.manage") ? <TabsTrigger value="reviews"><BookOpenCheck />Reviews</TabsTrigger> : null}
            {can("reviews.read") ? <TabsTrigger value="growth"><Target />Growth</TabsTrigger> : null}
            {can("reviews.read") ? <TabsTrigger value="timeline"><GitCommitVertical />Timeline</TabsTrigger> : null}
            {can("reports.read") || can("workspace.export") || can("organization.manage") ? <TabsTrigger value="reports"><BarChart3 />Reports</TabsTrigger> : null}
            {can("roles.read") ? <TabsTrigger value="roles"><KeyRound />Permissions</TabsTrigger> : null}
            {can("audit.read") ? <TabsTrigger value="audit"><History />Audit</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="overview" className="lattice-tab-panel">
            <div className="lattice-stat-grid">
              <Card><CardHeader><CardDescription>Employees</CardDescription><CardTitle>{snapshot.members.length}</CardTitle></CardHeader><CardContent><Users /> Across {new Set(snapshot.members.map((member) => member.teamName).filter(Boolean)).size || 0} teams</CardContent></Card>
              <Card><CardHeader><CardDescription>My open reviews</CardDescription><CardTitle>{openReviews}</CardTitle></CardHeader><CardContent><FileCheck2 /> Autosave active during writing</CardContent></Card>
              <Card><CardHeader><CardDescription>Cycle completion</CardDescription><CardTitle>{completion}%</CardTitle></CardHeader><CardContent><Activity /> Submitted assignments</CardContent></Card>
              <Card><CardHeader><CardDescription>Audit events</CardDescription><CardTitle>{snapshot.auditEvents.length}</CardTitle></CardHeader><CardContent><ShieldCheck /> Append-only history</CardContent></Card>
            </div>
            {program.myMemberId ? <MyProgramPanel organizationId={organizationId} program={program} /> : null}
            <div className="lattice-overview-grid">
              <Card>
                <CardHeader><CardTitle>First review launch</CardTitle><CardDescription>Complete this vertical path against live Firebase data.</CardDescription></CardHeader>
                <CardContent className="lattice-checklist">
                  <Button variant="ghost" onClick={() => setActiveTab("people")}><span className={snapshot.members.length > 1 ? "done" : ""}>{snapshot.members.length > 1 ? <Check /> : "1"}</span><div><strong>Import employees</strong><p>Preview the reporting graph before writing.</p></div></Button>
                  <Button variant="ghost" onClick={() => setActiveTab("reviews")}><span className={snapshot.templates.length ? "done" : ""}>{snapshot.templates.length ? <Check /> : "2"}</span><div><strong>Create a template</strong><p>Define directions and required evidence prompts.</p></div></Button>
                  <Button variant="ghost" onClick={() => setActiveTab("reviews")}><span className={snapshot.cycles.some((cycle) => cycle.state !== "draft") ? "done" : ""}>{snapshot.cycles.some((cycle) => cycle.state !== "draft") ? <Check /> : "3"}</span><div><strong>Preview and launch</strong><p>Inspect assignments and blockers before transition.</p></div></Button>
                  <Button variant="ghost" onClick={() => setActiveTab("audit")}><span className={snapshot.auditEvents.some((event) => event.eventType === "review.submitted") ? "done" : ""}>{snapshot.auditEvents.some((event) => event.eventType === "review.submitted") ? <Check /> : "4"}</span><div><strong>Submit and verify</strong><p>Complete a review and inspect its immutable event.</p></div></Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>The latest organization-scoped audit events.</CardDescription></CardHeader>
                <CardContent className="lattice-activity-list">
                  {snapshot.auditEvents.slice(0, 5).map((event) => (
                    <div key={event.id}><span><History /></span><div><strong>{event.summary}</strong><p>{event.actorName} · {formatTimestamp(event.createdAt)}</p></div></div>
                  ))}
                  {!snapshot.auditEvents.length ? <p>No events yet.</p> : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="people" className="lattice-tab-panel">
            <div className="lattice-section-heading">
              <div><p className="eyebrow">Organization graph</p><h2>Employee directory</h2><p>Teams and reporting lines are resolved by work email before import.</p></div>
              {can("directory.manage") ? <Button variant="outline" onClick={downloadSample}><Download /> Sample CSV</Button> : null}
            </div>
            {can("directory.manage") ? (
              <Card>
                <CardHeader><CardTitle>CSV import</CardTitle><CardDescription>Required headers: name and email. Optional: title, team, manager_email, role.</CardDescription></CardHeader>
                <CardContent className="lattice-import-grid">
                  <div className="grid gap-2">
                    <Label htmlFor="employee-csv">Employee CSV</Label>
                    <Input id="employee-csv" type="file" accept=".csv,text/csv" onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setCsv(await file.text());
                      setCsvName(file.name);
                      setCsvPreview(null);
                    }} />
                    <span>{csvName || "No file selected"}</span>
                  </div>
                  <div className="lattice-inline-actions">
                    <Button variant="outline" onClick={previewCsv} disabled={!csv || pendingAction === "csv-preview"}>{pendingAction === "csv-preview" ? <LoaderCircle className="animate-spin" /> : <Eye />} Preview</Button>
                    <Button onClick={commitCsv} disabled={!csvPreview || csvPreview.errors.length > 0 || pendingAction === "csv-import"}>{pendingAction === "csv-import" ? <LoaderCircle className="animate-spin" /> : <FileUp />} Import {csvPreview?.rows.length ?? ""}</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {csvPreview ? (
              <Card>
                <CardHeader><CardTitle>Import preview</CardTitle><CardDescription>{csvPreview.rows.length} valid rows · {csvPreview.errors.length} errors · {csvPreview.warnings.length} warnings</CardDescription></CardHeader>
                <CardContent className="lattice-form-stack">
                  {csvPreview.errors.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Fix before import</AlertTitle><AlertDescription>{csvPreview.errors.join(" ")}</AlertDescription></Alert> : null}
                  {csvPreview.warnings.length ? <Alert><CircleAlert /><AlertTitle>Review mappings</AlertTitle><AlertDescription>{csvPreview.warnings.join(" ")}</AlertDescription></Alert> : null}
                  <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Team</TableHead><TableHead>Manager</TableHead><TableHead>Role</TableHead></TableRow></TableHeader><TableBody>{csvPreview.rows.slice(0, 8).map((row) => <TableRow key={`${row.line}-${row.email}`}><TableCell><strong>{row.name}</strong><span>{row.email}</span></TableCell><TableCell>{row.team || "—"}</TableCell><TableCell>{row.managerEmail || "—"}</TableCell><TableCell><Badge variant="secondary">{row.roleId}</Badge></TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardContent className="lattice-table-card">
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Title</TableHead><TableHead>Team</TableHead><TableHead>Manager</TableHead><TableHead>Access</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{snapshot.members.map((member) => <TableRow key={member.id}><TableCell><div className="employee-cell"><Avatar><AvatarFallback>{initials(member.name)}</AvatarFallback></Avatar><div><strong>{member.name}</strong><span>{member.email}</span></div></div></TableCell><TableCell>{member.title || "—"}</TableCell><TableCell>{member.teamName || "—"}</TableCell><TableCell>{member.managerName || "—"}</TableCell><TableCell>{snapshot.roles.find((role) => role.id === member.roleId)?.name ?? member.roleId}</TableCell><TableCell><Badge variant={member.status === "active" ? "default" : "outline"}>{member.status}</Badge></TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Review operations</p><h2>Templates, cycles, and assignments</h2><p>Every phase change is previewed, adjacent, reversible, and blocked by incomplete work.</p></div></div>
            {snapshot.assignedReviews.length ? (
              <section className="lattice-review-stack">
                <div className="lattice-subheading"><h3>My assigned reviews</h3><Badge>{openReviews} open</Badge></div>
                {snapshot.assignedReviews.map((review) => {
                  const template = snapshot.templates.find((item) => item.id === review.templateId);
                  const cycle = snapshot.cycles.find((item) => item.id === review.cycleId);
                  return template && cycle ? <ReviewEditor key={`${review.cycleId}/${review.id}`} organizationId={organization.id} review={review} template={template} cycleState={cycle.state} onSubmitted={() => router.refresh()} /> : null;
                })}
              </section>
            ) : null}
            {can("reviews.manage") ? (
              <div className="lattice-builder-grid">
                <Card>
                  <CardHeader><CardTitle>1. Review template</CardTitle><CardDescription>One prompt per line. Prefix a line with “Rating:” for a 1–5 response.</CardDescription></CardHeader>
                  <CardContent><form className="lattice-form-stack" onSubmit={createTemplate}>
                    <div className="grid gap-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" name="name" placeholder="Quarterly performance review" required /></div>
                    <div className="grid gap-2"><Label>Review directions</Label><div className="lattice-checkbox-row">{["self", "manager", "peer", "upward"].map((direction) => <Label key={direction} className="checkbox-label"><Checkbox name={direction} defaultChecked={direction === "self" || direction === "manager"} />{direction}</Label>)}</div></div>
                    <div className="grid gap-2"><Label htmlFor="template-questions">Questions</Label><Textarea id="template-questions" name="questions" rows={6} defaultValue={"What outcomes are you most proud of?\nWhat evidence demonstrates your impact?\nRating: Overall performance\nWhat should be the next focus area?"} required /></div>
                    <Button type="submit" disabled={pendingAction === "template"}>{pendingAction === "template" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create template</Button>
                  </form></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>2. Review cycle</CardTitle><CardDescription>Create a draft. Launch remains a separate previewed action.</CardDescription></CardHeader>
                  <CardContent>{snapshot.templates.length ? <form className="lattice-form-stack" onSubmit={createCycle}>
                    <div className="grid gap-2"><Label htmlFor="cycle-name">Cycle name</Label><Input id="cycle-name" name="name" placeholder="Q3 2026 review" required /></div>
                    <div className="grid gap-2"><Label htmlFor="cycle-template">Template</Label><Select name="templateId" required><SelectTrigger id="cycle-template"><SelectValue placeholder="Choose a template" /></SelectTrigger><SelectContent>{snapshot.templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-2"><Label htmlFor="cycle-due">Writing deadline</Label><Input id="cycle-due" name="dueDate" type="date" /></div>
                    <div className="lattice-two-field-grid">
                      <div className="grid gap-2"><Label htmlFor="cycle-launch">Scheduled launch</Label><Input id="cycle-launch" name="launchOn" type="date" /></div>
                      <div className="grid gap-2"><Label htmlFor="cycle-nomination-end">Nomination ends</Label><Input id="cycle-nomination-end" name="nominationEndsOn" type="date" /></div>
                      <div className="grid gap-2"><Label htmlFor="cycle-calibration-end">Calibration ends</Label><Input id="cycle-calibration-end" name="calibrationEndsOn" type="date" /></div>
                      <div className="grid gap-2"><Label htmlFor="cycle-ack-end">Acknowledgement ends</Label><Input id="cycle-ack-end" name="acknowledgementEndsOn" type="date" /></div>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="cycle-anonymity">Minimum peer / upward responses before sharing</Label><Input id="cycle-anonymity" name="anonymityThreshold" type="number" min={1} max={10} defaultValue={3} /></div>
                    <Label className="checkbox-label"><Checkbox name="peerNominationEnabled" />Include peer nomination phase</Label>
                    <Label className="checkbox-label"><Checkbox name="calibrationEnabled" defaultChecked />Include calibration phase</Label>
                    <Button type="submit" disabled={pendingAction === "cycle"}>{pendingAction === "cycle" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create draft cycle</Button>
                  </form> : <Alert><CircleAlert /><AlertTitle>Create a template first</AlertTitle><AlertDescription>Cycles reference a versioned question set.</AlertDescription></Alert>}</CardContent>
                </Card>
              </div>
            ) : null}
            <section className="lattice-review-stack">
              <div className="lattice-subheading"><h3>Review cycles</h3><Badge variant="outline">{snapshot.cycles.length}</Badge></div>
              {snapshot.cycles.length ? snapshot.cycles.map((cycle) => {
                const adjacent = getAdjacentCycleStates(cycle.state, cycle);
                return <Card key={cycle.id}><CardContent className="cycle-row"><div className="cycle-state-mark"><span>{REVIEW_CYCLE_STATE_LABELS[cycle.state]}</span><strong>{cycle.submittedReviews}/{cycle.assignedReviews}</strong><small>submitted</small></div><div><h4>{cycle.name}</h4><p>{cycle.templateName} · {cycle.dueDate ? `due ${cycle.dueDate}` : "manual deadline"}</p><div className="cycle-flags">{cycle.peerNominationEnabled ? <Badge variant="secondary">Peer nomination</Badge> : null}{cycle.calibrationEnabled ? <Badge variant="secondary">Calibration</Badge> : null}</div></div>{can("reviews.manage") ? <div className="cycle-actions">{adjacent.previous ? <Button variant="outline" onClick={() => previewTransition(cycle, adjacent.previous!)} disabled={pendingAction === `transition-${cycle.id}`}><ArrowLeft /> Reopen {REVIEW_CYCLE_STATE_LABELS[adjacent.previous]}</Button> : null}{adjacent.next ? <Button onClick={() => previewTransition(cycle, adjacent.next!)} disabled={pendingAction === `transition-${cycle.id}`}>{pendingAction === `transition-${cycle.id}` ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}{cycle.state === "draft" ? "Preview launch" : `Preview ${REVIEW_CYCLE_STATE_LABELS[adjacent.next]}`}</Button> : <Badge><CheckCircle2 /> Complete</Badge>}</div> : null}</CardContent></Card>;
              }) : <EmptyPanel icon={BookOpenCheck} title="No review cycles" copy="Create a template and a draft cycle to start the first performance review." />}
            </section>
            <div className="lattice-subheading"><h3>Nominations, deadlines, calibration, and packets</h3></div>
            <ReviewProgramPanel organizationId={organizationId} program={program} members={snapshot.members} canManage={can("reviews.manage")} canCalibrate={can("reviews.calibrate")} myOutstandingByCycle={snapshot.assignedReviews.reduce<Record<string, number>>((counts, review) => review.state === "submitted" ? counts : { ...counts, [review.cycleId]: (counts[review.cycleId] ?? 0) + 1 }, {})} />
          </TabsContent>

          <TabsContent value="growth" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Continuous performance</p><h2>Goals, feedback, and one-to-ones</h2><p>Everything here is visible only to the people it concerns, their manager, or the audience the author chose.</p></div></div>
            <GrowthPanel organizationId={organizationId} program={program} members={snapshot.members} canManage={can("reviews.manage")} />
          </TabsContent>

          <TabsContent value="timeline" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Evidence</p><h2>Employee timeline</h2><p>One newest-first record of the goals, feedback, reviews, packets, and one-to-ones you are permitted to see.</p></div></div>
            <TimelinePanel program={program} members={snapshot.members} />
          </TabsContent>

          <TabsContent value="reports" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Reporting and export</p><h2>Program health, filterable</h2><p>Completion, acknowledgement, goals, and calibration — plus a complete, checksummed workspace export in an open, versioned schema.</p></div></div>
            <ReportsPanel organizationId={organizationId} program={program} members={snapshot.members} canExport={can("workspace.export")} />
            {integrations && can("organization.manage") ? <IntegrationsPanel organizationId={organizationId} integrations={integrations} /> : null}
          </TabsContent>

          <TabsContent value="roles" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Permission simulator</p><h2>Know who can do what before launch.</h2><p>Select any role to inspect its exact grants, then view the workspace controls through that role.</p></div></div>
            <Card>
              <CardHeader><CardTitle>Simulate access</CardTitle><CardDescription>This never changes your server session or persisted role.</CardDescription></CardHeader>
              <CardContent className="lattice-simulator">
                <div className="grid gap-2"><Label htmlFor="simulated-role">Role</Label><Select value={simulatedRoleId} onValueChange={setSimulatedRoleId}><SelectTrigger id="simulated-role"><SelectValue /></SelectTrigger><SelectContent>{snapshot.roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div>
                <Button variant="outline" onClick={() => setViewAsRoleId(simulatedRoleId)} disabled={!simulatedRoleId || !can("roles.simulate")}><Eye /> View as role</Button>
              </CardContent>
            </Card>
            {snapshot.roles.filter((role) => role.id === simulatedRoleId).map((role) => <Card key={role.id}><CardHeader><div className="lattice-card-heading-row"><div><CardTitle>{role.name}</CardTitle><CardDescription>{role.description}</CardDescription></div><Badge variant={role.builtIn ? "secondary" : "outline"}>{role.builtIn ? "Built in" : "Custom"}</Badge></div></CardHeader><CardContent><PermissionGrid role={role} /></CardContent></Card>)}
            {can("roles.manage") ? <Card><CardHeader><CardTitle>Create a custom role</CardTitle><CardDescription>Compose only the capabilities this responsibility needs.</CardDescription></CardHeader><CardContent><form className="lattice-form-stack" onSubmit={createRole}><div className="lattice-two-field-grid"><div className="grid gap-2"><Label htmlFor="role-name">Role name</Label><Input id="role-name" name="name" placeholder="Review coordinator" required /></div><div className="grid gap-2"><Label htmlFor="role-description">Description</Label><Input id="role-description" name="description" placeholder="Launches cycles without employee administration" /></div></div><div className="custom-permission-grid">{PERMISSIONS.map((permission) => <Label key={permission} className="checkbox-label"><Checkbox name={permission} />{PERMISSION_LABELS[permission]}</Label>)}</div><Button type="submit" disabled={pendingAction === "role"}>{pendingAction === "role" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create role</Button></form></CardContent></Card> : null}
          </TabsContent>

          <TabsContent value="audit" className="lattice-tab-panel">
            <div className="lattice-section-heading"><div><p className="eyebrow">Append-only evidence</p><h2>Immutable audit history</h2><p>Rules allow event creation by authorized actors and deny every update or delete.</p></div><Badge variant="outline">Latest 100 events</Badge></div>
            {snapshot.auditEvents.length ? <Card><CardContent className="lattice-table-card"><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Actor</TableHead><TableHead>Entity</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{snapshot.auditEvents.map((event) => <TableRow key={event.id}><TableCell><strong>{event.summary}</strong><span>{event.eventType}</span></TableCell><TableCell>{event.actorName}</TableCell><TableCell><Badge variant="secondary">{event.entityType}</Badge></TableCell><TableCell>{formatTimestamp(event.createdAt)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : <EmptyPanel icon={History} title="No audit events" copy="Organization, directory, role, cycle, and review actions appear here." />}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(transition)} onOpenChange={(open) => !open && setTransition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transition?.preview.direction === "reverse" ? "Preview phase reopen" : "Preview phase transition"}</DialogTitle>
            <DialogDescription>{transition?.cycle.name}: {transition ? REVIEW_CYCLE_STATE_LABELS[transition.preview.from] : ""} → {transition ? REVIEW_CYCLE_STATE_LABELS[transition.preview.to] : ""}</DialogDescription>
          </DialogHeader>
          <div className="transition-preview">
            {transition?.preview.blockers.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Transition blocked</AlertTitle><AlertDescription>{transition.preview.blockers.join(" ")}</AlertDescription></Alert> : <Alert><ShieldCheck /><AlertTitle>Ready to apply</AlertTitle><AlertDescription>No incomplete-work blockers were detected.</AlertDescription></Alert>}
            {transition?.preview.effects.map((effect) => <p key={effect}><ArrowRight />{effect}</p>)}
            {transition?.preview.warnings.map((warning) => <p key={warning}><RefreshCw />{warning}</p>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTransition(null)}>Cancel</Button><Button onClick={confirmTransition} disabled={!transition?.preview.canTransition || pendingAction.startsWith("transition-")}>{pendingAction.startsWith("transition-") ? <LoaderCircle className="animate-spin" /> : transition?.preview.direction === "reverse" ? <ArrowLeft /> : <ArrowRight />}Confirm transition</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
