"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileUp,
  History,
  KeyRound,
  LoaderCircle,
  Mail,
  MessageSquareHeart,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { PerformanceMark } from "@/brands/performance/mark";
import {
  CycleDetails,
  DuePhasesBanner,
  FeedbackItem,
  FeedbackPanel,
  GiveFeedbackDialog,
  GoalsPanel,
  GoalsSummary,
  IntegrationsPanel,
  MyPackets,
  NotificationList,
  NotificationsPopover,
  OneOnOnesPanel,
  PersonTimeline,
  ReportsPanel,
  timelineSubjects,
} from "@/components/lattice-program";
import {
  isPerformanceView,
  PerformanceShell,
  visibleViews,
  type PerformanceView,
} from "@/components/lattice-shell";
import {
  AvatarStack,
  EmptyState,
  firstName,
  formatDate,
  formatDateTime,
  formatRelative,
  Meter,
  PageHeader,
  PeopleProvider,
  PersonAvatar,
  PersonLine,
  SectionTitle,
  StatCard,
  StatusPill,
} from "@/components/lattice-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { toast } from "@/components/ui/toast";
import type { IntegrationsSnapshot } from "@/lib/lattice/integrations-data";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  hasPermission,
  type Permission,
} from "@/lib/lattice/permissions";
import { REVIEW_DIRECTION_LABELS } from "@/lib/lattice/program";
import { EMPTY_PROGRAM, type ProgramSnapshot } from "@/lib/lattice/program-types";
import {
  getAdjacentCycleStates,
  getCyclePath,
  REVIEW_CYCLE_STATE_LABELS,
  type ReviewCycleState,
  type TransitionPreview,
} from "@/lib/lattice/state-machine";
import { cn } from "@/lib/utils";
import type {
  AssignedReview,
  ReviewCycle,
  ReviewTemplate,
  WorkspaceMember,
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

type ReviewsTab = "write" | "results" | "cycles" | "templates";

async function apiJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body as T;
}

const head = "h-9 bg-muted/50 text-xs font-medium text-muted-foreground";

const PHASE_SHORT: Record<ReviewCycleState, string> = {
  draft: "Draft",
  peer_nomination: "Nominate",
  review_writing: "Write",
  calibration: "Calibrate",
  acknowledgement: "Acknowledge",
  closed: "Closed",
};

const RATING_LABELS = ["Needs focus", "Developing", "Solid", "Strong", "Exceptional"];

function reviewTitle(review: Pick<AssignedReview, "direction" | "subjectName">) {
  if (review.direction === "self") return "Your self review";
  if (review.direction === "manager") return `Manager review of ${review.subjectName}`;
  if (review.direction === "upward") return `Upward review of ${review.subjectName}`;
  return `Peer review of ${review.subjectName}`;
}

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

export function LatticeWorkspace({
  snapshot,
  program = EMPTY_PROGRAM,
  integrations = null,
  photos = {},
}: {
  snapshot: WorkspaceSnapshot;
  program?: ProgramSnapshot;
  integrations?: IntegrationsSnapshot | null;
  /** Profile photos by directory member id (src/lib/lattice/account.ts memberPhotos). */
  photos?: Record<string, string>;
}) {
  const searchParams = useSearchParams();
  const organization = snapshot.organization;
  const [viewAsRoleId, setViewAsRoleId] = useState("");
  const [reviewsTab, setReviewsTab] = useState<ReviewsTab>("write");
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRecipient, setFeedbackRecipient] = useState("");

  const effectiveRole = snapshot.roles.find((role) => role.id === viewAsRoleId) ?? snapshot.currentRole;
  const permissions = useMemo(() => effectiveRole?.permissions ?? [], [effectiveRole]);
  const can = (permission: Permission) => hasPermission(permissions, permission);
  const allowed = visibleViews(permissions);
  const requested = searchParams.get("view");
  const view: PerformanceView = isPerformanceView(requested) && allowed.includes(requested) ? requested : "home";

  if (!organization) {
    return <OrganizationOnboarding userName={snapshot.user.name} />;
  }
  const organizationId = organization.id;
  const me = snapshot.currentMember?.id ?? null;

  function navigate(next: PerformanceView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "home") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
    window.scrollTo({ top: 0 });
  }

  function openReviews(tab: ReviewsTab, reviewKey?: string) {
    setReviewsTab(tab);
    if (reviewKey) setSelectedReview(reviewKey);
    navigate("reviews");
  }

  function giveFeedback(recipientId = "") {
    setFeedbackRecipient(recipientId);
    setFeedbackOpen(true);
  }

  return (
    <PeopleProvider members={snapshot.members} photos={photos} meId={me}>
      <PerformanceShell
        organization={organization}
        memberships={snapshot.memberships}
        permissions={permissions}
        roleName={effectiveRole?.name}
        view={view}
        onNavigate={navigate}
        topBar={<NotificationsPopover organizationId={organizationId} program={program} />}
        banner={viewAsRoleId ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-accent/50 bg-accent px-4 py-2.5 text-sm text-accent-foreground sm:px-8">
            <Eye className="size-4" aria-hidden="true" />
            <span className="flex-1">
              Previewing Performance as <strong>{effectiveRole?.name}</strong>. Your own access hasn&apos;t changed.
            </span>
            <Button size="sm" variant="outline" onClick={() => setViewAsRoleId("")}>Stop previewing</Button>
          </div>
        ) : null}
      >
        <div className="grid gap-8">
          {view === "home" ? (
            <HomeView
              snapshot={snapshot}
              program={program}
              can={can}
              navigate={navigate}
              openReviews={openReviews}
              giveFeedback={() => giveFeedback()}
            />
          ) : null}
          {view === "reviews" ? (
            <ReviewsView
              snapshot={snapshot}
              program={program}
              can={can}
              tab={reviewsTab}
              onTabChange={setReviewsTab}
              selectedReview={selectedReview}
              onSelectReview={setSelectedReview}
            />
          ) : null}
          {view === "goals" ? <GoalsView snapshot={snapshot} program={program} can={can} /> : null}
          {view === "feedback" ? (
            <>
              <PageHeader
                title="Feedback"
                description="Praise and suggestions between colleagues, visible only to the people each author chose."
                actions={<Button onClick={() => giveFeedback()}><MessageSquareHeart /> Give feedback</Button>}
              />
              <FeedbackPanel program={program} />
            </>
          ) : null}
          {view === "one-on-ones" ? <OneOnOnesView snapshot={snapshot} program={program} /> : null}
          {view === "people" ? <PeopleView snapshot={snapshot} program={program} can={can} giveFeedback={giveFeedback} /> : null}
          {view === "reports" ? (
            <>
              <PageHeader title="Reports" description="Completion, acknowledgement, goals and calibration across the company. Review answers and feedback text never appear here." />
              <ReportsPanel organizationId={organizationId} program={program} members={snapshot.members} canExport={can("workspace.export")} />
            </>
          ) : null}
          {view === "permissions" ? (
            <PermissionsView snapshot={snapshot} can={can} onPreview={(roleId) => { setViewAsRoleId(roleId); navigate("home"); }} />
          ) : null}
          {view === "audit" ? <AuditView snapshot={snapshot} /> : null}
          {view === "integrations" ? (
            <>
              <PageHeader title="Integrations" description="Connect Performance to the rest of your stack with read-only API keys and signed webhooks." />
              {integrations ? <IntegrationsPanel organizationId={organizationId} integrations={integrations} /> : null}
            </>
          ) : null}
        </div>
      </PerformanceShell>
      <GiveFeedbackDialog
        key={feedbackRecipient || "new"}
        organizationId={organizationId}
        members={snapshot.members}
        me={me}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        defaultRecipient={feedbackRecipient}
      />
    </PeopleProvider>
  );
}

