"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FlaskConical,
  History,
  Info,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABELS, type PlannerSettings, type PlannerSnapshot, type Task } from "@/lib/planner/model";
import { PRIORITIES, type Priority, type ScheduledBlock, type ScheduleResult, type TaskOutcome } from "@/lib/planner/scheduler";
import { formatMinuteOfDay, parseMinuteOfDay } from "@/lib/planner/time";

import {
  apiJson,
  dayKeyOf,
  formatDateTime,
  formatDayHeading,
  formatTime,
  fromLocalInput,
  minutesLabel,
  nextWorkingDayStart,
  shiftDay,
  todayKey,
  toLocalInput,
  weekDays,
} from "./format";
import styles from "./planner.module.css";

const NONE = "__none";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<TaskOutcome["status"], string> = {
  on_track: "On track",
  late: "Late",
  unscheduled: "Doesn't fit",
  blocked: "Blocked",
  done: "Done",
};

type AuditEvent = { id: string; action: string; actor: { email: string }; occurredAt: string | null; target: { type: string; id: string } };
type Preview = { result: ScheduleResult; diff: { moved: string[]; added: string[]; removed: string[]; newlyAtRisk: string[] }; basedOnVersion: number | null };

type AgendaItem =
  | { kind: "block"; key: string; start: string; end: string; title: string; block: ScheduledBlock }
  | { kind: "event"; key: string; start: string; end: string; title: string };

