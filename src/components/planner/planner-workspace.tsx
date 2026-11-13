"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarClock,
  Download,
  Eye,
  FolderPlus,
  ListPlus,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";

import { ProviderIcon } from "@/components/account/provider-icons";
import { TeamPanel } from "@/components/account/team-panel";
import { UserAvatar } from "@/components/account/user-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { parseQuickCapture } from "@/lib/planner/capture";
import { PRIORITY_LABELS, type PlannerMember, type PlannerSettings, type PlannerSnapshot, type Task } from "@/lib/planner/model";
import { describeRecurrence } from "@/lib/planner/recurrence";
import { PRIORITIES, type Priority, type TaskOutcome, type TaskType } from "@/lib/planner/scheduler";
import { formatMinuteOfDay, parseMinuteOfDay } from "@/lib/planner/time";
import { cn } from "@/lib/utils";

import { CalendarView, relativeTime, StatusBadge, type Mutate } from "./calendar-view";
import { CompleteDialog, type CompleteTarget } from "./complete-dialog";
import { describeFocus, FocusFields, focusForm, toFocus } from "./focus-fields";
import { apiJson, formatDateTime, formatTime, fromLocalInput, minutesLabel, todayKey, toLocalInput } from "./format";
import { IcsImportCard } from "./ics-import-card";
import { InsightsView } from "./insights-view";
import { AvatarStack, firstName, memberById, MemberAvatar, personFor, ProjectDot, projectHue } from "./people";
import { navItem, type PlannerView } from "./planner-nav";
import styles from "./planner.module.css";
import { RecurrenceFields, recurrenceForm, toRecurrence, type RecurrenceForm } from "./recurrence-fields";
import { WebhooksView } from "./webhooks-view";

const NONE = "__none";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ViewProps = { snapshot: PlannerSnapshot; base: string; busy: boolean; mutate: Mutate };

/**
 * One workspace: loads its snapshot, runs every write (refreshing and confirming with a toast),
 * and renders the page header plus the view chosen in the sidebar.
 */