// ---------------------------------------------------------------------------
// First run: no organization yet
// ---------------------------------------------------------------------------

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

  const steps = [
    { icon: Users, title: "Bring in your people", copy: "Import a CSV with names, teams and managers." },
    { icon: ClipboardCheck, title: "Write a review template", copy: "Self, manager, peer and upward questions." },
    { icon: CalendarClock, title: "Launch your first cycle", copy: "Preview every phase before you move it on." },
  ];

  return (
    <div className="min-h-dvh bg-brand-subtle">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <span className="flex items-center gap-2">
          <PerformanceMark className="size-7" />
          <span className="brand-heading text-lg">Performance</span>
        </span>
        <AccountMenu product="performance" accountHref="/lattice/account" signInHref="/lattice/sign-in" />
      </header>
      <main className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-8 pb-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <section>
          <p className="text-sm font-medium text-primary">Welcome{userName ? `, ${firstName(userName)}` : ""}</p>
          <h1 className="brand-heading mt-2 text-4xl leading-tight sm:text-5xl">Set up Performance for your company</h1>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            Start with your organization&apos;s name. You&apos;ll be its owner, and you can invite everyone else when you import your people.
          </p>
          <ol className="mt-8 grid gap-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{index + 1}. {step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <Card className="gap-5 px-6 py-7 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.25)]">
          <div>
            <h2 className="brand-heading text-2xl">Your organization</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the name your people will recognize.</p>
          </div>
          <form className="grid gap-4" onSubmit={create}>
            <div className="grid gap-1.5">
              <Label htmlFor="organization-name">Organization name</Label>
              <Input id="organization-name" name="name" placeholder="Acme Studio" minLength={2} required className="h-10" />
            </div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Button type="submit" size="lg" className="h-10" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
              Create organization
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function PhaseStepper({ cycle, className }: { cycle: Pick<ReviewCycle, "state" | "peerNominationEnabled" | "calibrationEnabled">; className?: string }) {
  const path = getCyclePath(cycle).filter((state) => state !== "draft");
  const currentIndex = path.indexOf(cycle.state as (typeof path)[number]);
  return (
    <ol className={cn("flex items-center gap-1 overflow-x-auto", className)} aria-label="Cycle phases">
      {path.map((state, index) => {
        const done = cycle.state !== "draft" && index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={state} className="flex items-center gap-1">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs whitespace-nowrap",
                done && "text-primary",
                current && "bg-primary font-medium text-primary-foreground",
                !done && !current && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" aria-hidden="true" /> : null}
              {PHASE_SHORT[state]}
            </span>
            {index < path.length - 1 ? <span className="h-px w-3 bg-border" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A compact phase indicator for narrow cards: one segment per phase. */
function PhaseProgress({ cycle }: { cycle: Pick<ReviewCycle, "state" | "peerNominationEnabled" | "calibrationEnabled"> }) {
  const path = getCyclePath(cycle).filter((state) => state !== "draft");
  const index = Math.max(0, path.indexOf(cycle.state as (typeof path)[number]));
  const next = path[index + 1];
  return (
    <div className="grid gap-2">
      <div className="flex gap-1" aria-hidden="true">
        {path.map((state, position) => (
          <span key={state} className={cn("h-1.5 flex-1 rounded-full", position < index ? "bg-primary/40" : position === index ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Phase {index + 1} of {path.length}: <span className="font-medium text-foreground">{REVIEW_CYCLE_STATE_LABELS[cycle.state]}</span>
        {next ? ` · then ${REVIEW_CYCLE_STATE_LABELS[next].toLowerCase()}` : ""}
      </p>
    </div>
  );
}

type Task = { key: string; icon: typeof ClipboardCheck; memberId?: string | null; name?: string; title: string; detail: string; action: string; onClick: () => void; tone?: "attention" | "negative" };

function HomeView({
  snapshot,
  program,
  can,
  navigate,
  openReviews,
  giveFeedback,
}: {
  snapshot: WorkspaceSnapshot;
  program: ProgramSnapshot;
  can: (permission: Permission) => boolean;
  navigate: (view: PerformanceView) => void;
  openReviews: (tab: ReviewsTab, reviewKey?: string) => void;
  giveFeedback: () => void;
}) {
  const me = snapshot.currentMember?.id ?? null;
  const cycleById = new Map(snapshot.cycles.map((cycle) => [cycle.id, cycle]));
  const now = new Date(program.now);
  const openReviewsList = snapshot.assignedReviews.filter((review) => review.state !== "submitted" && cycleById.get(review.cycleId)?.state === "review_writing");

  const tasks: Task[] = [];
  for (const packet of program.packets.filter((entry) => entry.subjectId === me && entry.state === "released")) {
    if (program.cycles.find((cycle) => cycle.id === packet.cycleId)?.state !== "acknowledgement") continue;
    tasks.push({ key: `packet-${packet.cycleId}`, icon: FileCheck2, title: `Your ${packet.cycleName} results are ready`, detail: "Read them and acknowledge", action: "Read", onClick: () => openReviews("results"), tone: "attention" });
  }
  for (const review of openReviewsList) {
    const cycle = cycleById.get(review.cycleId);
    const overdue = cycle?.dueDate ? new Date(`${cycle.dueDate}T23:59:59Z`) < now : false;
    tasks.push({
      key: `review-${review.cycleId}-${review.id}`,
      icon: ClipboardCheck,
      memberId: review.subjectId,
      name: review.subjectName,
      title: reviewTitle(review),
      detail: `${review.cycleName}${cycle?.dueDate ? ` · ${overdue ? "was due" : "due"} ${formatDate(cycle.dueDate)}` : ""}${Object.keys(review.answers).length ? " · draft saved" : ""}`,
      action: Object.keys(review.answers).length ? "Continue" : "Write",
      onClick: () => openReviews("write", `${review.cycleId}/${review.id}`),
      tone: overdue ? "negative" : undefined,
    });
  }
  for (const nomination of program.nominations.filter((entry) => entry.canDecide && entry.state === "pending")) {
    tasks.push({ key: `nomination-${nomination.id}`, icon: UserCheck, memberId: nomination.peerId, name: nomination.peerName, title: `Approve ${nomination.peerName} as a peer for ${nomination.subjectName}`, detail: "Peer nomination", action: "Review", onClick: () => openReviews("cycles") });
  }
  const upcomingMeetings = program.oneOnOnes
    .filter((meeting) => meeting.status === "scheduled" && (meeting.managerId === me || meeting.reportId === me))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 2);
  for (const meeting of upcomingMeetings) {
    const other = meeting.managerId === me ? { id: meeting.reportId, name: meeting.reportName } : { id: meeting.managerId, name: meeting.managerName };
    tasks.push({ key: `meeting-${meeting.id}`, icon: CalendarClock, memberId: other.id, name: other.name, title: `One-on-one with ${other.name}`, detail: `${formatDate(meeting.scheduledFor, { weekday: "short", month: "short", day: "numeric" })} · ${meeting.agenda.length} on the agenda`, action: "Prepare", onClick: () => navigate("one-on-ones") });
  }

  const activeCycles = snapshot.cycles.filter((cycle) => cycle.state !== "draft" && cycle.state !== "closed");
  const writingCycle = activeCycles.find((cycle) => cycle.state === "review_writing");
  const ackCycle = program.cycles.find((cycle) => cycle.state === "acknowledgement");
  const ackPackets = ackCycle ? program.packets.filter((packet) => packet.cycleId === ackCycle.id) : [];
  const goals = program.goals;
  const healthyGoals = goals.filter((goal) => goal.status === "on_track" || goal.status === "done").length;
  const praise = program.feedback.filter((item) => item.kind === "praise" && item.visibility === "public").slice(0, 3);
  const receivedFeedback = program.feedback.filter((item) => item.recipientId === me);
  const myGoals = goals.filter((goal) => goal.ownerId === me);
  const showOrgStats = can("reports.read");
  const settingUp = !snapshot.cycles.length && (can("reviews.manage") || can("directory.manage"));
  const setupSteps = [
    { done: snapshot.members.length > 1, title: "Bring in your people", copy: "Import a CSV with names, teams and managers. People join when they sign in with that email.", action: "Import people", onClick: () => navigate("people"), allowed: can("directory.manage") },
    { done: snapshot.templates.length > 0, title: "Write a review template", copy: "The questions for self, manager, peer and upward reviews.", action: "New template", onClick: () => openReviews("templates"), allowed: can("reviews.manage") },
    { done: snapshot.cycles.some((cycle) => cycle.state !== "draft"), title: "Launch your first review cycle", copy: "See exactly who will be asked to write what before anything is sent.", action: "Open cycles", onClick: () => openReviews("cycles"), allowed: can("reviews.manage") },
    { done: goals.length > 0, title: "Set a goal", copy: "Give your first review something concrete to point at.", action: "New goal", onClick: () => navigate("goals"), allowed: can("reviews.read") },
  ].filter((step) => step.allowed);

  return (
    <>
      <PageHeader
        title={`${settingUp ? "Welcome" : "Welcome back"}, ${firstName(snapshot.currentMember?.name || snapshot.user.name)}`}
        description={`${snapshot.organization?.name} · ${formatDate(program.now === EMPTY_PROGRAM.now ? null : program.now, { weekday: "long", month: "long", day: "numeric" })}`}
        actions={<Button onClick={giveFeedback}><Sparkles /> Give feedback</Button>}
      />

      <DuePhasesBanner organizationId={snapshot.organization!.id} program={program} canManage={can("reviews.manage")} />

      {settingUp ? (
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-semibold">Set up Performance</h2>
              <p className="text-sm text-muted-foreground">A few steps to your first review cycle.</p>
            </div>
            <div className="flex min-w-48 items-center gap-3">
              <Meter value={(setupSteps.filter((step) => step.done).length / Math.max(1, setupSteps.length)) * 100} label="Setup progress" />
              <span className="text-xs whitespace-nowrap text-muted-foreground">{setupSteps.filter((step) => step.done).length} of {setupSteps.length} done</span>
            </div>
          </div>
          <ol className="divide-y divide-border">
            {setupSteps.map((step, index) => (
              <li key={step.title} className="flex items-center gap-4 px-5 py-4">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {step.done ? <Check className="size-4" aria-label="Done" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.copy}</p>
                </div>
                {!step.done ? <Button size="sm" variant="outline" onClick={step.onClick}>{step.action}</Button> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", settingUp && "hidden")}>
        {showOrgStats ? (
          <>
            <StatCard label="Reviews written" value={writingCycle ? `${writingCycle.assignedReviews ? Math.round((writingCycle.submittedReviews / writingCycle.assignedReviews) * 100) : 0}%` : "—"} hint={writingCycle ? `${writingCycle.submittedReviews} of ${writingCycle.assignedReviews} · ${writingCycle.name}` : "No cycle in writing"}>
              {writingCycle ? <Meter value={writingCycle.assignedReviews ? (writingCycle.submittedReviews / writingCycle.assignedReviews) * 100 : 0} label="Reviews written" /> : null}
            </StatCard>
            <StatCard label="Results acknowledged" value={ackPackets.length ? `${Math.round((ackPackets.filter((packet) => packet.state === "acknowledged").length / ackPackets.length) * 100)}%` : "—"} hint={ackPackets.length && ackCycle ? `${ackPackets.filter((packet) => packet.state === "acknowledged").length} of ${ackPackets.length} · ${ackCycle.name}` : "Nothing released yet"}>
              {ackPackets.length ? <Meter value={(ackPackets.filter((packet) => packet.state === "acknowledged").length / ackPackets.length) * 100} label="Results acknowledged" tone="accent" /> : null}
            </StatCard>
            <StatCard label="Goals on track" value={goals.length ? `${Math.round((healthyGoals / goals.length) * 100)}%` : "—"} hint={`${goals.length - healthyGoals} at risk or off track`} />
            <StatCard label="Feedback shared" value={program.feedback.length} hint={`${program.feedback.filter((item) => item.kind === "praise").length} praise · ${program.feedback.filter((item) => item.kind !== "praise").length} suggestions`} />
          </>
        ) : (
          <>
            <StatCard label="Reviews to write" value={openReviewsList.length} hint={openReviewsList.length && writingCycle?.dueDate ? `Due ${formatDate(writingCycle.dueDate)}` : "You're up to date"} />
            <StatCard label="Your goals" value={myGoals.length} hint={`${myGoals.filter((goal) => goal.status === "on_track" || goal.status === "done").length} on track or done`} />
            <StatCard label="Feedback received" value={receivedFeedback.length} hint={`${receivedFeedback.filter((item) => item.kind === "praise").length} praise`} />
            <StatCard label="Next one-on-one" value={upcomingMeetings[0] ? formatDate(upcomingMeetings[0].scheduledFor, { month: "short", day: "numeric" }) : "—"} hint={upcomingMeetings[0] ? `With ${upcomingMeetings[0].managerId === snapshot.currentMember?.id ? upcomingMeetings[0].reportName : upcomingMeetings[0].managerName}` : "Nothing scheduled"} />
          </>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <h2 className="font-heading text-base font-semibold">For you</h2>
              {tasks.length ? <span className="text-xs text-muted-foreground">{tasks.length} to do</span> : null}
            </div>
            {tasks.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {tasks.slice(0, 7).map((task) => (
                  <li key={task.key} className="flex items-center gap-3 px-5 py-3">
                    {task.memberId || task.name ? (
                      <PersonAvatar memberId={task.memberId} name={task.name ?? ""} size="lg" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><task.icon className="size-4" aria-hidden="true" /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className={cn("truncate text-xs text-muted-foreground", task.tone === "negative" && "text-destructive")}>{task.detail}</p>
                    </div>
                    <Button size="sm" variant={task.tone === "attention" ? "default" : "outline"} onClick={task.onClick}>{task.action}</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 border-t border-border px-5 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" /> You&apos;re all caught up.
              </div>
            )}
            {tasks.length > 7 ? (
              <div className="border-t border-border px-5 py-2.5">
                <Button size="sm" variant="ghost" onClick={() => openReviews("write")}>See everything <ArrowRight /></Button>
              </div>
            ) : null}
          </Card>

          {activeCycles.length ? (
            <section className="grid gap-3">
              <SectionTitle title="Review cycles" actions={<Button size="sm" variant="ghost" onClick={() => openReviews("cycles")}>Open <ArrowRight /></Button>} />
              <div className="grid gap-3 md:grid-cols-2">
                {activeCycles.map((cycle) => {
                  // Who is still to act, from the records this person may see: every reviewer for
                  // people who run reviews, their own reports' packets for managers.
                  const acknowledging = cycle.state === "acknowledgement";
                  const everyone = can("reviews.read_all");
                  const packets = program.packets.filter((packet) => packet.cycleId === cycle.id && (everyone || packet.subjectId !== me));
                  const tracked = acknowledging ? packets : program.progress.filter((entry) => entry.cycleId === cycle.id);
                  const waiting = acknowledging
                    ? packets.filter((packet) => packet.state === "released").map((packet) => packet.subjectId)
                    : program.progress.filter((entry) => entry.cycleId === cycle.id && entry.outstanding > 0).map((entry) => entry.reviewerId);
                  const summary = acknowledging && tracked.length
                    ? `${tracked.length - waiting.length} of ${tracked.length}${everyone ? "" : " on your team"} acknowledged`
                    : `${cycle.submittedReviews} of ${cycle.assignedReviews} written`;
                  return (
                    <Card key={cycle.id} className="gap-4 px-5">
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-base font-semibold">{cycle.name}</h3>
                        <p className="truncate text-xs text-muted-foreground">{cycle.templateName}{cycle.dueDate ? ` · due ${formatDate(cycle.dueDate, { month: "short", day: "numeric" })}` : ""}</p>
                      </div>
                      <PhaseProgress cycle={cycle} />
                      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                        <span className="text-sm whitespace-nowrap">{summary}</span>
                        {waiting.length ? (
                          <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                            <AvatarStack memberIds={waiting} max={4} />
                            {acknowledging ? "waiting" : "still writing"}
                          </span>
                        ) : tracked.length ? <span className="text-xs text-muted-foreground">Everyone&apos;s done</span> : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          {praise.length ? (
            <section className="grid gap-3">
              <SectionTitle title="Recent praise" actions={<Button size="sm" variant="ghost" onClick={() => navigate("feedback")}>All feedback <ArrowRight /></Button>} />
              <Card className="gap-0 divide-y divide-border py-0">
                {praise.map((item) => <div key={item.id} className="px-5 py-4"><FeedbackItem item={item} now={program.now} compact /></div>)}
              </Card>
            </section>
          ) : null}
        </div>

        <div className="grid gap-6">
          {can("reviews.read") ? <GoalsSummary program={program} onOpen={() => navigate("goals")} /> : null}
          <Card className="gap-1">
            <CardHeader><CardTitle className="font-heading text-base">Inbox</CardTitle></CardHeader>
            <CardContent><NotificationList program={program} limit={4} /></CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-base">{can("audit.read") ? "Recent activity" : "Your recent activity"}</CardTitle>
              {can("audit.read") ? <Button size="xs" variant="ghost" onClick={() => navigate("audit")}>All <ArrowRight /></Button> : null}
            </CardHeader>
            <CardContent>
              {snapshot.auditEvents.length ? (
                <ul className="grid gap-3.5">
                  {snapshot.auditEvents.slice(0, 6).map((event) => (
                    <li key={event.id} className="flex gap-2.5">
                      <PersonAvatar uid={event.actorId} name={event.actorName} size="sm" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm leading-snug">{event.summary}</p>
                        <p className="text-xs text-muted-foreground">{event.actorName} · {formatRelative(event.createdAt, program.now)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function ReviewsView({
  snapshot,
  program,
  can,
  tab,
  onTabChange,
  selectedReview,
  onSelectReview,
}: {
  snapshot: WorkspaceSnapshot;
  program: ProgramSnapshot;
  can: (permission: Permission) => boolean;
  tab: ReviewsTab;
  onTabChange: (tab: ReviewsTab) => void;
  selectedReview: string | null;
  onSelectReview: (key: string) => void;
}) {
  const router = useRouter();
  const organizationId = snapshot.organization!.id;
  const [dialog, setDialog] = useState<"template" | "cycle" | null>(null);
  const [transition, setTransition] = useState<{ cycle: ReviewCycle; targetState: ReviewCycleState; preview: TransitionPreview } | null>(null);
  const [pending, setPending] = useState("");
  const canManage = can("reviews.manage");
  const openCount = snapshot.assignedReviews.filter((review) => review.state !== "submitted").length;
  const myResults = program.packets.filter((packet) => packet.subjectId === program.myMemberId).length;
  const myOutstandingByCycle = snapshot.assignedReviews.reduce<Record<string, number>>((counts, review) =>
    review.state === "submitted" ? counts : { ...counts, [review.cycleId]: (counts[review.cycleId] ?? 0) + 1 }, {});

  async function previewTransition(cycle: ReviewCycle, targetState: ReviewCycleState) {
    setPending(`transition-${cycle.id}`);
    try {
      const preview = await apiJson<TransitionPreview>(`/api/lattice/organizations/${organizationId}/cycles/${cycle.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({ targetState, dryRun: true }),
      });
      setTransition({ cycle, targetState, preview });
    } catch (caught) {
      toast({ title: "Couldn't check that change", description: caught instanceof Error ? caught.message : undefined, variant: "destructive" });
    } finally {
      setPending("");
    }
  }

  async function confirmTransition() {
    if (!transition) return;
    setPending("confirm");
    try {
      await apiJson(`/api/lattice/organizations/${organizationId}/cycles/${transition.cycle.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({ targetState: transition.targetState, dryRun: false }),
      });
      toast({ title: `${transition.cycle.name} moved to ${REVIEW_CYCLE_STATE_LABELS[transition.targetState]}` });
      setTransition(null);
      router.refresh();
    } catch (caught) {
      toast({ title: "The phase didn't change", description: caught instanceof Error ? caught.message : undefined, variant: "destructive" });
    } finally {
      setPending("");
    }
  }

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Write the reviews assigned to you, read your results, and follow every cycle through its phases."
        actions={canManage ? (
          <>
            <Button variant="outline" onClick={() => setDialog("template")}><Plus /> New template</Button>
            <Button onClick={() => setDialog("cycle")} disabled={!snapshot.templates.length}><Plus /> New cycle</Button>
          </>
        ) : null}
      />
      <DuePhasesBanner organizationId={organizationId} program={program} canManage={canManage} />
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ReviewsTab)} className="gap-6">
        <TabsList className="h-9 w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="write">To write{openCount ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground tabular-nums">{openCount}</span> : null}</TabsTrigger>
          <TabsTrigger value="results">Your results{myResults ? <span className="ml-1 text-muted-foreground tabular-nums">{myResults}</span> : null}</TabsTrigger>
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
          {canManage ? <TabsTrigger value="templates">Templates</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="write">
          <WriteReviews snapshot={snapshot} selected={selectedReview} onSelect={onSelectReview} />
        </TabsContent>
        <TabsContent value="results">
          <MyPackets organizationId={organizationId} program={program} />
        </TabsContent>
        <TabsContent value="cycles" className="grid gap-5">
          {snapshot.cycles.length ? snapshot.cycles.map((cycle) => {
            const adjacent = getAdjacentCycleStates(cycle.state, cycle);
            const meta = program.cycles.find((entry) => entry.id === cycle.id);
            const live = meta && cycle.state !== "draft" && (cycle.state !== "closed" || program.packets.some((packet) => packet.cycleId === cycle.id));
            const completion = cycle.assignedReviews ? (cycle.submittedReviews / cycle.assignedReviews) * 100 : 0;
            return (
              <Card key={cycle.id} className="gap-0 py-0">
                <div className="grid gap-4 px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="brand-heading text-xl">{cycle.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {cycle.templateName}
                        {cycle.peerNominationEnabled ? " · peer nomination" : ""}
                        {cycle.calibrationEnabled ? " · calibration" : ""}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {adjacent.previous ? (
                          <Button variant="ghost" size="sm" onClick={() => previewTransition(cycle, adjacent.previous!)} disabled={Boolean(pending)}>
                            <ArrowLeft /> Back to {REVIEW_CYCLE_STATE_LABELS[adjacent.previous]}
                          </Button>
                        ) : null}
                        {adjacent.next ? (
                          <Button size="sm" onClick={() => previewTransition(cycle, adjacent.next!)} disabled={Boolean(pending)}>
                            {pending === `transition-${cycle.id}` ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                            {cycle.state === "draft" ? "Launch…" : `Move to ${REVIEW_CYCLE_STATE_LABELS[adjacent.next]}…`}
                          </Button>
                        ) : <StatusPill tone="positive">Complete</StatusPill>}
                      </div>
                    ) : <StatusPill tone={cycle.state === "closed" ? "neutral" : "info"}>{REVIEW_CYCLE_STATE_LABELS[cycle.state]}</StatusPill>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <PhaseStepper cycle={cycle} />
                    <div className="flex min-w-56 items-center gap-3">
                      <Meter value={completion} label={`${cycle.name} completion`} />
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{cycle.submittedReviews}/{cycle.assignedReviews} written</span>
                    </div>
                  </div>
                </div>
                {live && meta ? (
                  <div className="border-t border-border bg-brand-subtle/40 px-5 py-5">
                    <CycleDetails
                      organizationId={organizationId}
                      cycle={meta}
                      program={program}
                      members={snapshot.members}
                      canManage={canManage}
                      canCalibrate={can("reviews.calibrate")}
                      myOutstanding={myOutstandingByCycle[cycle.id] ?? 0}
                    />
                  </div>
                ) : cycle.state === "draft" ? (
                  <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">Draft. Nobody has been asked to write anything yet. Launching shows exactly who will be.</p>
                ) : null}
              </Card>
            );
          }) : (
            <EmptyState
              icon={ClipboardCheck}
              title="No review cycles yet"
              description={canManage ? "Write a template, then create a cycle. Nothing reaches anyone until you launch it." : "When your company runs a review cycle, it appears here."}
              action={canManage ? <Button onClick={() => setDialog(snapshot.templates.length ? "cycle" : "template")}><Plus /> {snapshot.templates.length ? "New cycle" : "New template"}</Button> : undefined}
            />
          )}
        </TabsContent>
        {canManage ? (
          <TabsContent value="templates" className="grid gap-3">
            {snapshot.templates.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {snapshot.templates.map((template) => <TemplateCard key={template.id} template={template} />)}
              </div>
            ) : (
              <EmptyState icon={ClipboardCheck} title="No templates yet" description="A template is the set of questions each reviewer answers." action={<Button onClick={() => setDialog("template")}><Plus /> New template</Button>} />
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <NewTemplateDialog organizationId={organizationId} open={dialog === "template"} onOpenChange={(open) => setDialog(open ? "template" : null)} />
      <NewCycleDialog organizationId={organizationId} templates={snapshot.templates} open={dialog === "cycle"} onOpenChange={(open) => setDialog(open ? "cycle" : null)} />

      <Dialog open={Boolean(transition)} onOpenChange={(open) => !open && setTransition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transition?.cycle.state === "draft" ? `Launch ${transition.cycle.name}?` : `Move ${transition?.cycle.name} to ${transition ? REVIEW_CYCLE_STATE_LABELS[transition.preview.to] : ""}?`}
            </DialogTitle>
            <DialogDescription>
              {transition ? `${REVIEW_CYCLE_STATE_LABELS[transition.preview.from]} → ${REVIEW_CYCLE_STATE_LABELS[transition.preview.to]}. You can move it back later.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {transition?.preview.blockers.length ? (
              <Alert variant="destructive"><CircleAlert /><AlertTitle>Not yet</AlertTitle><AlertDescription>{transition.preview.blockers.join(" ")}</AlertDescription></Alert>
            ) : (
              <Alert><ShieldCheck /><AlertTitle>Ready</AlertTitle><AlertDescription>Nothing is blocking this change.</AlertDescription></Alert>
            )}
            {transition?.preview.effects.length ? (
              <ul className="grid gap-2 text-sm">
                {transition.preview.effects.map((effect) => <li key={effect} className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{effect}</li>)}
              </ul>
            ) : null}
            {transition?.preview.warnings.length ? (
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {transition.preview.warnings.map((warning) => <li key={warning} className="flex gap-2"><RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{warning}</li>)}
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransition(null)}>Cancel</Button>
            <Button onClick={confirmTransition} disabled={!transition?.preview.canTransition || pending === "confirm"}>
              {pending === "confirm" ? <LoaderCircle className="animate-spin" /> : transition?.preview.direction === "reverse" ? <ArrowLeft /> : <ArrowRight />}
              {transition?.cycle.state === "draft" ? "Launch cycle" : "Move phase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WriteReviews({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const router = useRouter();
  const editor = useRef<HTMLDivElement>(null);
  const cycles = new Map(snapshot.cycles.map((cycle) => [cycle.id, cycle]));
  const reviews = [...snapshot.assignedReviews].sort((a, b) =>
    Number(a.state === "submitted") - Number(b.state === "submitted")
    || Number(cycles.get(b.cycleId)?.state === "review_writing") - Number(cycles.get(a.cycleId)?.state === "review_writing"),
  );
  const keyOf = (review: AssignedReview) => `${review.cycleId}/${review.id}`;
  const current = reviews.find((review) => keyOf(review) === selected) ?? reviews[0];
  const template = current ? snapshot.templates.find((item) => item.id === current.templateId) : undefined;
  const cycle = current ? cycles.get(current.cycleId) : undefined;

  if (!reviews.length) {
    return <EmptyState icon={ClipboardCheck} title="Nothing to write" description="When a cycle asks you to review yourself or a colleague, it shows up here." />;
  }

  const groups = [...new Set(reviews.map((review) => review.cycleId))];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <nav aria-label="Your reviews" className="grid gap-4 lg:sticky lg:top-20">
        {groups.map((cycleId) => (
          <div key={cycleId} className="grid gap-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">{cycles.get(cycleId)?.name}</p>
            {reviews.filter((review) => review.cycleId === cycleId).map((review) => {
              const active = current && keyOf(review) === keyOf(current);
              return (
                <button
                  key={keyOf(review)}
                  type="button"
                  onClick={() => {
                    onSelect(keyOf(review));
                    // On narrow screens the editor sits below the list.
                    if (window.matchMedia("(max-width: 1023px)").matches) {
                      requestAnimationFrame(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                    }
                  }}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted",
                    active && "bg-card ring-1 ring-foreground/10 hover:bg-card",
                  )}
                >
                  <PersonAvatar memberId={review.subjectId} name={review.subjectName} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{review.direction === "self" ? "Your self review" : review.subjectName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{review.direction === "self" ? "About your own work" : `${REVIEW_DIRECTION_LABELS[review.direction]} review`}</span>
                  </span>
                  {review.state === "submitted" ? <CheckCircle2 className="size-4 text-primary" aria-label="Submitted" /> : Object.keys(review.answers).length ? <span className="size-2 rounded-full bg-brand-accent" aria-label="Draft saved" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div ref={editor} className="scroll-mt-20">
      {current && template && cycle ? (
        <ReviewEditor
          key={keyOf(current)}
          organizationId={snapshot.organization!.id}
          review={current}
          template={template}
          cycle={cycle}
          onSubmitted={() => router.refresh()}
        />
      ) : null}
      </div>
    </div>
  );
}

function ReviewEditor({
  organizationId,
  review,
  template,
  cycle,
  onSubmitted,
}: {
  organizationId: string;
  review: AssignedReview;
  template: ReviewTemplate;
  cycle: ReviewCycle;
  onSubmitted: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | number>>(review.answers);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const saved = useRef(JSON.stringify(review.answers));
  const editable = review.state !== "submitted" && cycle.state === "review_writing";
  const url = `/api/lattice/organizations/${organizationId}/cycles/${review.cycleId}/reviews/${review.id}`;
  const answered = template.questions.filter((question) => String(answers[question.id] ?? "").trim() !== "").length;

  useEffect(() => {
    const serialized = JSON.stringify(answers);
    if (!editable || serialized === saved.current) return;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await apiJson(url, { method: "PUT", body: JSON.stringify({ answers, submit: false }) });
        saved.current = serialized;
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
      setError(`Answer “${missing.prompt}” before submitting.`);
      return;
    }
    setSaveState("saving");
    setError("");
    try {
      await apiJson(url, { method: "PUT", body: JSON.stringify({ answers, submit: true }) });
      setSaveState("saved");
      toast({ title: "Review submitted", description: `${reviewTitle(review)} · ${review.cycleName}` });
      onSubmitted();
    } catch (caught) {
      setSaveState("error");
      setError(caught instanceof Error ? caught.message : "Could not submit the review.");
    }
  }

  return (
    <Card className="gap-0 py-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-border px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6">
        <PersonAvatar memberId={review.subjectId} name={review.subjectName} size="xl" className="max-sm:size-12" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{REVIEW_DIRECTION_LABELS[review.direction]} review · {review.cycleName}</p>
          <h2 className="brand-heading text-2xl">{review.direction === "self" ? "Your self review" : review.subjectName}</h2>
          <p className="text-sm text-muted-foreground">
            {review.direction === "peer" || review.direction === "upward" ? "Shared anonymously, and only once enough colleagues have answered." : review.direction === "manager" ? "Shared with them, with your name, when results are released." : "Shared with your manager."}
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:flex-col sm:items-end">
          {editable ? (
            <span className={cn("inline-flex items-center gap-1.5", saveState === "error" && "text-destructive")} aria-live="polite">
              {saveState === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "error" ? <CircleAlert className="size-3.5" /> : <Check className="size-3.5" />}
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, retrying when you type" : "All changes saved"}
            </span>
          ) : null}
          <span>{answered} of {template.questions.length} answered{cycle.dueDate ? ` · due ${formatDate(cycle.dueDate)}` : ""}</span>
        </div>
      </div>
      <div className="grid gap-7 px-5 py-6 sm:px-6">
        {template.questions.map((question, index) => {
          const id = `${review.cycleId}-${review.id}-${question.id}`;
          return (
            <div className="grid gap-2.5" key={question.id}>
              <Label htmlFor={question.type === "rating" ? undefined : id} id={`${id}-label`} className="text-[0.95rem] leading-snug font-semibold">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}.</span>{question.prompt}{question.required ? <span className="sr-only"> (required)</span> : null}
              </Label>
              {question.type === "rating" ? (
                <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-5 gap-1.5 sm:max-w-xl">
                  {[1, 2, 3, 4, 5].map((rating) => {
                    const checked = Number(answers[question.id]) === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={!editable}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: rating }))}
                        className={cn(
                          "grid gap-0.5 rounded-lg border border-input px-1 py-2 text-center transition-colors hover:border-ring disabled:cursor-not-allowed disabled:opacity-70",
                          checked && "border-primary bg-primary text-primary-foreground hover:border-primary",
                        )}
                      >
                        <span className="font-heading text-lg leading-none font-semibold">{rating}</span>
                        <span className={cn("hidden text-[0.65rem] leading-tight text-muted-foreground sm:block", checked && "text-primary-foreground/85")}>{RATING_LABELS[rating - 1]}</span>
                      </button>
                    );
                  })}
                  <p className="col-span-5 text-xs text-muted-foreground sm:hidden">1 {RATING_LABELS[0].toLowerCase()} · 3 {RATING_LABELS[2].toLowerCase()} · 5 {RATING_LABELS[4].toLowerCase()}</p>
                </div>
              ) : (
                <Textarea
                  id={id}
                  value={String(answers[question.id] ?? "")}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  disabled={!editable}
                  rows={5}
                  className="text-[0.95rem] leading-relaxed"
                  placeholder="Be specific: what happened, and what difference it made."
                />
              )}
            </div>
          );
        })}
        {error ? <Alert variant="destructive"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-brand-subtle/50 px-5 py-4 sm:px-6">
        {review.state === "submitted" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> Submitted{review.submittedAt ? ` ${formatDate(review.submittedAt)}` : ""}. An admin can reopen it if something needs to change.</p>
        ) : cycle.state !== "review_writing" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" aria-hidden="true" /> Writing isn&apos;t open for this cycle right now.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Drafts save as you type. Submitting locks your answers.</p>
            <Button onClick={submit} disabled={saveState === "saving"}><FileCheck2 /> Submit review</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function TemplateCard({ template }: { template: ReviewTemplate }) {
  return (
    <Card className="gap-3 px-5">
      <div>
        <h3 className="font-heading text-base font-semibold">{template.name}</h3>
        <p className="text-xs text-muted-foreground">{template.questions.length} questions{template.createdAt ? ` · created ${formatDate(template.createdAt)}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {template.directions.map((direction) => <StatusPill key={direction} tone="neutral">{REVIEW_DIRECTION_LABELS[direction]}</StatusPill>)}
      </div>
      <ol className="grid gap-1.5 text-sm text-muted-foreground">
        {template.questions.map((question, index) => (
          <li key={question.id} className="flex gap-2">
            <span className="tabular-nums">{index + 1}.</span>
            <span className="flex-1">{question.prompt}</span>
            {question.type === "rating" ? <span className="text-xs">1–5</span> : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function NewTemplateDialog({ organizationId, open, onOpenChange }: { organizationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const questions = String(form.get("questions") ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({
      prompt: line.replace(/^rating:\s*/i, ""),
      type: /^rating:/i.test(line) ? "rating" as const : "text" as const,
      required: true,
    }));
    const directions = ["self", "manager", "peer", "upward"].filter((direction) => form.get(direction) === "on");
    setPending(true);
    setError("");
    try {
      await apiJson(`/api/lattice/organizations/${organizationId}/templates`, {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), directions, questions }),
      });
      toast({ title: "Template created" });
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the template.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={create}>
          <DialogHeader>
            <DialogTitle>New review template</DialogTitle>
            <DialogDescription>The questions every reviewer answers, and who reviews whom.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="template-name">Name</Label><Input id="template-name" name="name" placeholder="Quarterly performance review" required /></div>
          <div className="grid gap-2">
            <Label>Who writes reviews</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(["self", "manager", "peer", "upward"] as const).map((direction) => (
                <Label key={direction} className="flex items-center gap-2 font-normal"><Checkbox name={direction} defaultChecked={direction === "self" || direction === "manager"} />{REVIEW_DIRECTION_LABELS[direction]}</Label>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="template-questions">Questions</Label>
            <Textarea id="template-questions" name="questions" rows={6} defaultValue={"What outcomes are you most proud of?\nWhat evidence shows the impact?\nRating: Overall performance\nWhat should the focus be next?"} required />
            <p className="text-xs text-muted-foreground">One per line. Start a line with “Rating:” for a 1–5 scale.</p>
          </div>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create template</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewCycleDialog({
  organizationId,
  templates,
  open,
  onOpenChange,
}: {
  organizationId: string;
  templates: ReviewTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await apiJson(`/api/lattice/organizations/${organizationId}/cycles`, {
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
      });
      toast({ title: "Draft cycle created", description: "Launch it when you're ready." });
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the cycle.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form className="grid gap-4" onSubmit={create}>
          <DialogHeader>
            <DialogTitle>New review cycle</DialogTitle>
            <DialogDescription>It starts as a draft. Nobody is asked to write anything until you launch it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="cycle-name">Name</Label><Input id="cycle-name" name="name" placeholder="Spring 2027 review" required /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="cycle-template">Template</Label>
              <Select name="templateId" required defaultValue={templates[0]?.id}>
                <SelectTrigger id="cycle-template" className="w-full"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-launch">Launch on</Label><Input id="cycle-launch" name="launchOn" type="date" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-nomination-end">Nominations close</Label><Input id="cycle-nomination-end" name="nominationEndsOn" type="date" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-due">Reviews due</Label><Input id="cycle-due" name="dueDate" type="date" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-calibration-end">Calibration ends</Label><Input id="cycle-calibration-end" name="calibrationEndsOn" type="date" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-ack-end">Acknowledgement ends</Label><Input id="cycle-ack-end" name="acknowledgementEndsOn" type="date" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cycle-anonymity">Share peer answers from</Label><Input id="cycle-anonymity" name="anonymityThreshold" type="number" min={1} max={10} defaultValue={3} /><p className="text-xs text-muted-foreground">Fewer responses than this are withheld, so nobody can be identified.</p></div>
          </div>
          <div className="grid gap-2">
            <Label className="flex items-center gap-2 font-normal"><Checkbox name="peerNominationEnabled" /> Let people nominate their peer reviewers</Label>
            <Label className="flex items-center gap-2 font-normal"><Checkbox name="calibrationEnabled" defaultChecked /> Calibrate ratings before results are released</Label>
          </div>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Goals and one-on-ones (page frames around the program panels)
// ---------------------------------------------------------------------------

function GoalsView({ snapshot, program, can }: { snapshot: WorkspaceSnapshot; program: ProgramSnapshot; can: (permission: Permission) => boolean }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Goals"
        description="What each person is working towards, with regular check-ins their manager can see."
        actions={<Button onClick={() => setCreating(true)}><Target /> New goal</Button>}
      />
      <GoalsPanel organizationId={snapshot.organization!.id} program={program} members={snapshot.members} canManage={can("reviews.manage")} creating={creating} onCreatingChange={setCreating} />
    </>
  );
}

function OneOnOnesView({ snapshot, program }: { snapshot: WorkspaceSnapshot; program: ProgramSnapshot }) {
  const [scheduling, setScheduling] = useState(false);
  const me = snapshot.currentMember;
  const canSchedule = snapshot.members.some((member) => member.id === me?.managerId || program.directReportIds.includes(member.id));
  return (
    <>
      <PageHeader
        title="One-on-ones"
        description="A shared agenda and notes for every conversation with your manager or your reports."
        actions={canSchedule ? <Button onClick={() => setScheduling(true)}><CalendarClock /> Schedule</Button> : null}
      />
      <OneOnOnesPanel organizationId={snapshot.organization!.id} program={program} members={snapshot.members} scheduling={scheduling} onSchedulingChange={setScheduling} />
    </>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const ALL_TEAMS = "__all__";

function PeopleView({
  snapshot,
  program,
  can,
  giveFeedback,
}: {
  snapshot: WorkspaceSnapshot;
  program: ProgramSnapshot;
  can: (permission: Permission) => boolean;
  giveFeedback: (recipientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState(ALL_TEAMS);
  const [importing, setImporting] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const roles = new Map(snapshot.roles.map((role) => [role.id, role.name]));
  const teams = [...new Set(snapshot.members.map((member) => member.teamName).filter((name): name is string => Boolean(name)))].sort();
  const needle = query.trim().toLowerCase();
  const members = snapshot.members.filter((member) =>
    (team === ALL_TEAMS || member.teamName === team)
    && (!needle || [member.name, member.email, member.title, member.teamName ?? ""].some((value) => value.toLowerCase().includes(needle))),
  );
  const joined = snapshot.members.filter((member) => member.status === "active").length;
  const person = snapshot.members.find((member) => member.id === personId) ?? null;

  function downloadTemplate() {
    const sample = [
      "name,email,title,team,manager_email,role",
      `${snapshot.user.name},${snapshot.user.email},Founder,Leadership,,manager`,
      `Alex Example,alex@example.com,Designer,Product,${snapshot.user.email},employee`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "performance-people-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="People"
        description={`${snapshot.members.length} people in ${teams.length || 1} team${teams.length === 1 ? "" : "s"} · ${joined} signed in`}
        actions={can("directory.manage") ? (
          <>
            <Button variant="outline" onClick={downloadTemplate}><Download /> CSV template</Button>
            <Button onClick={() => setImporting(true)}><FileUp /> Import people</Button>
          </>
        ) : null}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, title or team" aria-label="Search people" className="h-9 pl-8" />
        </div>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger aria-label="Team" className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
            {teams.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{members.length} shown</span>
      </div>
      <Card className="gap-0 overflow-x-auto py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={cn(head, "pl-4")}>Name</TableHead>
              <TableHead className={cn(head, "hidden md:table-cell")}>Team</TableHead>
              <TableHead className={cn(head, "hidden lg:table-cell")}>Manager</TableHead>
              <TableHead className={cn(head, "hidden sm:table-cell")}>Access</TableHead>
              <TableHead className={cn(head, "pr-4 text-right")}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id} className="cursor-pointer" onClick={() => setPersonId(member.id)}>
                <TableCell className="py-2.5 pl-4">
                  <button type="button" className="text-left" onClick={(event) => { event.stopPropagation(); setPersonId(member.id); }}>
                    <PersonLine memberId={member.id} name={member.name} detail={member.title || member.email} you={member.id === snapshot.currentMember?.id} />
                  </button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{member.teamName || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{member.managerId ? <PersonLine memberId={member.managerId} name={member.managerName ?? ""} size="sm" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{roles.get(member.roleId) ?? member.roleId}</TableCell>
                <TableCell className="pr-4 text-right">
                  <StatusPill tone={member.status === "active" ? "positive" : member.status === "invited" ? "attention" : "neutral"}>
                    {member.status === "active" ? "Active" : member.status === "invited" ? "Not signed in yet" : "Inactive"}
                  </StatusPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!members.length ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nobody matches those filters.</p> : null}
      </Card>

      <ImportPeopleDialog organizationId={snapshot.organization!.id} open={importing} onOpenChange={setImporting} />
      <PersonSheet
        person={person}
        snapshot={snapshot}
        program={program}
        onOpenChange={(open) => !open && setPersonId(null)}
        onSelect={setPersonId}
        giveFeedback={giveFeedback}
      />
    </>
  );
}

function PersonSheet({
  person,
  snapshot,
  program,
  onOpenChange,
  onSelect,
  giveFeedback,
}: {
  person: WorkspaceMember | null;
  snapshot: WorkspaceSnapshot;
  program: ProgramSnapshot;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  giveFeedback: (recipientId: string) => void;
}) {
  const reports = person ? snapshot.members.filter((member) => member.managerId === person.id) : [];
  const visible = useMemo(() => timelineSubjects(program, snapshot.members), [program, snapshot.members]);
  const role = snapshot.roles.find((entry) => entry.id === person?.roleId);
  const isMe = person?.id === snapshot.currentMember?.id;
  return (
    <Sheet open={Boolean(person)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {person ? (
          <>
            <SheetHeader className="gap-4 border-b border-border bg-brand-subtle/60 p-6">
              <PersonAvatar memberId={person.id} name={person.name} size="2xl" />
              <div>
                <SheetTitle className="brand-heading text-2xl">{person.name}</SheetTitle>
                <SheetDescription>{[person.title, person.teamName].filter(Boolean).join(" · ") || "No title yet"}</SheetDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isMe && person.status !== "inactive" ? <Button size="sm" onClick={() => giveFeedback(person.id)}><Sparkles /> Give feedback</Button> : null}
                {person.email ? <Button size="sm" variant="outline" asChild><a href={`mailto:${person.email}`}><Mail /> Email</a></Button> : null}
              </div>
            </SheetHeader>
            <div className="grid gap-6 p-6">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Email</dt><dd className="truncate">{person.email || "—"}</dd>
                <dt className="text-muted-foreground">Manager</dt>
                <dd>{person.managerId ? <button type="button" onClick={() => onSelect(person.managerId!)} className="hover:underline"><PersonLine memberId={person.managerId} name={person.managerName ?? ""} size="sm" /></button> : "—"}</dd>
                <dt className="text-muted-foreground">Access</dt><dd>{role?.name ?? person.roleId}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{person.status === "active" ? "Signed in" : person.status === "invited" ? "Hasn't signed in yet" : "Inactive"}</dd>
              </dl>
              {reports.length ? (
                <section className="grid gap-2">
                  <h3 className="text-sm font-semibold">Reports ({reports.length})</h3>
                  <ul className="grid gap-1">
                    {reports.map((report) => (
                      <li key={report.id}>
                        <button type="button" onClick={() => onSelect(report.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                          <PersonLine memberId={report.id} name={report.name} detail={report.title} size="sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section className="grid gap-3">
                <h3 className="text-sm font-semibold">Timeline</h3>
                {visible.has(person.id) ? (
                  <PersonTimeline program={program} members={snapshot.members} subjectId={person.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">You can see the timeline of people who report to you, and your own.</p>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ImportPeopleDialog({ organizationId, open, onOpenChange }: { organizationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function run(dryRun: boolean) {
    setPending(dryRun ? "preview" : "import");
    setError("");
    try {
      const result = await apiJson<CsvPreview>(`/api/lattice/organizations/${organizationId}/imports`, {
        method: "POST",
        body: JSON.stringify({ csv, dryRun }),
      });
      if (dryRun) {
        setPreview(result);
        return;
      }
      if (result.errors.length) throw new Error(result.errors[0]);
      toast({ title: `Imported ${result.rows.length} people`, description: "They join as soon as they sign in with that email." });
      setCsv("");
      setCsvName("");
      setPreview(null);
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file.");
    } finally {
      setPending("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import people</DialogTitle>
          <DialogDescription>
            A CSV with <code className="text-xs">name</code> and <code className="text-xs">email</code>, and optionally <code className="text-xs">title</code>, <code className="text-xs">team</code>, <code className="text-xs">manager_email</code> and <code className="text-xs">role</code>. You&apos;ll see a preview before anything changes.
          </DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:border-ring">
          <FileUp className="size-6 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">{csvName || "Choose a CSV file"}</span>
          <span className="text-xs text-muted-foreground">Exports from your HRIS, payroll or a spreadsheet all work.</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setCsv(await file.text());
              setCsvName(file.name);
              setPreview(null);
            }}
          />
        </label>
        {preview ? (
          <div className="grid gap-3">
            <p className="text-sm"><strong>{preview.rows.length}</strong> people ready · {preview.errors.length} errors · {preview.warnings.length} warnings</p>
            {preview.errors.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Fix these first</AlertTitle><AlertDescription>{preview.errors.join(" ")}</AlertDescription></Alert> : null}
            {preview.warnings.length ? <Alert><CircleAlert /><AlertTitle>Worth a look</AlertTitle><AlertDescription>{preview.warnings.join(" ")}</AlertDescription></Alert> : null}
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader><TableRow><TableHead className={head}>Name</TableHead><TableHead className={head}>Team</TableHead><TableHead className={head}>Manager</TableHead><TableHead className={head}>Access</TableHead></TableRow></TableHeader>
                <TableBody>{preview.rows.slice(0, 50).map((row) => (
                  <TableRow key={`${row.line}-${row.email}`}>
                    <TableCell><span className="block font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.email}</span></TableCell>
                    <TableCell>{row.team || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.managerEmail || "—"}</TableCell>
                    <TableCell>{row.roleId}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </div>
        ) : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {preview && !preview.errors.length ? (
            <Button onClick={() => run(false)} disabled={pending === "import"}>{pending === "import" ? <LoaderCircle className="animate-spin" /> : <Check />} Import {preview.rows.length} people</Button>
          ) : (
            <Button onClick={() => run(true)} disabled={!csv || pending === "preview"}>{pending === "preview" ? <LoaderCircle className="animate-spin" /> : <Eye />} Preview</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
  { label: "Organization", permissions: ["organization.read", "organization.manage"] },
  { label: "People", permissions: ["directory.read", "directory.manage"] },
  { label: "Roles", permissions: ["roles.read", "roles.manage", "roles.simulate"] },
  { label: "Reviews", permissions: ["reviews.read", "reviews.submit", "reviews.read_all", "reviews.manage", "reviews.calibrate"] },
  { label: "Reports and data", permissions: ["reports.read", "workspace.export"] },
  { label: "Audit log", permissions: ["audit.read", "audit.write"] },
];

function PermissionsView({
  snapshot,
  can,
  onPreview,
}: {
  snapshot: WorkspaceSnapshot;
  can: (permission: Permission) => boolean;
  onPreview: (roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState(snapshot.currentRole?.id ?? snapshot.roles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const role = snapshot.roles.find((entry) => entry.id === roleId) ?? snapshot.roles[0];
  const counts = snapshot.members.reduce<Record<string, number>>((total, member) => ({ ...total, [member.roleId]: (total[member.roleId] ?? 0) + 1 }), {});
  const holders = role ? snapshot.members.filter((member) => member.roleId === role.id) : [];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Exactly what each role can see and do. Preview Performance as any role before you hand it out."
        actions={can("roles.manage") ? <Button onClick={() => setCreating(true)}><Plus /> New role</Button> : null}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <ul className="grid gap-1">
          {snapshot.roles.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setRoleId(entry.id)}
                aria-current={entry.id === role?.id ? "true" : undefined}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted", entry.id === role?.id && "bg-card ring-1 ring-foreground/10 hover:bg-card")}
              >
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.name}</span>
                  <span className="block text-xs text-muted-foreground">{counts[entry.id] ?? 0} people{entry.builtIn ? "" : " · custom"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {role ? <RoleDetail role={role} holders={holders} canPreview={can("roles.simulate")} onPreview={onPreview} /> : null}
      </div>
      {can("roles.manage") ? <NewRoleDialog organizationId={snapshot.organization!.id} open={creating} onOpenChange={setCreating} /> : null}
    </>
  );
}

function RoleDetail({ role, holders, canPreview, onPreview }: { role: WorkspaceRole; holders: WorkspaceMember[]; canPreview: boolean; onPreview: (roleId: string) => void }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="brand-heading text-xl">{role.name}</h2>
          <p className="text-sm text-muted-foreground">{role.description || "No description."}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={role.builtIn ? "neutral" : "info"}>{role.builtIn ? "Built in" : "Custom"}</StatusPill>
          {canPreview ? <Button size="sm" variant="outline" onClick={() => onPreview(role.id)}><Eye /> Preview as {role.name}</Button> : null}
        </div>
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.label} className="grid content-start gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.permissions.map((permission) => {
              const allowed = role.permissions.includes(permission);
              return (
                <p key={permission} className={cn("flex items-center gap-2 text-sm", !allowed && "text-muted-foreground")}>
                  {allowed ? <Check className="size-4 text-primary" aria-label="Allowed" /> : <X className="size-4 opacity-50" aria-label="Not allowed" />}
                  {PERMISSION_LABELS[permission]}
                </p>
              );
            })}
          </div>
        ))}
      </div>
      {holders.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
          <span className="mr-1 text-xs text-muted-foreground">{holders.length} {holders.length === 1 ? "person has" : "people have"} this role</span>
          {holders.slice(0, 12).map((member) => <PersonAvatar key={member.id} memberId={member.id} name={member.name} size="sm" />)}
          {holders.length > 12 ? <span className="text-xs text-muted-foreground">+{holders.length - 12}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

function NewRoleDialog({ organizationId, open, onOpenChange }: { organizationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await apiJson(`/api/lattice/organizations/${organizationId}/roles`, {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), description: form.get("description"), permissions: PERMISSIONS.filter((permission) => form.get(permission) === "on") }),
      });
      toast({ title: "Role created" });
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the role.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form className="grid gap-4" onSubmit={create}>
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>Give it only what the job needs.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="role-name">Name</Label><Input id="role-name" name="name" placeholder="Review coordinator" required /></div>
            <div className="grid gap-1.5"><Label htmlFor="role-description">Description</Label><Input id="role-description" name="description" placeholder="Runs cycles without editing the directory" /></div>
          </div>
          <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="grid content-start gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                {group.permissions.map((permission) => (
                  <Label key={permission} className="flex items-start gap-2 font-normal"><Checkbox name={permission} className="mt-0.5" />{PERMISSION_LABELS[permission]}</Label>
                ))}
              </div>
            ))}
          </div>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const ENTITY_LABELS: Record<string, string> = {
  organization: "Organization",
  member: "Person",
  directory: "People",
  role: "Role",
  template: "Template",
  review_template: "Template",
  cycle: "Cycle",
  review_cycle: "Cycle",
  review: "Review",
  goal: "Goal",
  feedback: "Feedback",
  one_on_one: "One-on-one",
  packet: "Results",
  review_packet: "Results",
  nomination: "Nomination",
  api_key: "API key",
  webhook: "Webhook",
  report_view: "Report",
};

function AuditView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const events = snapshot.auditEvents.filter((event) => !needle || `${event.summary} ${event.actorName} ${event.entityType}`.toLowerCase().includes(needle));
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change to people, roles, cycles and reviews, newest first. Entries can't be edited or deleted, even by owners."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events or people" aria-label="Search the audit log" className="h-9 pl-8" />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">Latest {snapshot.auditEvents.length} events</span>
      </div>
      {events.length ? (
        <Card className="gap-0 overflow-x-auto py-0">
          <Table>
            <TableHeader><TableRow><TableHead className={cn(head, "pl-4")}>What happened</TableHead><TableHead className={cn(head, "hidden md:table-cell")}>Who</TableHead><TableHead className={cn(head, "hidden sm:table-cell")}>Type</TableHead><TableHead className={cn(head, "pr-4 text-right")}>When</TableHead></TableRow></TableHeader>
            <TableBody>{events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="max-w-md py-2.5 pl-4 whitespace-normal">
                  <span className="flex items-start gap-2.5">
                    <PersonAvatar uid={event.actorId} name={event.actorName} size="sm" className="md:hidden" />
                    <span>{event.summary}</span>
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell"><PersonLine uid={event.actorId} name={event.actorName} size="sm" /></TableCell>
                <TableCell className="hidden sm:table-cell"><StatusPill tone="neutral">{ENTITY_LABELS[event.entityType] ?? event.entityType.replaceAll("_", " ")}</StatusPill></TableCell>
                <TableCell className="pr-4 text-right text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Card>
      ) : <EmptyState icon={History} title={needle ? "No matching events" : "Nothing recorded yet"} description="Changes to your organization appear here as they happen." />}
    </>
  );
}