export function PlannerWorkspace({ tenantId, onForbidden }: { tenantId: string; onForbidden: () => void }) {
  const base = `/api/planner/tenants/${tenantId}`;
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("schedule");

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

  async function mutate(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await load();
      if (success) setNotice(success);
      setError(null);
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return error ? (
      <Alert variant="destructive"><AlertTitle>Could not load the workspace</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
    ) : (
      <div className="grid gap-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>
    );
  }

  const runScheduler = () =>
    mutate(() => apiJson(`${base}/plans`, { method: "POST", body: JSON.stringify({ note: "Manual run" }) }), "Scheduler ran — a new plan version was saved.");

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceHead}>
        <div>
          <p className={styles.eyebrow}>Workspace · {snapshot.role}</p>
          <h2>{snapshot.tenant.name}</h2>
          <p className={styles.muted}>
            {snapshot.settings.timeZone} · {snapshot.settings.days.map((day) => WEEKDAYS[day]).join(" ")} ·{" "}
            {formatMinuteOfDay(snapshot.settings.startMinute)}–{formatMinuteOfDay(snapshot.settings.endMinute)}
          </p>
        </div>
        <div className={styles.headActions}>
          {snapshot.canEdit && (
            <Button onClick={runScheduler} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />} Run scheduler
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={`${base}/export`}><Download /> Export JSON</a>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4"><AlertTriangle /><AlertTitle>Something needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {notice && (
        <Alert className="mb-4"><CheckCircle2 /><AlertTitle>Done</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>
      )}
      {!snapshot.canEdit && (
        <Alert className="mb-4"><Info /><AlertTitle>Read-only access</AlertTitle><AlertDescription>Viewers can see plans and export them, but cannot change tasks or run the scheduler.</AlertDescription></Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={styles.tabs}>
          <TabsTrigger value="schedule"><CalendarDays /> Schedule</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarClock /> Meetings</TabsTrigger>
          <TabsTrigger value="team"><Users /> Team</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 /> Hours</TabsTrigger>
          <TabsTrigger value="activity"><History /> Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule">
          <ScheduleView snapshot={snapshot} base={base} busy={busy} onRun={runScheduler} mutate={mutate} goTo={setTab} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksView snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsView snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </TabsContent>
        <TabsContent value="calendar">
          <MeetingsView snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </TabsContent>
        <TabsContent value="team">
          <TeamView snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsView key={JSON.stringify(snapshot.settings)} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityView snapshot={snapshot} base={base} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ViewProps = {
  snapshot: PlannerSnapshot;
  base: string;
  busy: boolean;
  mutate: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
};

function StatusBadge({ status }: { status: TaskOutcome["status"] }) {
  const tone = status === "on_track" || status === "done" ? styles.ok : status === "late" ? styles.warn : styles.bad;
  return <span className={`${styles.status} ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function ScheduleView({ snapshot, base, busy, onRun, mutate, goTo }: ViewProps & { onRun: () => void; goTo: (tab: string) => void }) {
  const tz = snapshot.settings.timeZone;
  const [mode, setMode] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => todayKey(tz));
  const [explain, setExplain] = useState<ScheduledBlock | null>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const plan = snapshot.latestPlan;
  const result = plan?.result ?? null;
  const tasksById = useMemo(() => new Map(snapshot.tasks.map((task) => [task.id, task])), [snapshot.tasks]);

  const items = useMemo(() => {
    const byDay = new Map<string, AgendaItem[]>();
    const push = (item: AgendaItem) => {
      const key = dayKeyOf(item.start, tz);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    };
    for (const block of result?.blocks ?? []) {
      if (tasksById.get(block.taskId)?.status === "done") continue;
      push({ kind: "block", key: block.id, start: block.start, end: block.end, title: block.title, block });
    }
    for (const event of snapshot.events) push({ kind: "event", key: event.id, start: event.start, end: event.end, title: event.title });
    for (const list of byDay.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return byDay;
  }, [result, snapshot.events, tasksById, tz]);

  const days = mode === "day" ? [anchor] : weekDays(anchor);
  const atRisk = (result?.outcomes ?? []).filter((outcome) => ["late", "unscheduled", "blocked"].includes(outcome.status) && tasksById.get(outcome.taskId)?.status !== "done");
  const openTasks = snapshot.tasks.filter((task) => task.status === "todo");
  const memberName = (lane: string) => snapshot.members.find((member) => member.uid === lane)?.name ?? null;

  if (snapshot.tasks.length === 0) {
    return (
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Start with the work you owe</CardTitle>
          <CardDescription>Add tasks with an estimate and deadline, add fixed meetings as busy time, then run the scheduler. Every block it places comes with a reason.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => goTo("tasks")}><Plus /> Add your first task</Button>
          <Button variant="outline" onClick={() => goTo("settings")}>Set working hours</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className={styles.panel}>
        <CardContent className={styles.planBar}>
          <div>
            {plan ? (
              <>
                <strong>Plan v{plan.version}</strong>
                <span className={styles.muted}> · generated {formatDateTime(plan.createdAt ?? plan.now, tz)} by {plan.createdBy.email} · fingerprint {plan.inputHash}</span>
                <div className={styles.stats}>
                  <span>{result!.stats.scheduledTasks} scheduled</span>
                  <span>{minutesLabel(result!.stats.scheduledMinutes)} planned</span>
                  <span className={result!.stats.lateTasks ? styles.warnText : ""}>{result!.stats.lateTasks} late</span>
                  <span className={result!.stats.unscheduledTasks ? styles.badText : ""}>{result!.stats.unscheduledTasks} not placed</span>
                </div>
              </>
            ) : (
              <span>No plan yet. {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} waiting to be scheduled.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshot.canEdit && (
              <Button onClick={onRun} disabled={busy}><RefreshCw /> {plan ? "Re-run scheduler" : "Run scheduler"}</Button>
            )}
            <Button variant="outline" onClick={() => setWhatIfOpen(true)}><FlaskConical /> What-if preview</Button>
            {plan && (
              <Button variant="outline" asChild><a href={`${base}/plans/${plan.id}/ics`}><CalendarDays /> ICS</a></Button>
            )}
          </div>
        </CardContent>
      </Card>

      {atRisk.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{atRisk.length} task{atRisk.length === 1 ? "" : "s"} cannot be completed as planned</AlertTitle>
          <AlertDescription>
            <ul className={styles.riskList}>
              {atRisk.map((outcome) => (
                <li key={outcome.taskId}><StatusBadge status={outcome.status} /> <strong>{outcome.title}</strong> — {outcome.explanation}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {(result?.warnings ?? []).map((warning) => (
        <Alert key={warning}><Info /><AlertDescription>{warning}</AlertDescription></Alert>
      ))}

      <div className={styles.agendaNav}>
        <div className="flex gap-1">
          <Button size="sm" variant={mode === "day" ? "default" : "outline"} onClick={() => setMode("day")}>Day</Button>
          <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => setMode("week")}>Week</Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Previous" onClick={() => setAnchor(shiftDay(anchor, mode === "day" ? -1 : -7))}><ChevronLeft /></Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(todayKey(tz))}>Today</Button>
          <Button size="icon" variant="outline" aria-label="Next" onClick={() => setAnchor(shiftDay(anchor, mode === "day" ? 1 : 7))}><ChevronRight /></Button>
        </div>
      </div>

      <div className={mode === "week" ? styles.week : styles.dayGrid}>
        {days.map((key) => {
          const list = items.get(key) ?? [];
          return (
            <section key={key} className={styles.day} aria-label={formatDayHeading(key)}>
              <h3>{formatDayHeading(key)}</h3>
              {list.length === 0 ? (
                <p className={styles.muted}>Nothing planned.</p>
              ) : (
                <ol className={styles.agenda}>
                  {list.map((item) =>
                    item.kind === "event" ? (
                      <li key={item.key} className={`${styles.item} ${styles.event}`}>
                        <span className={styles.time}>{formatTime(item.start, tz)}–{formatTime(item.end, tz)}</span>
                        <span><strong>{item.title}</strong><small>Fixed meeting · busy</small></span>
                      </li>
                    ) : (
                      <li key={item.key}>
                        <button type="button" className={`${styles.item} ${styles.block}`} onClick={() => setExplain(item.block)}>
                          <span className={styles.time}>{formatTime(item.start, tz)}–{formatTime(item.end, tz)}</span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.block.chunkCount > 1 ? `Part ${item.block.chunkIndex + 1}/${item.block.chunkCount} · ` : ""}
                              {minutesLabel(item.block.minutes)}
                              {memberName(item.block.lane) ? ` · ${memberName(item.block.lane)}` : ""} · Why here?
                            </small>
                          </span>
                        </button>
                      </li>
                    ),
                  )}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={explain !== null} onOpenChange={(open) => !open && setExplain(null)}>
        <DialogContent>
          {explain && (
            <>
              <DialogHeader>
                <DialogTitle>{explain.title}</DialogTitle>
                <DialogDescription>{formatDateTime(explain.start, tz)} – {formatTime(explain.end, tz)} · {minutesLabel(explain.minutes)}</DialogDescription>
              </DialogHeader>
              <ul className={styles.reasons}>{explain.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              {snapshot.canEdit && tasksById.get(explain.taskId) && (
                <DialogFooter className="flex-wrap gap-2">
                  {tasksById.get(explain.taskId)?.lockedStart ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await mutate(() => apiJson(`${base}/tasks/${explain.taskId}`, { method: "PATCH", body: JSON.stringify({ lockedStart: null }) }), "Unlocked. The scheduler may move it on the next run.");
                        if (ok) setExplain(null);
                      }}
                    >
                      <LockOpen /> Unlock
                    </Button>
                  ) : explain.chunkCount === 1 ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await mutate(() => apiJson(`${base}/tasks/${explain.taskId}`, { method: "PATCH", body: JSON.stringify({ lockedStart: explain.start }) }), "Locked. Re-runs will keep it exactly here.");
                        if (ok) setExplain(null);
                      }}
                    >
                      <Lock /> Lock here
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const start = nextWorkingDayStart(tz, snapshot.settings.days, snapshot.settings.startMinute);
                      const ok = await mutate(() => apiJson(`${base}/tasks/${explain.taskId}`, { method: "PATCH", body: JSON.stringify({ earliestStart: start }) }), "Task pushed to the next working day. Re-run the scheduler to apply.");
                      if (ok) setExplain(null);
                    }}
                  >
                    Push to next working day
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const ok = await mutate(() => apiJson(`${base}/tasks/${explain.taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }), "Marked done. Re-run the scheduler to reclaim the time.");
                      if (ok) setExplain(null);
                    }}
                  >
                    <CheckCircle2 /> Mark done
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <WhatIfDialog open={whatIfOpen} onOpenChange={setWhatIfOpen} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
    </div>
  );
}