export function PlannerWorkspace({
  tenantId,
  view,
  onNavigate,
  onForbidden,
  start,
  end,
}: {
  tenantId: string;
  view: PlannerView;
  onNavigate: (view: PlannerView) => void;
  onForbidden: () => void;
  start: ReactNode;
  end: ReactNode;
}) {
  const base = `/api/planner/tenants/${tenantId}`;
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [capturing, setCapturing] = useState(false);
  const item = navItem(view);

  const load = useCallback(async () => {
    try {
      setSnapshot(await apiJson<PlannerSnapshot>(base));
      setError(null);
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      if (status === 404 || status === 403) onForbidden();
      setError((caught as Error).message);
    }
  }, [base, onForbidden]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const mutate: Mutate = useCallback(async (action, success) => {
    setBusy(true);
    try {
      await action();
      await load();
      if (success) toast({ title: success });
      return true;
    } catch (caught) {
      toast({ title: "That didn't work", description: (caught as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  const runScheduler = () =>
    mutate(() => apiJson(`${base}/plans`, { method: "POST", body: JSON.stringify({ note: "Planned from the calendar" }) }), "Your week is planned. A new plan version was saved.");

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4 lg:static lg:px-5">
        {start}
        <h1 className={cn("brand-heading truncate text-lg", view === "calendar" ? "hidden sm:block" : "sr-only")}>{item.label}</h1>
        {snapshot && !snapshot.canEdit ? (
          <Badge variant="secondary" className="hidden sm:inline-flex"><Eye /> View only</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {snapshot?.canEdit ? (
            <>
              <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setCapturing(true)}><ListPlus /> Quick capture</Button>
              <Button size="sm" onClick={() => setEditing("new")}><Plus /> <span className="hidden sm:inline">New task</span></Button>
            </>
          ) : null}
          {end}
        </div>
      </header>

      {!snapshot ? (
        error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertTitle>This workspace couldn&apos;t be opened</AlertTitle>
              <AlertDescription>
                {error}
                <Button className="mt-2 w-fit" size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Try again</Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="grid gap-3 p-5"><Skeleton className="h-9 w-72" /><Skeleton className="h-[60vh] w-full" /></div>
        )
      ) : view === "calendar" ? (
        <CalendarView snapshot={snapshot} base={base} busy={busy} mutate={mutate} onRun={() => void runScheduler()} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 lg:px-8 lg:py-8">
            <div className="grid gap-1">
              <h2 className="brand-heading text-2xl sm:text-[1.75rem]">{item.label}</h2>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            {view === "tasks" ? <TasksView snapshot={snapshot} base={base} busy={busy} mutate={mutate} onEdit={setEditing} onCapture={() => setCapturing(true)} /> : null}
            {view === "projects" ? <ProjectsView snapshot={snapshot} base={base} busy={busy} mutate={mutate} /> : null}
            {view === "insights" ? <InsightsView snapshot={snapshot} base={base} /> : null}
            {view === "calendars" ? <CalendarsView snapshot={snapshot} base={base} busy={busy} mutate={mutate} /> : null}
            {view === "team" ? <TeamView snapshot={snapshot} base={base} busy={busy} mutate={mutate} tenantId={tenantId} onLeft={onForbidden} /> : null}
            {view === "hours" ? <HoursView key={JSON.stringify(snapshot.settings)} snapshot={snapshot} base={base} busy={busy} mutate={mutate} /> : null}
            {view === "integrations" ? <WebhooksView snapshot={snapshot} base={base} /> : null}
            {view === "activity" ? <ActivityView snapshot={snapshot} base={base} busy={busy} mutate={mutate} onNavigate={onNavigate} /> : null}
          </div>
        </div>
      )}

      {snapshot ? (
        <>
          <TaskEditor key={editing === null ? "closed" : editing === "new" ? "new" : editing.id} editing={editing} onClose={() => setEditing(null)} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
          <QuickCaptureDialog open={capturing} onOpenChange={setCapturing} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Tasks                                                                                     */
/* ---------------------------------------------------------------------------------------- */

const PRIORITY_TONE: Record<Priority, string> = {
  urgent: "bg-destructive",
  high: "bg-primary",
  medium: "bg-[oklch(0.7_0.1_250)]",
  low: "bg-muted-foreground/50",
};

function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span aria-hidden="true" className={cn("size-2 rounded-full", PRIORITY_TONE[priority])} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function SeriesStatus({ outcomes, task }: { outcomes: TaskOutcome[]; task: Task }) {
  const mine = outcomes.filter((outcome) => outcome.seriesId === task.id && !task.occurrences[outcome.occurrenceDate ?? ""]);
  if (mine.length === 0) return <span className={styles.muted}>Nothing upcoming</span>;
  const atRisk = mine.filter((outcome) => outcome.status !== "on_track" && outcome.status !== "done").length;
  return (
    <span className={styles.muted}>
      {mine.length} upcoming{atRisk > 0 && <span className={styles.badText}> · {atRisk} at risk</span>}
    </span>
  );
}

function TasksView({ snapshot, base, busy, mutate, onEdit, onCapture }: ViewProps & { onEdit: (task: Task | "new") => void; onCapture: () => void }) {
  const tz = snapshot.settings.timeZone;
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<CompleteTarget | null>(null);
  const outcomes = new Map((snapshot.latestPlan?.result.outcomes ?? []).map((outcome) => [outcome.taskId, outcome]));
  const project = (id: string | null) => snapshot.projects.find((entry) => entry.id === id) ?? null;
  const counts = { open: snapshot.tasks.filter((task) => task.status === "todo").length, done: snapshot.tasks.filter((task) => task.status === "done").length, all: snapshot.tasks.length };
  const rows = snapshot.tasks
    .filter((task) => filter === "all" || (filter === "open" ? task.status === "todo" : task.status === "done"))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "todo" ? -1 : 1;
      const finishA = outcomes.get(a.id)?.finish ?? a.deadline ?? "9999";
      const finishB = outcomes.get(b.id)?.finish ?? b.deadline ?? "9999";
      return finishA.localeCompare(finishB);
    });

  if (snapshot.tasks.length === 0) {
    return (
      <EmptyPanel
        icon={ListPlus}
        title="Add the work you owe"
        body="Give each task an estimate and, if it has one, a due date. Paste a whole list with Quick capture and Planner fits it into your week."
        action={snapshot.canEdit ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => onEdit("new")}><Plus /> New task</Button>
            <Button variant="outline" onClick={onCapture}><ListPlus /> Quick capture</Button>
          </div>
        ) : null}
      />
    );
  }

  return (
    <Card className={cn(styles.panel, "gap-0 py-0")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex rounded-lg bg-secondary p-0.5" role="group" aria-label="Show tasks">
          {(["open", "done", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={cn("h-7 rounded-md px-3 text-xs font-semibold capitalize text-muted-foreground hover:text-foreground", filter === option && "bg-card text-foreground shadow-xs")}
            >
              {option} <span className="ml-0.5 tabular-nums text-muted-foreground">{counts[option]}</span>
            </button>
          ))}
        </div>
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">Sorted by when each task finishes in the plan.</p>
      </div>
      <div className={styles.tableWrap}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4"><span className="sr-only">Done</span></TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Estimate</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>In the plan</TableHead>
              <TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task) => {
              const outcome = outcomes.get(task.id);
              const owner = memberById(snapshot, task.assigneeId);
              const taskProject = project(task.projectId);
              return (
                <TableRow key={task.id} className={task.status === "done" ? styles.doneRow : ""}>
                  <TableCell className="pl-4">
                    {task.recurrence ? (
                      <Repeat className="size-4 text-muted-foreground" aria-label="Repeating task: complete each occurrence from the calendar" />
                    ) : (
                      <Checkbox
                        aria-label={`Mark ${task.title} ${task.status === "done" ? "not done" : "done"}`}
                        checked={task.status === "done"}
                        disabled={!snapshot.canEdit || busy}
                        onCheckedChange={(checked) =>
                          checked
                            ? setCompleting({ title: task.title, estimateMinutes: task.durationMinutes, url: `${base}/tasks/${task.id}`, method: "PATCH", body: { status: "done" }, success: "Done. Replan to give the time back." })
                            : mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "todo" }) }), "Reopened.")
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <button type="button" className="text-left disabled:cursor-default" disabled={!snapshot.canEdit} onClick={() => onEdit(task)}>
                      <span className={cn(styles.taskTitle, "font-medium")}>{task.title}</span>
                      {task.lockedStart && task.status === "todo" ? <Lock className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label="Locked in place" /> : null}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><ProjectDot hue={projectHue(snapshot.projects, task.projectId)} />{taskProject?.name ?? "No project"}</span>
                      <span>{task.type === "shallow" ? "Shallow work" : "Deep work"}</span>
                      {task.recurrence ? <span>{describeRecurrence(task.recurrence)}</span> : null}
                      {task.status === "done" && task.actualMinutes !== null ? <span>took {minutesLabel(task.actualMinutes)}</span> : null}
                      {task.pushCount > 0 ? <span>pushed {task.pushCount}×</span> : null}
                      {task.dependsOn.length > 0 ? <span>after {task.dependsOn.map((id) => snapshot.tasks.find((other) => other.id === id)?.title ?? "a deleted task").join(", ")}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {owner ? (
                      <span className="flex items-center gap-2 text-sm"><MemberAvatar member={owner} size="sm" /> {firstName(owner.name)}</span>
                    ) : task.assigneeId ? <span className={styles.muted}>Former member</span> : <span className={styles.muted}>Anyone</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{minutesLabel(task.durationMinutes)}</TableCell>
                  <TableCell><PriorityChip priority={task.priority} /></TableCell>
                  <TableCell className="text-sm">{task.deadline ? formatDateTime(task.deadline, tz) : <span className={styles.muted}>—</span>}</TableCell>
                  <TableCell>
                    {task.recurrence ? (
                      <SeriesStatus outcomes={snapshot.latestPlan?.result.outcomes ?? []} task={task} />
                    ) : task.status === "done" ? <StatusBadge status="done" /> : outcome ? (
                      <div className="grid gap-0.5">
                        <StatusBadge status={outcome.status} />
                        {outcome.finish ? <span className="text-xs text-muted-foreground">ends {formatDateTime(outcome.finish, tz)}</span> : null}
                      </div>
                    ) : <span className={styles.muted}>Not planned yet</span>}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {snapshot.canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${task.title}`}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onEdit(task)}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(task)}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{filter === "done" ? "Nothing finished yet. Tick a task off and it shows up here." : "Everything is done. Add what's next."}</p> : null}
      </div>

      <CompleteDialog target={completing} onClose={() => setCompleting(null)} busy={busy} mutate={mutate} />
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Tasks that wait on it stop waiting. Saved plan versions keep their history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const task = confirmDelete;
                if (task) void mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "DELETE" }), "Task deleted.");
              }}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type TaskForm = {
  title: string;
  projectId: string;
  durationMinutes: string;
  priority: Priority;
  deadline: string;
  earliestStart: string;
  dependsOn: string[];
  assigneeId: string;
  notes: string;
  recurrence: RecurrenceForm;
  type: TaskType;
};

function formFor(task: Task | "new", timeZone: string): TaskForm {
  if (task === "new") {
    return { title: "", projectId: NONE, durationMinutes: "60", priority: "medium", deadline: "", earliestStart: "", dependsOn: [], assigneeId: NONE, notes: "", recurrence: recurrenceForm(null, todayKey(timeZone)), type: "deep" };
  }
  return {
    title: task.title,
    projectId: task.projectId ?? NONE,
    durationMinutes: String(task.durationMinutes),
    priority: task.priority,
    deadline: toLocalInput(task.deadline, timeZone),
    earliestStart: toLocalInput(task.earliestStart, timeZone),
    dependsOn: task.dependsOn,
    assigneeId: task.assigneeId ?? NONE,
    notes: task.notes,
    recurrence: recurrenceForm(task.recurrence, todayKey(timeZone)),
    type: task.type,
  };
}

function TaskEditor({ editing, onClose, snapshot, base, busy, mutate }: ViewProps & { editing: Task | "new" | null; onClose: () => void }) {
  const tz = snapshot.settings.timeZone;
  const [form, setForm] = useState<TaskForm>(() => formFor(editing ?? "new", tz));
  const [formError, setFormError] = useState<string | null>(null);
  const editingId = editing && editing !== "new" ? editing.id : null;
  const candidates = snapshot.tasks.filter((task) => !task.recurrence && task.id !== editingId);

  async function save(event: FormEvent) {
    event.preventDefault();
    const duration = Number(form.durationMinutes);
    if (!form.title.trim()) return setFormError("Give the task a title.");
    if (!Number.isInteger(duration) || duration < 5) return setFormError("Estimate at least 5 whole minutes.");
    const recurrence = toRecurrence(form.recurrence);
    if (recurrence && "error" in recurrence) return setFormError(recurrence.error);
    const payload = {
      title: form.title,
      projectId: form.projectId === NONE ? null : form.projectId,
      durationMinutes: duration,
      priority: form.priority,
      deadline: form.deadline ? fromLocalInput(form.deadline, tz) : null,
      earliestStart: form.earliestStart ? fromLocalInput(form.earliestStart, tz) : null,
      dependsOn: form.dependsOn,
      assigneeId: form.assigneeId === NONE ? null : form.assigneeId,
      notes: form.notes,
      recurrence,
      type: form.type,
    };
    const ok = await mutate(
      () =>
        editingId
          ? apiJson(`${base}/tasks/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
          : apiJson(`${base}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
      editingId ? "Task updated. Replan to apply the change." : "Task added. Replan to fit it in.",
    );
    if (ok) onClose();
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Times are in {tz}.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={save}>
          <div className="grid gap-1.5"><Label htmlFor="t-title">Title</Label><Input id="t-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Draft the launch brief" required autoFocus /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="t-duration">Estimate (minutes)</Label><Input id="t-duration" type="number" min={5} step={5} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-priority">Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as Priority })}>
                <SelectTrigger id="t-priority" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_LABELS[priority]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.recurrence.freq === "none" && (
              <div className="grid gap-1.5"><Label htmlFor="t-deadline">Due (optional)</Label><Input id="t-deadline" type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></div>
            )}
            <div className="grid gap-1.5"><Label htmlFor="t-earliest">Not before (optional)</Label><Input id="t-earliest" type="datetime-local" value={form.earliestStart} onChange={(event) => setForm({ ...form, earliestStart: event.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-type">Kind of work</Label>
              <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value as TaskType })}>
                <SelectTrigger id="t-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deep">Deep work (needs focus)</SelectItem>
                  <SelectItem value="shallow">Shallow work (admin, email)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-project">Project</Label>
              <Select value={form.projectId} onValueChange={(value) => setForm({ ...form, projectId: value })}>
                <SelectTrigger id="t-project" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {snapshot.projects.map((entry) => <SelectItem key={entry.id} value={entry.id}><ProjectDot hue={projectHue(snapshot.projects, entry.id)} /> {entry.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="t-owner">Owner</Label>
              <Select value={form.assigneeId} onValueChange={(value) => setForm({ ...form, assigneeId: value })}>
                <SelectTrigger id="t-owner" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Anyone (shared time)</SelectItem>
                  {snapshot.members.map((member) => (
                    <SelectItem key={member.uid} value={member.uid}><UserAvatar person={member} size="xs" /> {member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <RecurrenceFields value={form.recurrence} onChange={(recurrence) => setForm({ ...form, recurrence })} />
          {form.recurrence.freq === "none" && candidates.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Must happen after</legend>
              <div className={styles.depList}>
                {candidates.map((task) => (
                  <label key={task.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.dependsOn.includes(task.id)}
                      onCheckedChange={(checked) => setForm({ ...form, dependsOn: checked ? [...form.dependsOn, task.id] : form.dependsOn.filter((id) => id !== task.id) })}
                    />
                    <span className="truncate">{task.title}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid gap-1.5"><Label htmlFor="t-notes">Notes</Label><Textarea id="t-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
          {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />} {editingId ? "Save changes" : "Add task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickCaptureDialog({ open, onOpenChange, snapshot, base, busy, mutate }: ViewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("");
  const tz = snapshot.settings.timeZone;
  const parsed = useMemo(() => parseQuickCapture(text, { timeZone: tz, endMinute: snapshot.settings.endMinute }), [text, tz, snapshot.settings.endMinute]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>
            One task per line. Add <code>~90m</code> for an estimate, <code>!high</code> for priority and <code>@2026-11-20 15:00</code> for a due date ({tz}). Paste a list from anywhere.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="qc-text" className="sr-only">Tasks, one per line</Label>
        <Textarea id="qc-text" rows={7} value={text} onChange={(event) => setText(event.target.value)} placeholder={"Write launch brief ~2h !high @2026-11-20 15:00\nReview pricing copy ~45m !urgent\nExpense report"} />
        {parsed.errors.length > 0 && (
          <Alert variant="destructive"><AlertDescription><ul className={styles.riskList}>{parsed.errors.map((message) => <li key={message}>{message}</li>)}</ul></AlertDescription></Alert>
        )}
        {parsed.tasks.length > 0 && (
          <ul className={styles.simpleList}>
            {parsed.tasks.map((task) => (
              <li key={task.line}>
                <span><strong>{task.title}</strong><small>{minutesLabel(task.durationMinutes)} · {PRIORITY_LABELS[task.priority]}{task.deadline ? ` · due ${formatDateTime(task.deadline, tz)}` : ""}</small></span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={busy || parsed.tasks.length === 0 || parsed.errors.length > 0 || parsed.tasks.length > 50}
            onClick={async () => {
              const ok = await mutate(
                () => apiJson(`${base}/tasks/bulk`, { method: "POST", body: JSON.stringify({ tasks: parsed.tasks.map(({ title, durationMinutes, priority, deadline }) => ({ title, durationMinutes, priority, deadline })) }) }),
                `${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"} added. Replan to fit them in.`,
              );
              if (ok) { setText(""); onOpenChange(false); }
            }}
          >
            Add {parsed.tasks.length || ""} task{parsed.tasks.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Projects                                                                                  */
/* ---------------------------------------------------------------------------------------- */

function ProjectsView({ snapshot, base, busy, mutate }: ViewProps) {
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const tz = snapshot.settings.timeZone;
  const outcomes = new Map((snapshot.latestPlan?.result.outcomes ?? []).map((outcome) => [outcome.taskId, outcome]));
  const groups = [...snapshot.projects.map((entry) => ({ id: entry.id as string | null, name: entry.name })), { id: null, name: "No project" }];

  return (
    <div className="grid gap-4">
      {snapshot.canEdit && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const ok = await mutate(() => apiJson(`${base}/projects`, { method: "POST", body: JSON.stringify({ name }) }), `Project “${name.trim()}” created.`);
            if (ok) setName("");
          }}
        >
          <Label htmlFor="p-name" className="sr-only">Project name</Label>
          <Input id="p-name" className="sm:max-w-sm" placeholder="Name a new project" value={name} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" disabled={busy || !name.trim()}><FolderPlus /> Add project</Button>
        </form>
      )}
      {snapshot.projects.length === 0 ? (
        <EmptyPanel icon={FolderPlus} title="Group work into projects" body="Projects show how much is done and when the plan expects them to finish, so you can see a slipping launch before it slips." />
      ) : null}
      <div className={styles.projectGrid}>
        {groups.map((group) => {
          const tasks = snapshot.tasks.filter((task) => task.projectId === group.id);
          if (group.id === null && tasks.length === 0) return null;
          const total = tasks.reduce((sum, task) => sum + task.durationMinutes, 0);
          const done = tasks.filter((task) => task.status === "done").reduce((sum, task) => sum + task.durationMinutes, 0);
          const late = tasks.filter((task) => task.status === "todo" && ["late", "unscheduled", "blocked"].includes(outcomes.get(task.id)?.status ?? ""));
          const finish = tasks
            .filter((task) => task.status === "todo")
            .map((task) => outcomes.get(task.id)?.finish)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1);
          const people = [...new Set(tasks.map((task) => task.assigneeId).filter(Boolean))]
            .map((uid) => memberById(snapshot, uid))
            .filter((member): member is PlannerMember => Boolean(member));
          const percent = total ? Math.round((done / total) * 100) : 0;
          return (
            <Card key={group.id ?? "none"} className={cn(styles.panel, "gap-4")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ProjectDot hue={projectHue(snapshot.projects, group.id)} className="size-2.5" /> {group.name}
                </CardTitle>
                <CardDescription>{tasks.length} task{tasks.length === 1 ? "" : "s"} · {minutesLabel(done)} of {minutesLabel(total)} done</CardDescription>
                {group.id && snapshot.canEdit ? (
                  <CardAction>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${group.name}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete({ id: group.id!, name: group.name })}><Trash2 /> Delete project</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Progress value={percent} aria-label={`${group.name} progress`} className="flex-1" />
                  <span className="text-xs font-semibold tabular-nums">{percent}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {finish ? <>Finishes <strong className="font-semibold text-foreground">{formatDateTime(finish, tz)}</strong></> : tasks.some((task) => task.status === "todo") ? "Replan to forecast a finish." : tasks.length ? "All done." : "No tasks yet."}
                    {late.length > 0 && <span className={styles.badText}> · {late.length} at risk</span>}
                  </p>
                  <AvatarStack people={people} size="sm" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Its tasks stay in the workspace without a project.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const target = confirmDelete;
                if (target) void mutate(() => apiJson(`${base}/projects/${target.id}`, { method: "DELETE" }), "Project deleted.");
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Calendars (meetings, imports, connections)                                                */
/* ---------------------------------------------------------------------------------------- */

function CalendarsView({ snapshot, base, busy, mutate }: ViewProps) {
  const tz = snapshot.settings.timeZone;
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [memberId, setMemberId] = useState(NONE);
  const [formError, setFormError] = useState<string | null>(null);
  const [cutoff] = useState(() => Date.now() - 86_400_000);
  const upcoming = snapshot.events.filter((event) => Date.parse(event.end) > cutoff);

  return (
    <div className="grid gap-4">
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Connected calendars</CardTitle>
          <CardDescription>Planner reads your meetings as busy time and plans around them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {[
            { id: "google" as const, name: "Google Calendar" },
            { id: "microsoft" as const, name: "Microsoft Outlook" },
          ].map((provider) => (
            <div key={provider.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary"><ProviderIcon provider={provider.id} className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{provider.name}</p>
                <p className="text-xs text-muted-foreground">Not connected yet. Live sync isn&apos;t available on this server, so import an .ics export below instead.</p>
              </div>
              <Badge variant="outline">Not connected</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {snapshot.canEdit && <IcsImportCard snapshot={snapshot} base={base} onImported={async () => { await mutate(async () => undefined); }} />}

      {snapshot.canEdit && (
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Block out time</CardTitle><CardDescription>Add a meeting or any time you&apos;re unavailable. Times in {tz}. Leave “Who” as Everyone to block the whole team.</CardDescription></CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
              onSubmit={async (event) => {
                event.preventDefault();
                setFormError(null);
                const startIso = fromLocalInput(start, tz);
                const endIso = fromLocalInput(end, tz);
                if (!title.trim() || !startIso || !endIso) return setFormError("Give it a title, a start and an end.");
                if (Date.parse(endIso) <= Date.parse(startIso)) return setFormError("It has to end after it starts.");
                const ok = await mutate(
                  () => apiJson(`${base}/events`, { method: "POST", body: JSON.stringify({ title, start: startIso, end: endIso, memberId: memberId === NONE ? null : memberId }) }),
                  "Busy time added. Replan to work around it.",
                );
                if (ok) { setTitle(""); setStart(""); setEnd(""); }
              }}
            >
              <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="e-title">Title</Label><Input id="e-title" placeholder="Design review" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="e-start">Starts</Label><Input id="e-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="e-end">Ends</Label><Input id="e-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-who">Who</Label>
                <Select value={memberId} onValueChange={setMemberId}>
                  <SelectTrigger id="e-who" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Everyone</SelectItem>
                    {snapshot.members.map((member) => <SelectItem key={member.uid} value={member.uid}><UserAvatar person={member} size="xs" /> {member.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={busy}><Plus /> Add</Button>
              {formError && <Alert variant="destructive" className="sm:col-span-2 lg:col-span-5"><AlertDescription>{formError}</AlertDescription></Alert>}
            </form>
          </CardContent>
        </Card>
      )}

      <Card className={styles.panel}>
        <CardHeader><CardTitle>Upcoming busy time</CardTitle><CardDescription>{upcoming.length} meeting{upcoming.length === 1 ? "" : "s"} Planner is working around.</CardDescription></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className={styles.muted}>No meetings yet. Import your calendar or block out time above.</p>
          ) : (
            <ul className={styles.simpleList}>
              {upcoming.map((event) => {
                const who = memberById(snapshot, event.memberId);
                return (
                  <li key={event.id}>
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><CalendarClock className="size-4" /></span>
                      <span className="min-w-0">
                        <strong>{event.title}{event.source === "ics" && <Badge variant="secondary" className="ml-2 align-middle">Imported</Badge>}</strong>
                        <small>{formatDateTime(event.start, tz)} – {formatTime(event.end, tz)}</small>
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-2 text-sm text-muted-foreground">
                      {who ? <><MemberAvatar member={who} size="sm" /> {firstName(who.name)}</> : event.memberId ? "Former member" : "Everyone"}
                    </span>
                    {snapshot.canEdit && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${event.title}`} disabled={busy} onClick={() => mutate(() => apiJson(`${base}/events/${event.id}`, { method: "DELETE" }), "Removed.")}><Trash2 /></Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Team                                                                                      */
/* ---------------------------------------------------------------------------------------- */

function TeamView({ snapshot, base, busy, mutate, tenantId, onLeft }: ViewProps & { tenantId: string; onLeft: () => void }) {
  const [capacity, setCapacity] = useState<Record<string, string>>({});
  const [focusFor, setFocusFor] = useState<PlannerMember | null>(null);
  const plannedByLane = new Map<string, number>();
  for (const block of snapshot.latestPlan?.result.blocks ?? []) plannedByLane.set(block.lane, (plannedByLane.get(block.lane) ?? 0) + block.minutes);
  const peak = Math.max(60, ...plannedByLane.values());

  return (
    <div className="grid gap-6">
      <TeamPanel product="planner" productName="Planner" tenantId={tenantId} onLeft={onLeft} />
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Capacity and focus hours</CardTitle>
          <CardDescription>Assign a task to someone to plan it on their calendar. A daily cap limits how much task time they get each day; focus hours are when Planner prefers to put their deep and shallow work.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid">
            {snapshot.members.map((member, index) => {
              const planned = plannedByLane.get(member.uid) ?? 0;
              const canFocus = snapshot.canAdmin || (snapshot.canEdit && member.uid === snapshot.user.uid);
              return (
                <li key={member.uid} className={cn("grid gap-3 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center", index > 0 && "border-t border-border")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar member={member} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}{member.uid === snapshot.user.uid ? <span className="text-muted-foreground"> (you)</span> : null}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.title || "No title yet"} · Focus {member.focus ? describeFocus(member.focus) : `as the workspace (${describeFocus(snapshot.settings.focus)})`}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">In the current plan</span><span className="font-semibold tabular-nums">{minutesLabel(planned)}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((planned / peak) * 100)}%` }} /></div>
                    <p className="text-xs text-muted-foreground">{member.capacityMinutesPerDay ? `Capped at ${minutesLabel(member.capacityMinutesPerDay)} a day` : "Full working day"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {canFocus ? <Button size="sm" variant="outline" onClick={() => setFocusFor(member)}>Focus hours</Button> : null}
                    {snapshot.canAdmin ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const raw = capacity[member.uid] ?? "";
                          const value = raw.trim() === "" ? null : Number(raw);
                          void mutate(() => apiJson(`${base}/members/${member.uid}`, { method: "PUT", body: JSON.stringify({ capacityMinutesPerDay: value }) }), `Capacity saved for ${firstName(member.name)}.`);
                        }}
                      >
                        <Label htmlFor={`cap-${member.uid}`} className="sr-only">Daily cap for {member.name}, in minutes</Label>
                        <Input id={`cap-${member.uid}`} className="h-7 w-24" type="number" min={15} max={1440} placeholder="min/day" value={capacity[member.uid] ?? (member.capacityMinutesPerDay?.toString() ?? "")} onChange={(event) => setCapacity({ ...capacity, [member.uid]: event.target.value })} />
                        <Button size="sm" variant="ghost" type="submit" disabled={busy}>Save</Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <MemberFocusDialog key={focusFor?.uid ?? "none"} member={focusFor} onClose={() => setFocusFor(null)} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
    </div>
  );
}

function MemberFocusDialog({ member, onClose, snapshot, base, busy, mutate }: ViewProps & { member: PlannerMember | null; onClose: () => void }) {
  const [form, setForm] = useState(() => focusForm(member?.focus ?? null));
  const [error, setError] = useState<string | null>(null);
  const save = async (focus: unknown, message: string) => {
    if (!member) return;
    const ok = await mutate(() => apiJson(`${base}/members/${member.uid}/focus`, { method: "PUT", body: JSON.stringify({ focus }) }), message);
    if (ok) onClose();
  };
  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MemberAvatar member={member} size="md" /> Focus hours for {member ? firstName(member.name) : ""}</DialogTitle>
          <DialogDescription>
            Preferred hours in {snapshot.settings.timeZone}. Work moves outside them only when it would otherwise miss its due time, and the plan says so.
          </DialogDescription>
        </DialogHeader>
        <FocusFields id="member-focus" value={form} onChange={setForm} />
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => save(null, "Focus hours reset to the workspace default.")}>Use workspace default</Button>
          <Button
            disabled={busy}
            onClick={() => {
              const focus = toFocus(form);
              if ("error" in focus) return setError(focus.error);
              void save(focus, "Focus hours saved. Replan to use them.");
            }}
          >
            Save focus hours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Working hours                                                                             */
/* ---------------------------------------------------------------------------------------- */

function HoursView({ snapshot, base, busy, mutate }: ViewProps) {
  const initial = snapshot.settings;
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [days, setDays] = useState<number[]>(initial.days);
  const [start, setStart] = useState(formatMinuteOfDay(initial.startMinute));
  const [end, setEnd] = useState(formatMinuteOfDay(initial.endMinute));
  const [horizon, setHorizon] = useState(String(initial.horizonDays));
  const [minChunk, setMinChunk] = useState(String(initial.minChunkMinutes));
  const [maxChunk, setMaxChunk] = useState(String(initial.maxChunkMinutes));
  const [buffer, setBuffer] = useState(String(initial.bufferMinutes));
  const [focus, setFocus] = useState(() => focusForm(initial.focus));
  const [formError, setFormError] = useState<string | null>(null);
  const [browserZone] = useState(() => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"));

  if (!snapshot.canAdmin) {
    return (
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>{initial.days.map((day) => WEEKDAYS[day]).join(", ")} · {formatMinuteOfDay(initial.startMinute)}–{formatMinuteOfDay(initial.endMinute)}</CardTitle>
          <CardDescription>{initial.timeZone}. Owners and admins can change working hours; you can set your own focus hours under Team.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={styles.panel}>
      <CardHeader><CardTitle>When work can be planned</CardTitle><CardDescription>Planner only places work inside these hours, in this time zone, and handles daylight saving for you.</CardDescription></CardHeader>
      <CardContent>
        <form
          className="grid gap-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError(null);
            const startMinute = parseMinuteOfDay(start);
            const endMinute = parseMinuteOfDay(end);
            if (startMinute === null || endMinute === null) return setFormError("Use HH:MM for start and end.");
            const focusWindows = toFocus(focus);
            if ("error" in focusWindows) return setFormError(focusWindows.error);
            const settings: PlannerSettings = {
              timeZone: timeZone.trim(),
              days: [...days].sort(),
              startMinute,
              endMinute,
              horizonDays: Number(horizon),
              minChunkMinutes: Number(minChunk),
              maxChunkMinutes: Number(maxChunk),
              bufferMinutes: Number(buffer),
              focus: focusWindows,
            };
            await mutate(() => apiJson(`${base}/settings`, { method: "PUT", body: JSON.stringify(settings) }), "Working hours saved. Replan to use them.");
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="s-tz">Time zone</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="s-tz" className="sm:max-w-xs" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/Amsterdam" />
              <Button type="button" variant="outline" onClick={() => setTimeZone(browserZone)}>Use mine ({browserZone})</Button>
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Working days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, index) => {
                const on = days.includes(index);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((day) => day !== index) : [...days, index])}
                    className={cn("h-8 w-12 rounded-lg border text-sm font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="grid gap-1.5"><Label htmlFor="s-start">Day starts</Label><Input id="s-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="s-end">Day ends</Label><Input id="s-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="s-h">Plan ahead (days)</Label><Input id="s-h" type="number" min={1} max={60} value={horizon} onChange={(event) => setHorizon(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="s-min">Shortest block (min)</Label><Input id="s-min" type="number" min={5} max={240} value={minChunk} onChange={(event) => setMinChunk(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="s-max">Longest block (min)</Label><Input id="s-max" type="number" min={15} max={480} value={maxChunk} onChange={(event) => setMaxChunk(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="s-buf">Gap around meetings</Label><Input id="s-buf" type="number" min={0} max={120} value={buffer} onChange={(event) => setBuffer(event.target.value)} /></div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Preferred hours for the whole workspace</legend>
            <p className={styles.muted}>Planner tries to put deep and shallow work in these hours, and only moves it out when it would otherwise miss its due time. People can set their own under Team. Leave empty for no preference.</p>
            <FocusFields id="ws-focus" value={focus} onChange={setFocus} />
          </fieldset>
          {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          <div><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null} Save working hours</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* History                                                                                   */
/* ---------------------------------------------------------------------------------------- */

type AuditEvent = {
  id: string;
  action: string;
  actor: { uid?: string; email: string };
  occurredAt: string | null;
  target: { type: string; id: string };
  details?: Record<string, unknown>;
};

const ACTIONS: Record<string, string> = {
  "plan.generated": "planned the week",
  "plan.applied": "applied a plan",
  "plan.restored": "restored an earlier plan",
  "task.created": "added a task",
  "task.bulk_created": "added several tasks",
  "task.updated": "updated a task",
  "task.completed": "finished a task",
  "task.reopened": "reopened a task",
  "task.deleted": "deleted a task",
  "task.pushed": "pushed a task to the next day",
  "task.occurrence_completed": "finished a repeating task",
  "task.occurrence_reopened": "reopened a repeating task",
  "project.created": "created a project",
  "project.deleted": "deleted a project",
  "event.created": "blocked out time",
  "event.deleted": "removed busy time",
  "calendar.imported": "imported a calendar",
  "settings.updated": "changed working hours",
  "member.capacity_updated": "changed someone's daily cap",
  "member.focus_updated": "changed focus hours",
  "webhook.created": "added a webhook",
  "webhook.deleted": "removed a webhook",
  "webhook.tested": "tested a webhook",
  "workspace.exported": "exported the workspace",
  "tenant.created": "created the workspace",
  "invitation.created": "invited someone",
  "invitation.resent": "sent a new invitation link",
  "invitation.revoked": "revoked an invitation",
  "invitation.accepted": "joined the workspace",
  "membership.granted": "added someone to the team",
  "membership.role_changed": "changed someone's role",
  "membership.removed": "removed someone from the team",
  "membership.left": "left the workspace",
  "ownership.transferred": "transferred ownership",
};

function describeAction(action: string) {
  return ACTIONS[action] ?? action.replace(/[._]/g, " ");
}

function ActivityView({ snapshot, base, busy, mutate, onNavigate }: ViewProps & { onNavigate: (view: PlannerView) => void }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const tz = snapshot.settings.timeZone;
  const titleOf = (event: AuditEvent) => {
    if (event.target.type === "task") return snapshot.tasks.find((task) => task.id === event.target.id)?.title ?? null;
    if (event.target.type === "project") return snapshot.projects.find((entry) => entry.id === event.target.id)?.name ?? null;
    if (event.target.type === "membership") return memberById(snapshot, event.target.id)?.name ?? null;
    if (event.target.type === "plan") {
      const version = event.details?.version;
      return typeof version === "number" ? `v${version}` : null;
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    apiJson<{ events: AuditEvent[] }>(`${base}/audit`)
      .then((body) => !cancelled && setEvents(body.events))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => { cancelled = true; };
  }, [base, snapshot]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Plan versions</CardTitle>
          <CardDescription>Every replan is saved. Restore any version as the current plan.</CardDescription>
          <CardAction><Button size="sm" variant="outline" asChild><a href={`${base}/export`}><Download /> Export</a></Button></CardAction>
        </CardHeader>
        <CardContent>
          {snapshot.history.length === 0 ? (
            <div className="grid justify-items-start gap-2">
              <p className={styles.muted}>No plans yet.</p>
              <Button size="sm" variant="outline" onClick={() => onNavigate("calendar")}><Wand2 /> Plan your week</Button>
            </div>
          ) : (
            <ol className="grid">
              {snapshot.history.map((plan, index) => {
                const creator = personFor(snapshot, plan.createdBy);
                const current = plan.id === snapshot.latestPlan?.id;
                return (
                  <li key={plan.id} className={cn("flex items-start gap-3 py-3", index > 0 && "border-t border-border")}>
                    <UserAvatar person={creator} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">v{plan.version}</span>{current ? <Badge className="ml-2 align-middle">Current</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {firstName(creator.name)} · {relativeTime(plan.createdAt, nowMs)} · {plan.stats.scheduledTasks} placed{plan.stats.lateTasks ? `, ${plan.stats.lateTasks} late` : ""}{plan.stats.unscheduledTasks ? `, ${plan.stats.unscheduledTasks} didn't fit` : ""}
                      </p>
                      {plan.note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{plan.note}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {snapshot.canEdit && !current && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => mutate(() => apiJson(`${base}/plans/${plan.id}/restore`, { method: "POST" }), `Plan v${plan.version} is the current plan again.`)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" asChild aria-label={`Download plan v${plan.version} as a calendar file`}>
                        <a href={`${base}/plans/${plan.id}/ics`}><Download /></a>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
      <Card className={styles.panel}>
        <CardHeader><CardTitle>Activity</CardTitle><CardDescription>Who changed what. This record can&apos;t be edited.</CardDescription></CardHeader>
        <CardContent>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {!events && !error && <div className="grid gap-3">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-9 w-full" />)}</div>}
          {events && events.length === 0 && <p className={styles.muted}>Nothing has happened here yet.</p>}
          {events && events.length > 0 && (
            <ol className="grid">
              {events.map((event, index) => {
                const actor = personFor(snapshot, event.actor);
                const target = titleOf(event);
                return (
                  <li key={event.id} className={cn("flex items-start gap-3 py-2.5", index > 0 && "border-t border-border")}>
                    <UserAvatar person={actor} size="sm" className="mt-0.5" />
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{firstName(actor.name)}</span> {describeAction(event.action)}
                      {target ? <span className="text-muted-foreground"> · {target}</span> : null}
                    </p>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt ?? undefined}>{event.occurredAt ? formatDateTime(event.occurredAt, tz) : ""}</time>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */

function EmptyPanel({ icon: Icon, title, body, action }: { icon: typeof Plus; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon className="size-5" /></span>
      <div className="grid max-w-md gap-1">
        <h3 className="brand-heading text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}