function WhatIfDialog({ open, onOpenChange, snapshot, base, busy, mutate }: ViewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const tz = snapshot.settings.timeZone;
  const [title, setTitle] = useState("Hypothetical meeting");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleOf = (id: string) => snapshot.tasks.find((task) => task.id === id)?.title ?? id;

  async function runPreview(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const extraBusy = start && end ? [{ title, start: fromLocalInput(start, tz), end: fromLocalInput(end, tz) }] : [];
      setPreview(await apiJson<Preview>(`${base}/plans/preview`, { method: "POST", body: JSON.stringify({ extraBusy }) }));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setPreview(null); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>What-if preview</DialogTitle>
          <DialogDescription>See how the plan would change before you apply anything. Optionally add a hypothetical busy block — it is not saved.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={runPreview}>
          <div className="grid gap-1"><Label htmlFor="wi-title">Hypothetical busy block</Label><Input id="wi-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="wi-start">Start ({tz})</Label><Input id="wi-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="wi-end">End</Label><Input id="wi-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
          </div>
          <Button type="submit" variant="outline" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Preview</Button>
        </form>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {preview && (
          <div className={styles.previewBox}>
            <p>
              Compared with {preview.basedOnVersion ? `plan v${preview.basedOnVersion}` : "no saved plan"}: <strong>{preview.diff.moved.length}</strong> moved,{" "}
              <strong>{preview.diff.added.length}</strong> newly placed, <strong>{preview.diff.removed.length}</strong> dropped,{" "}
              <strong className={preview.diff.newlyAtRisk.length ? styles.badText : ""}>{preview.diff.newlyAtRisk.length}</strong> newly at risk.
            </p>
            <ul className={styles.riskList}>
              {preview.result.outcomes.filter((outcome) => outcome.status !== "done").map((outcome) => (
                <li key={outcome.taskId}>
                  <StatusBadge status={outcome.status} /> <strong>{titleOf(outcome.taskId)}</strong>
                  {preview.diff.moved.includes(outcome.taskId) && <Badge variant="outline" className="ml-1">moved</Badge>}
                  <span className={styles.muted}> — {outcome.finish ? `finishes ${formatDateTime(outcome.finish, tz)}` : outcome.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {snapshot.canEdit && preview && preview.diff && (
            <Button
              disabled={busy || (start !== "" && end !== "")}
              onClick={async () => {
                const ok = await mutate(() => apiJson(`${base}/plans`, { method: "POST", body: JSON.stringify({ note: "Applied after what-if preview" }) }), "Preview applied as a new plan version.");
                if (ok) { onOpenChange(false); setPreview(null); }
              }}
            >
              Apply as new plan
            </Button>
          )}
        </DialogFooter>
        {start !== "" && end !== "" && preview && (
          <p className={styles.muted}>Hypothetical blocks are never applied. Add a real meeting under Meetings to keep it.</p>
        )}
      </DialogContent>
    </Dialog>
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
};

function emptyTask(): TaskForm {
  return { title: "", projectId: NONE, durationMinutes: "60", priority: "medium", deadline: "", earliestStart: "", dependsOn: [], assigneeId: NONE, notes: "" };
}

function TasksView({ snapshot, base, busy, mutate }: ViewProps) {
  const tz = snapshot.settings.timeZone;
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyTask);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const outcomes = new Map((snapshot.latestPlan?.result.outcomes ?? []).map((outcome) => [outcome.taskId, outcome]));
  const projectName = (id: string | null) => snapshot.projects.find((project) => project.id === id)?.name ?? "—";
  const sorted = [...snapshot.tasks].sort((a, b) => (a.status === b.status ? 0 : a.status === "todo" ? -1 : 1));

  function open(task: Task | "new") {
    setFormError(null);
    setEditing(task);
    setForm(
      task === "new"
        ? emptyTask()
        : {
            title: task.title,
            projectId: task.projectId ?? NONE,
            durationMinutes: String(task.durationMinutes),
            priority: task.priority,
            deadline: toLocalInput(task.deadline, tz),
            earliestStart: toLocalInput(task.earliestStart, tz),
            dependsOn: task.dependsOn,
            assigneeId: task.assigneeId ?? NONE,
            notes: task.notes,
          },
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const duration = Number(form.durationMinutes);
    if (!form.title.trim()) return setFormError("Give the task a title.");
    if (!Number.isInteger(duration) || duration < 5) return setFormError("Estimate at least 5 whole minutes.");
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
    };
    const ok = await mutate(
      () =>
        editing === "new"
          ? apiJson(`${base}/tasks`, { method: "POST", body: JSON.stringify(payload) })
          : apiJson(`${base}/tasks/${(editing as Task).id}`, { method: "PATCH", body: JSON.stringify(payload) }),
      editing === "new" ? "Task added. Run the scheduler to place it." : "Task updated. Re-run the scheduler to replan.",
    );
    if (ok) setEditing(null);
  }

  return (
    <Card className={styles.panel}>
      <CardHeader className={styles.panelHead}>
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Estimate, deadline, priority and dependencies drive the scheduler.</CardDescription>
        </div>
        {snapshot.canEdit && <Button onClick={() => open("new")}><Plus /> New task</Button>}
      </CardHeader>
      <CardContent>
        {snapshot.tasks.length === 0 ? (
          <p className={styles.muted}>No tasks yet. Add one with an estimate and an optional deadline.</p>
        ) : (
          <div className={styles.tableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Done</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Plan status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((task) => {
                  const outcome = outcomes.get(task.id);
                  return (
                    <TableRow key={task.id} className={task.status === "done" ? styles.doneRow : ""}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Mark ${task.title} ${task.status === "done" ? "not done" : "done"}`}
                          checked={task.status === "done"}
                          disabled={!snapshot.canEdit || busy}
                          onCheckedChange={(checked) =>
                            mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: checked ? "done" : "todo" }) }), checked ? "Marked done — re-run the scheduler to reclaim its time." : "Task reopened.")
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <strong>{task.title}</strong>
                        {task.lockedStart && task.status === "todo" && <Badge variant="outline" className="ml-2"><Lock /> Locked {formatDateTime(task.lockedStart, tz)}</Badge>}
                        <div className={styles.muted}>
                          {projectName(task.projectId)}
                          {task.dependsOn.length > 0 && ` · after ${task.dependsOn.map((id) => snapshot.tasks.find((other) => other.id === id)?.title ?? "deleted task").join(", ")}`}
                          {task.assigneeId && ` · ${snapshot.members.find((member) => member.uid === task.assigneeId)?.name ?? "former member"}`}
                        </div>
                      </TableCell>
                      <TableCell>{minutesLabel(task.durationMinutes)}</TableCell>
                      <TableCell><Badge variant={task.priority === "urgent" ? "destructive" : "outline"}>{PRIORITY_LABELS[task.priority]}</Badge></TableCell>
                      <TableCell>{formatDateTime(task.deadline, tz)}</TableCell>
                      <TableCell>
                        {task.status === "done" ? <StatusBadge status="done" /> : outcome ? <StatusBadge status={outcome.status} /> : <span className={styles.muted}>Not planned yet</span>}
                        {outcome && outcome.finish && task.status !== "done" && <div className={styles.muted}>ends {formatDateTime(outcome.finish, tz)}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        {snapshot.canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => open(task)}>Edit</Button>
                            <Button size="icon" variant="outline" aria-label={`Delete ${task.title}`} onClick={() => setConfirmDelete(task)}><Trash2 /></Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New task" : "Edit task"}</DialogTitle>
            <DialogDescription>Times are in the workspace time zone ({tz}).</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={save}>
            <div className="grid gap-1"><Label htmlFor="t-title">Title</Label><Input id="t-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1"><Label htmlFor="t-duration">Estimate (minutes)</Label><Input id="t-duration" type="number" min={5} step={5} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></div>
              <div className="grid gap-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as Priority })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_LABELS[priority]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1"><Label htmlFor="t-deadline">Deadline (optional)</Label><Input id="t-deadline" type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></div>
              <div className="grid gap-1"><Label htmlFor="t-earliest">Earliest start (optional)</Label><Input id="t-earliest" type="datetime-local" value={form.earliestStart} onChange={(event) => setForm({ ...form, earliestStart: event.target.value })} /></div>
              <div className="grid gap-1">
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(value) => setForm({ ...form, projectId: value })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No project</SelectItem>
                    {snapshot.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Assignee</Label>
                <Select value={form.assigneeId} onValueChange={(value) => setForm({ ...form, assigneeId: value })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned (shared calendar)</SelectItem>
                    {snapshot.members.map((member) => <SelectItem key={member.uid} value={member.uid}>{member.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {snapshot.tasks.filter((task) => editing === "new" || task.id !== (editing as Task | null)?.id).length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Must happen after</legend>
                <div className={styles.depList}>
                  {snapshot.tasks
                    .filter((task) => editing === "new" || task.id !== (editing as Task | null)?.id)
                    .map((task) => (
                      <label key={task.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.dependsOn.includes(task.id)}
                          onCheckedChange={(checked) =>
                            setForm({ ...form, dependsOn: checked ? [...form.dependsOn, task.id] : form.dependsOn.filter((id) => id !== task.id) })
                          }
                        />
                        {task.title}
                      </label>
                    ))}
                </div>
              </fieldset>
            )}
            <div className="grid gap-1"><Label htmlFor="t-notes">Notes</Label><Textarea id="t-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />} Save task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.title}”?</DialogTitle>
            <DialogDescription>Tasks that depend on it will lose that dependency. Saved plan versions keep their history.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const task = confirmDelete!;
                const ok = await mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "DELETE" }), "Task deleted.");
                if (ok) setConfirmDelete(null);
              }}
            >
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ProjectsView({ snapshot, base, busy, mutate }: ViewProps) {
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const tz = snapshot.settings.timeZone;
  const outcomes = new Map((snapshot.latestPlan?.result.outcomes ?? []).map((outcome) => [outcome.taskId, outcome]));
  const groups = [...snapshot.projects.map((project) => ({ id: project.id as string | null, name: project.name })), { id: null, name: "No project" }];

  return (
    <div className="grid gap-4">
      {snapshot.canEdit && (
        <Card className={styles.panel}>
          <CardContent>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!name.trim()) return;
                const ok = await mutate(() => apiJson(`${base}/projects`, { method: "POST", body: JSON.stringify({ name }) }), "Project created.");
                if (ok) setName("");
              }}
            >
              <Label htmlFor="p-name" className="sr-only">Project name</Label>
              <Input id="p-name" placeholder="New project name" value={name} onChange={(event) => setName(event.target.value)} />
              <Button type="submit" disabled={busy || !name.trim()}><Plus /> Add project</Button>
            </form>
          </CardContent>
        </Card>
      )}
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
          return (
            <Card key={group.id ?? "none"} className={styles.panel}>
              <CardHeader className={styles.panelHead}>
                <div>
                  <CardTitle>{group.name}</CardTitle>
                  <CardDescription>{tasks.length} task{tasks.length === 1 ? "" : "s"} · {minutesLabel(done)} of {minutesLabel(total)} done</CardDescription>
                </div>
                {group.id && snapshot.canEdit && (
                  <Button size="icon" variant="outline" aria-label={`Delete ${group.name}`} onClick={() => setConfirmDelete(group.id)}><Trash2 /></Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-2">
                <Progress value={total ? Math.round((done / total) * 100) : 0} aria-label={`${group.name} progress`} />
                <p className={styles.muted}>
                  {finish ? `Planned to finish ${formatDateTime(finish, tz)}.` : tasks.length ? "Run the scheduler to forecast a finish." : "No tasks yet."}
                  {late.length > 0 && <span className={styles.badText}> {late.length} at risk.</span>}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {snapshot.projects.length === 0 && <p className={styles.muted}>Projects group tasks and show progress and a forecast finish from the latest plan.</p>}
      <Dialog open={confirmDelete !== null} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>Its tasks stay in the workspace without a project.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const ok = await mutate(() => apiJson(`${base}/projects/${confirmDelete}`, { method: "DELETE" }), "Project deleted.");
                if (ok) setConfirmDelete(null);
              }}
            >
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingsView({ snapshot, base, busy, mutate }: ViewProps) {
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
      <Alert>
        <CalendarClock />
        <AlertTitle>Calendar sync: connection not configured</AlertTitle>
        <AlertDescription>Google and Microsoft calendar sync needs OAuth apps that are not set up for this deployment yet. Add fixed meetings manually — the scheduler treats them as busy time.</AlertDescription>
      </Alert>
      {snapshot.canEdit && (
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Add a fixed meeting</CardTitle><CardDescription>Times in {tz}. Leave “Who” empty to block everyone.</CardDescription></CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setFormError(null);
                const startIso = fromLocalInput(start, tz);
                const endIso = fromLocalInput(end, tz);
                if (!title.trim() || !startIso || !endIso) return setFormError("Give the meeting a title, start and end.");
                if (Date.parse(endIso) <= Date.parse(startIso)) return setFormError("The meeting must end after it starts.");
                const ok = await mutate(
                  () => apiJson(`${base}/events`, { method: "POST", body: JSON.stringify({ title, start: startIso, end: endIso, memberId: memberId === NONE ? null : memberId }) }),
                  "Meeting added as busy time. Re-run the scheduler to plan around it.",
                );
                if (ok) { setTitle(""); setStart(""); setEnd(""); }
              }}
            >
              <div className="grid gap-1 sm:col-span-2"><Label htmlFor="e-title">Title</Label><Input id="e-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div className="grid gap-1"><Label htmlFor="e-start">Start</Label><Input id="e-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
              <div className="grid gap-1"><Label htmlFor="e-end">End</Label><Input id="e-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
              <div className="grid gap-1">
                <Label>Who is busy</Label>
                <Select value={memberId} onValueChange={setMemberId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Everyone</SelectItem>
                    {snapshot.members.map((member) => <SelectItem key={member.uid} value={member.uid}>{member.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end"><Button type="submit" disabled={busy}><Plus /> Add meeting</Button></div>
              {formError && <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{formError}</AlertDescription></Alert>}
            </form>
          </CardContent>
        </Card>
      )}
      <Card className={styles.panel}>
        <CardHeader><CardTitle>Busy blocks</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className={styles.muted}>No upcoming meetings.</p>
          ) : (
            <ul className={styles.simpleList}>
              {upcoming.map((event) => (
                <li key={event.id}>
                  <span><strong>{event.title}</strong><small>{formatDateTime(event.start, tz)} – {formatTime(event.end, tz)}{event.memberId ? ` · ${snapshot.members.find((member) => member.uid === event.memberId)?.name ?? "former member"}` : " · everyone"}</small></span>
                  {snapshot.canEdit && (
                    <Button size="icon" variant="outline" aria-label={`Remove ${event.title}`} disabled={busy} onClick={() => mutate(() => apiJson(`${base}/events/${event.id}`, { method: "DELETE" }), "Meeting removed.")}><Trash2 /></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamView({ snapshot, base, busy, mutate }: ViewProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [capacity, setCapacity] = useState<Record<string, string>>({});
  const plannedByLane = new Map<string, number>();
  for (const block of snapshot.latestPlan?.result.blocks ?? []) plannedByLane.set(block.lane, (plannedByLane.get(block.lane) ?? 0) + block.minutes);

  return (
    <div className="grid gap-4">
      <Card className={styles.panel}>
        <CardHeader><CardTitle>People and capacity</CardTitle><CardDescription>Assign tasks to a person to plan them in their own lane. A daily capacity caps how much task time the scheduler gives them per day.</CardDescription></CardHeader>
        <CardContent>
          <ul className={styles.simpleList}>
            {snapshot.members.map((member) => (
              <li key={member.uid}>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.email} · {member.role} · {minutesLabel(plannedByLane.get(member.uid) ?? 0)} planned · {member.capacityMinutesPerDay ? `${member.capacityMinutesPerDay} min/day cap` : "full working day"}</small>
                </span>
                {snapshot.canAdmin && (
                  <form
                    className="flex gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const raw = capacity[member.uid] ?? "";
                      const value = raw.trim() === "" ? null : Number(raw);
                      void mutate(() => apiJson(`${base}/members/${member.uid}`, { method: "PUT", body: JSON.stringify({ capacityMinutesPerDay: value }) }), "Capacity saved.");
                    }}
                  >
                    <Label htmlFor={`cap-${member.uid}`} className="sr-only">Daily capacity in minutes</Label>
                    <Input id={`cap-${member.uid}`} className="w-28" type="number" min={15} max={1440} placeholder="min/day" value={capacity[member.uid] ?? (member.capacityMinutesPerDay?.toString() ?? "")} onChange={(event) => setCapacity({ ...capacity, [member.uid]: event.target.value })} />
                    <Button size="sm" variant="outline" type="submit" disabled={busy}>Save</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {snapshot.canAdmin ? (
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Invite by email</CardTitle><CardDescription>The person needs a SaaSassin account. Members can plan; viewers can only read and export.</CardDescription></CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await mutate(() => apiJson(`${base}/members`, { method: "POST", body: JSON.stringify({ email, role }) }), `${email} now has ${role} access.`);
                if (ok) setEmail("");
              }}
            >
              <Label htmlFor="inv-email" className="sr-only">Email</Label>
              <Input id="inv-email" type="email" placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="sm:w-36" aria-label="Role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={busy}>Invite</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className={styles.muted}>Only owners and admins can invite people or change capacity.</p>
      )}
    </div>
  );
}

function SettingsView({ snapshot, base, busy, mutate }: ViewProps) {
  const initial = snapshot.settings;
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [days, setDays] = useState<number[]>(initial.days);
  const [start, setStart] = useState(formatMinuteOfDay(initial.startMinute));
  const [end, setEnd] = useState(formatMinuteOfDay(initial.endMinute));
  const [horizon, setHorizon] = useState(String(initial.horizonDays));
  const [minChunk, setMinChunk] = useState(String(initial.minChunkMinutes));
  const [maxChunk, setMaxChunk] = useState(String(initial.maxChunkMinutes));
  const [formError, setFormError] = useState<string | null>(null);
  const browserZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  if (!snapshot.canAdmin) {
    return <p className={styles.muted}>Working hours: {initial.timeZone}, {initial.days.map((day) => WEEKDAYS[day]).join(" ")}, {formatMinuteOfDay(initial.startMinute)}–{formatMinuteOfDay(initial.endMinute)}. Only owners and admins can change them.</p>;
  }

  return (
    <Card className={styles.panel}>
      <CardHeader><CardTitle>Working hours and planning rules</CardTitle><CardDescription>The scheduler only places work inside these hours, in this time zone (DST-aware).</CardDescription></CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError(null);
            const startMinute = parseMinuteOfDay(start);
            const endMinute = parseMinuteOfDay(end);
            if (startMinute === null || endMinute === null) return setFormError("Use HH:MM for start and end.");
            const settings: PlannerSettings = {
              timeZone: timeZone.trim(),
              days: [...days].sort(),
              startMinute,
              endMinute,
              horizonDays: Number(horizon),
              minChunkMinutes: Number(minChunk),
              maxChunkMinutes: Number(maxChunk),
            };
            await mutate(() => apiJson(`${base}/settings`, { method: "PUT", body: JSON.stringify(settings) }), "Working hours saved. Re-run the scheduler to apply them.");
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="s-tz">Time zone (IANA)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="s-tz" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/Istanbul" />
              <Button type="button" variant="outline" onClick={() => setTimeZone(browserZone)}>Use mine ({browserZone})</Button>
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Working days</legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((label, index) => (
                <label key={label} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={days.includes(index)} onCheckedChange={(checked) => setDays(checked ? [...days, index] : days.filter((day) => day !== index))} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="grid gap-1"><Label htmlFor="s-start">Day starts</Label><Input id="s-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="s-end">Day ends</Label><Input id="s-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="s-h">Horizon (days)</Label><Input id="s-h" type="number" min={1} max={60} value={horizon} onChange={(event) => setHorizon(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="s-min">Min block (min)</Label><Input id="s-min" type="number" min={5} max={240} value={minChunk} onChange={(event) => setMinChunk(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="s-max">Max focus block</Label><Input id="s-max" type="number" min={15} max={480} value={maxChunk} onChange={(event) => setMaxChunk(event.target.value)} /></div>
          </div>
          {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          <div><Button type="submit" disabled={busy}>Save working hours</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function ActivityView({ snapshot, base }: { snapshot: PlannerSnapshot; base: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = snapshot.settings.timeZone;

  useEffect(() => {
    let cancelled = false;
    apiJson<{ events: AuditEvent[] }>(`${base}/audit`)
      .then((body) => !cancelled && setEvents(body.events))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => { cancelled = true; };
  }, [base, snapshot]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className={styles.panel}>
        <CardHeader><CardTitle>Plan versions</CardTitle><CardDescription>Every scheduler run is saved as an immutable version with its input fingerprint.</CardDescription></CardHeader>
        <CardContent>
          {snapshot.history.length === 0 ? <p className={styles.muted}>No plans yet.</p> : (
            <ul className={styles.simpleList}>
              {snapshot.history.map((plan) => (
                <li key={plan.id}>
                  <span>
                    <strong>v{plan.version}</strong>
                    <small>{formatDateTime(plan.createdAt, tz)} · {plan.createdBy.email} · {plan.stats.scheduledTasks} placed, {plan.stats.lateTasks} late, {plan.stats.unscheduledTasks} not placed · {plan.inputHash}{plan.note ? ` · ${plan.note}` : ""}</small>
                  </span>
                  <Button size="sm" variant="outline" asChild><a href={`${base}/plans/${plan.id}/ics`}>ICS</a></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className={styles.panel}>
        <CardHeader><CardTitle>Audit log</CardTitle><CardDescription>Append-only record of every change.</CardDescription></CardHeader>
        <CardContent>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {!events && !error && <Skeleton className="h-32 w-full" />}
          {events && events.length === 0 && <p className={styles.muted}>No activity yet.</p>}
          {events && events.length > 0 && (
            <ul className={styles.simpleList}>
              {events.map((event) => (
                <li key={event.id}><span><strong>{event.action}</strong><small>{event.actor.email} · {event.target.type} · {formatDateTime(event.occurredAt, tz)}</small></span></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
