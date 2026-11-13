"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FlaskConical,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Repeat,
  Sparkles,
  Wand2,
} from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseQuickCapture } from "@/lib/planner/capture";
import type { CalendarEvent, PlannerSnapshot, Task } from "@/lib/planner/model";
import { UNASSIGNED_LANE, type ScheduledBlock, type ScheduleResult, type TaskOutcome } from "@/lib/planner/scheduler";
import { localParts } from "@/lib/planner/time";
import { cn } from "@/lib/utils";

import { CompleteDialog, type CompleteTarget } from "./complete-dialog";
import { apiJson, dayKeyOf, formatDateTime, formatTime, fromLocalInput, minutesLabel, shiftDay, todayKey, weekDays } from "./format";
import { firstName, memberById, MemberAvatar, personFor, ProjectDot, projectColor, projectHue } from "./people";
import styles from "./planner.module.css";

export type Mutate = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
type ViewProps = { snapshot: PlannerSnapshot; base: string; busy: boolean; mutate: Mutate };

const STATUS_LABEL: Record<TaskOutcome["status"], string> = {
  on_track: "On track",
  late: "Late",
  unscheduled: "Doesn't fit",
  blocked: "Blocked",
  done: "Done",
};

export function StatusBadge({ status }: { status: TaskOutcome["status"] }) {
  const tone = status === "on_track" || status === "done" ? styles.ok : status === "late" ? styles.warn : styles.bad;
  return <span className={cn(styles.status, tone)}>{STATUS_LABEL[status]}</span>;
}

/** A block is done when its task is done, or (for a repeating task) when that occurrence was completed. */
export function isBlockDone(block: Pick<ScheduledBlock, "taskId" | "seriesId" | "occurrenceDate">, tasksById: Map<string, Task>) {
  if (block.seriesId && block.occurrenceDate) return Boolean(tasksById.get(block.seriesId)?.occurrences[block.occurrenceDate]);
  return tasksById.get(block.taskId)?.status === "done";
}

export function relativeTime(iso: string | null, nowMs: number) {
  if (!iso) return "";
  const minutes = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

type GridItem =
  | { kind: "block"; key: string; day: string; start: number; end: number; block: ScheduledBlock; hue: number | null; risk: boolean; locked: boolean }
  | { kind: "event"; key: string; day: string; start: number; end: number; event: CalendarEvent };

type Placed = GridItem & { column: number; columns: number };

/** Side-by-side columns for items that overlap in time (different people, or a meeting). */
function layoutDay(items: GridItem[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = item.end;
    }
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else columnEnds[column] = item.end;
    clusterEnd = Math.max(clusterEnd, item.end);
    const entry = { ...item, column, columns: 1 } as Placed;
    cluster.push(entry);
    placed.push(entry);
  }
  flush();
  return placed;
}

function minuteOfDay(iso: string, timeZone: string) {
  const parts = localParts(Date.parse(iso), timeZone);
  return parts.hour * 60 + parts.minute;
}

function weekdayOf(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function dayLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(date),
    date: day,
    long: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(date),
  };
}

function rangeLabel(days: string[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const toDate = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const fmt = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(toDate(key));
  if (first === last) return fmt(first, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${fmt(first, { day: "numeric" })} – ${fmt(last, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmt(first, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function CalendarView({ snapshot, base, busy, mutate, onRun }: ViewProps & { onRun: () => void }) {
  const tz = snapshot.settings.timeZone;
  // Phones open on a single day; wider screens on the week.
  const [mode, setMode] = useState<"day" | "week">(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "day" : "week"));
  const [anchor, setAnchor] = useState(() => todayKey(tz));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  // Your own calendar first (your work, shared work and your meetings), like opening your own diary.
  const [lane, setLane] = useState<string>(() => (snapshot.members.some((member) => member.uid === snapshot.user.uid) && snapshot.members.length > 1 ? snapshot.user.uid : "all"));
  const [explain, setExplain] = useState<ScheduledBlock | null>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [completing, setCompleting] = useState<CompleteTarget | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const plan = snapshot.latestPlan;
  const result = plan?.result ?? null;
  const tasksById = useMemo(() => new Map(snapshot.tasks.map((task) => [task.id, task])), [snapshot.tasks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // Only the desktop layout gives the calendar a fixed height; on phones the page scrolls instead.
    const fixed = window.matchMedia("(min-width: 1024px)");
    const observer = new ResizeObserver(([entry]) => setAvailable(fixed.matches ? Math.round(entry.contentRect.height) : 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const outcomeByTask = useMemo(() => {
    const map = new Map<string, TaskOutcome>();
    for (const outcome of result?.outcomes ?? []) map.set(outcome.taskId, outcome);
    return map;
  }, [result]);

  const items = useMemo(() => {
    const list: GridItem[] = [];
    for (const block of result?.blocks ?? []) {
      if (isBlockDone(block, tasksById)) continue;
      if (lane !== "all" && block.lane !== lane && block.lane !== UNASSIGNED_LANE) continue;
      const task = tasksById.get(block.seriesId ?? block.taskId);
      const outcome = outcomeByTask.get(block.taskId);
      list.push({
        kind: "block",
        key: block.id,
        day: dayKeyOf(block.start, tz),
        start: minuteOfDay(block.start, tz),
        end: minuteOfDay(block.end, tz) || 24 * 60,
        block,
        hue: projectHue(snapshot.projects, task?.projectId),
        risk: Boolean(outcome && (outcome.status === "late" || outcome.status === "blocked")),
        locked: Boolean(task?.lockedStart),
      });
    }
    for (const event of snapshot.events) {
      if (lane !== "all" && event.memberId && event.memberId !== lane) continue;
      list.push({ kind: "event", key: event.id, day: dayKeyOf(event.start, tz), start: minuteOfDay(event.start, tz), end: minuteOfDay(event.end, tz) || 24 * 60, event });
    }
    return list;
  }, [result, snapshot.events, snapshot.projects, tasksById, outcomeByTask, tz, lane]);

  const days = useMemo(() => {
    if (mode === "day") return [anchor];
    const week = weekDays(anchor);
    const busyDays = new Set(items.map((item) => item.day));
    return week.filter((key) => snapshot.settings.days.includes(weekdayOf(key)) || busyDays.has(key));
  }, [mode, anchor, items, snapshot.settings.days]);

  const visible = items.filter((item) => days.includes(item.day));
  const startHour = Math.max(0, Math.floor(Math.min(snapshot.settings.startMinute, ...visible.map((item) => item.start)) / 60) - 1);
  const endHour = Math.min(24, Math.ceil(Math.max(snapshot.settings.endMinute, ...visible.map((item) => item.end)) / 60) + 1);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  // Fill the height the calendar has (desktop), within readable bounds.
  const hourPx = Math.max(44, Math.min(84, Math.floor((available - 58) / hours.length) || 52));
  const top = (minute: number) => ((minute - startHour * 60) / 60) * hourPx;
  const today = todayKey(tz);
  const nowMinute = minuteOfDay(new Date(nowMs).toISOString(), tz);

  const atRisk = (result?.outcomes ?? []).filter((outcome) => ["late", "unscheduled", "blocked"].includes(outcome.status) && !isBlockDone(outcome, tasksById));
  const plannedThisView = visible.reduce((sum, item) => (item.kind === "block" ? sum + item.block.minutes : sum), 0);
  const meetingsThisView = visible.reduce((sum, item) => (item.kind === "event" ? sum + (item.end - item.start) : sum), 0);
  const creator = plan ? personFor(snapshot, plan.createdBy) : null;
  const explainTask = explain ? tasksById.get(explain.seriesId ?? explain.taskId) ?? null : null;

  if (snapshot.tasks.length === 0 && snapshot.events.length === 0) {
    return <EmptyCalendar snapshot={snapshot} base={base} busy={busy} mutate={mutate} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Calendar">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 lg:px-5">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setAnchor(today)}>Today</Button>
            <Button size="icon-sm" variant="ghost" aria-label={mode === "day" ? "Previous day" : "Previous week"} onClick={() => setAnchor(shiftDay(anchor, mode === "day" ? -1 : -7))}><ChevronLeft /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={mode === "day" ? "Next day" : "Next week"} onClick={() => setAnchor(shiftDay(anchor, mode === "day" ? 1 : 7))}><ChevronRight /></Button>
          </div>
          <h2 className="brand-heading text-base sm:text-lg">{rangeLabel(days.length ? days : [anchor])}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {snapshot.members.length > 1 ? (
              <div className="flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5" role="group" aria-label="Show the calendar for">
                <button
                  type="button"
                  aria-pressed={lane === "all"}
                  onClick={() => setLane("all")}
                  className={cn("h-7 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground", lane === "all" && "bg-foreground text-background hover:text-background")}
                >
                  Everyone
                </button>
                {[...snapshot.members].sort((a, b) => Number(b.uid === snapshot.user.uid) - Number(a.uid === snapshot.user.uid)).slice(0, 8).map((member) => {
                  const you = member.uid === snapshot.user.uid;
                  return (
                    <Tooltip key={member.uid}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-pressed={lane === member.uid}
                          aria-label={you ? "My calendar" : `${member.name}'s calendar`}
                          onClick={() => setLane(member.uid)}
                          className={cn("rounded-full p-0.5 transition", lane !== member.uid && "opacity-80 hover:opacity-100", lane === member.uid && "ring-2 ring-primary")}
                        >
                          <MemberAvatar member={member} size="sm" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{you ? "My calendar" : member.name}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ) : null}
            <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Calendar range">
              {(["day", "week"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  className={cn("h-7 rounded-md px-3 text-xs font-semibold capitalize text-muted-foreground hover:text-foreground", mode === option && "bg-secondary text-foreground")}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className={mode === "week" ? "min-w-[640px]" : undefined}>
            <div className={cn(styles.grid, "sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur")} style={{ "--days": days.length } as CSSProperties}>
              <div className="border-r border-border" />
              {days.map((key) => {
                const label = dayLabel(key);
                const isToday = key === today;
                const minutes = visible.filter((item) => item.day === key && item.kind === "block").reduce((sum, item) => sum + (item.kind === "block" ? item.block.minutes : 0), 0);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setAnchor(key); setMode("day"); }}
                    className="flex items-center gap-2 border-r border-border px-3 py-2 text-left last:border-r-0 hover:bg-secondary/60"
                    aria-label={`Open ${label.long}`}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums", isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>{label.date}</span>
                    <span className="min-w-0 leading-tight">
                      <span className={cn("block text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>{label.weekday}</span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">{minutes ? `${minutesLabel(minutes)} planned` : "Open"}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.grid} style={{ "--days": days.length, height: hours.length * hourPx } as CSSProperties}>
              <div className={styles.gutter}>
                {hours.map((hour, index) => index === 0 ? null : (
                  <span key={hour} className={styles.hourLabel} style={{ top: index * hourPx }}>{String(hour).padStart(2, "0")}:00</span>
                ))}
              </div>
              {days.map((key) => {
                const working = snapshot.settings.days.includes(weekdayOf(key));
                const placed = layoutDay(visible.filter((item) => item.day === key));
                return (
                  <div key={key} className={styles.dayColumn} data-off={!working} data-today={key === today} style={{ "--hour": `${hourPx}px` } as CSSProperties}>
                    {working ? (
                      <>
                        <span className={styles.offHours} style={{ top: 0, height: Math.max(0, top(snapshot.settings.startMinute)) }} />
                        <span className={styles.offHours} style={{ top: top(snapshot.settings.endMinute), bottom: 0 }} />
                      </>
                    ) : null}
                    {placed.map((item) => {
                      const height = Math.max(16, top(item.end) - top(item.start) - 2);
                      const width = 100 / item.columns;
                      const style = {
                        top: top(item.start) + 1,
                        height,
                        left: `calc(${item.column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      } as CSSProperties;
                      if (item.kind === "event") {
                        const who = memberById(snapshot, item.event.memberId);
                        return (
                          <div key={item.key} className={cn(styles.block, styles.meeting)} data-compact={height < 26} style={style} aria-label={`${item.event.title}, busy ${formatTime(item.event.start, tz)} to ${formatTime(item.event.end, tz)}`}>
                            <span className={styles.blockTitle}>{item.event.title}</span>
                            {height > 33 ? <span className={styles.blockMeta}>{formatTime(item.event.start, tz)}–{formatTime(item.event.end, tz)}</span> : null}
                            {height > 58 && who ? <span className={styles.blockFoot}><span className={styles.blockMeta}>{firstName(who.name)}</span><MemberAvatar member={who} size="xs" /></span> : null}
                          </div>
                        );
                      }
                      const block = item.block;
                      const owner = memberById(snapshot, block.lane);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={styles.block}
                          data-risk={item.risk}
                          data-compact={height < 26}
                          style={{ ...style, "--tone": projectColor(item.hue) } as CSSProperties}
                          onClick={() => setExplain(block)}
                          aria-label={`${block.title}, ${formatTime(block.start, tz)} to ${formatTime(block.end, tz)}. Why is it here?`}
                        >
                          <span className={styles.blockTitle}>
                            {item.locked ? <Lock className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" /> : null}
                            {block.seriesId ? <Repeat className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" /> : null}
                            {block.title}
                          </span>
                          {height > 33 ? (
                            <span className={styles.blockMeta}>
                              {formatTime(block.start, tz)}–{formatTime(block.end, tz)}
                              {block.chunkCount > 1 ? ` · ${block.chunkIndex + 1}/${block.chunkCount}` : ""}
                            </span>
                          ) : null}
                          {height > 58 && owner ? (
                            <span className={styles.blockFoot}>
                              <span className={styles.blockMeta}>{firstName(owner.name)}</span>
                              <MemberAvatar member={owner} size="xs" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {key === today && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 ? (
                      <span className={styles.nowLine} style={{ top: top(nowMinute) }} aria-hidden="true" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground lg:px-5">
          <span><strong className="font-semibold text-foreground">{minutesLabel(plannedThisView)}</strong> of focused work</span>
          <span><strong className="font-semibold text-foreground">{minutesLabel(meetingsThisView)}</strong> in meetings</span>
          <span className="hidden sm:inline">Working hours {String(Math.floor(snapshot.settings.startMinute / 60)).padStart(2, "0")}:{String(snapshot.settings.startMinute % 60).padStart(2, "0")}–{String(Math.floor(snapshot.settings.endMinute / 60)).padStart(2, "0")}:{String(snapshot.settings.endMinute % 60).padStart(2, "0")} · {tz}</span>
          <span className="ml-auto hidden md:inline">Select a block to see why it&apos;s there</span>
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col border-t border-border bg-sidebar/60 xl:w-[340px] xl:border-t-0 xl:border-l" aria-label="Plan and tasks">
        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{plan ? `Plan v${plan.version}` : "No plan yet"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {plan && creator ? (
                    <>
                      <UserAvatar person={creator} size="xs" />
                      Planned {relativeTime(plan.createdAt ?? plan.now, nowMs)} by {firstName(creator.name)}
                    </>
                  ) : (
                    "Plan your week to place every open task."
                  )}
                </p>
              </div>
              {plan ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-sm" variant="ghost" asChild aria-label="Add this plan to your calendar (.ics)">
                      <a href={`${base}/plans/${plan.id}/ics`}><Download /></a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add to your calendar (.ics)</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {result ? (
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Placed", String(result.stats.scheduledTasks), ""],
                  ["Planned", minutesLabel(result.stats.scheduledMinutes), ""],
                  ["Late", String(result.stats.lateTasks), result.stats.lateTasks ? styles.warnText : ""],
                  ["Won't fit", String(result.stats.unscheduledTasks), result.stats.unscheduledTasks ? styles.badText : ""],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-lg bg-secondary/70 px-1 py-2">
                    <dt className="text-[0.625rem] font-semibold text-muted-foreground">{label}</dt>
                    <dd className={cn("text-sm font-bold tabular-nums", tone)}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-3 flex gap-2">
              {snapshot.canEdit ? (
                <Button className="flex-1" onClick={onRun} disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />} {plan ? "Replan" : "Plan my week"}
                </Button>
              ) : null}
              <Button variant="outline" className={snapshot.canEdit ? "" : "flex-1"} onClick={() => setWhatIfOpen(true)}><FlaskConical /> What if…</Button>
            </div>
          </div>

          {snapshot.canEdit ? <QuickAdd snapshot={snapshot} base={base} busy={busy} mutate={mutate} /> : null}

          {atRisk.length > 0 ? (
            <section className="flex min-w-0 flex-col gap-2" aria-label="At risk">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="size-3.5" /> Needs attention · {atRisk.length}</h3>
              <ul className="flex flex-col gap-1.5">
                {atRisk.map((outcome) => {
                  const task = tasksById.get(outcome.seriesId ?? outcome.taskId);
                  return (
                    <li key={outcome.taskId} className="rounded-lg border border-destructive/25 bg-card px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ProjectDot hue={projectHue(snapshot.projects, task?.projectId)} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{outcome.title}</span>
                        <StatusBadge status={outcome.status} />
                      </div>
                      <div className="mt-1 flex items-start gap-2">
                        <p className="line-clamp-2 min-w-0 flex-1 text-xs text-muted-foreground">{outcome.explanation}</p>
                        <MemberAvatar member={memberById(snapshot, task?.assigneeId)} size="xs" className="mt-0.5" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <UpNext snapshot={snapshot} base={base} busy={busy} mutate={mutate} nowMs={nowMs} lane={lane} onComplete={setCompleting} onOpen={setExplain} />
        </div>
      </aside>

      <ExplainDialog
        block={explain}
        task={explainTask}
        snapshot={snapshot}
        base={base}
        busy={busy}
        mutate={mutate}
        onClose={() => setExplain(null)}
        onComplete={(target) => { setCompleting(target); setExplain(null); }}
      />
      <CompleteDialog target={completing} onClose={() => setCompleting(null)} busy={busy} mutate={mutate} />
      <WhatIfDialog open={whatIfOpen} onOpenChange={setWhatIfOpen} snapshot={snapshot} base={base} busy={busy} mutate={mutate} />
    </div>
  );
}

function EmptyCalendar({ snapshot, base, busy, mutate }: ViewProps) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><CalendarPlus className="size-6" /></span>
        <div className="grid gap-1.5">
          <h2 className="brand-heading text-2xl">Plan your first week</h2>
          <p className="text-sm text-muted-foreground">
            Add the work you owe with an estimate and a due date. Planner fits it around your meetings and working hours, and tells you why each block lands where it does.
          </p>
        </div>
        {snapshot.canEdit ? <div className="w-full text-left"><QuickAdd snapshot={snapshot} base={base} busy={busy} mutate={mutate} autoFocus /></div> : (
          <p className="text-sm text-muted-foreground">Nothing has been planned in this workspace yet.</p>
        )}
      </div>
    </div>
  );
}

/** One-line capture with the same shorthand as Quick capture: ~45m, !high, @2026-11-20 15:00. */
function QuickAdd({ snapshot, base, busy, mutate, autoFocus = false }: ViewProps & { autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const parsed = useMemo(
    () => parseQuickCapture(text, { timeZone: snapshot.settings.timeZone, endMinute: snapshot.settings.endMinute }),
    [text, snapshot.settings.timeZone, snapshot.settings.endMinute],
  );
  const task = parsed.tasks[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!task || parsed.errors.length) return;
    const ok = await mutate(
      () => apiJson(`${base}/tasks/bulk`, { method: "POST", body: JSON.stringify({ tasks: [{ title: task.title, durationMinutes: task.durationMinutes, priority: task.priority, deadline: task.deadline }] }) }),
      `Added “${task.title}”. Replan to fit it in.`,
    );
    if (ok) setText("");
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <Label htmlFor="quick-add" className="sr-only">Add a task</Label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          id="quick-add"
          value={text}
          autoFocus={autoFocus}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a task — Draft launch email ~45m !high"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none" data-slot="inline-input"
          autoComplete="off"
        />
        {task ? <Button type="submit" size="xs" disabled={busy || parsed.errors.length > 0}>Add</Button> : null}
      </div>
      {task ? (
        <p className="px-1 text-xs text-muted-foreground">
          {minutesLabel(task.durationMinutes)} · {task.priority} priority{task.deadline ? ` · due ${formatDateTime(task.deadline, snapshot.settings.timeZone)}` : ""}
        </p>
      ) : parsed.errors[0] ? <p className="px-1 text-xs text-destructive">{parsed.errors[0]}</p> : null}
    </form>
  );
}

function UpNext({ snapshot, busy, nowMs, lane, onComplete, onOpen, base }: ViewProps & { nowMs: number; lane: string; onComplete: (target: CompleteTarget) => void; onOpen: (block: ScheduledBlock) => void }) {
  const tz = snapshot.settings.timeZone;
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const blocks = (snapshot.latestPlan?.result.blocks ?? [])
    .filter((block) => !isBlockDone(block, tasksById) && Date.parse(block.end) > nowMs && (lane === "all" || block.lane === lane || block.lane === UNASSIGNED_LANE))
    .sort((a, b) => a.start.localeCompare(b.start));
  const seen = new Set<string>();
  const next = blocks.filter((block) => {
    const id = block.seriesId ? `${block.seriesId}@${block.occurrenceDate}` : block.taskId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 7);
  const planned = new Set((snapshot.latestPlan?.result.outcomes ?? []).map((outcome) => outcome.seriesId ?? outcome.taskId));
  const waiting = snapshot.tasks.filter((task) => task.status === "todo" && !planned.has(task.id) && (lane === "all" || !task.assigneeId || task.assigneeId === lane));
  const today = todayKey(tz);

  return (
    <>
      <section className="flex min-w-0 flex-col gap-2" aria-label="Up next">
        <h3 className="text-xs font-semibold text-muted-foreground">Up next</h3>
        {next.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nothing else planned. Add a task or replan.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {next.map((block) => {
              const task = tasksById.get(block.seriesId ?? block.taskId);
              const owner = memberById(snapshot, block.lane);
              const day = dayKeyOf(block.start, tz);
              const when = day === today ? `Today ${formatTime(block.start, tz)}` : day === shiftDay(today, 1) ? `Tomorrow ${formatTime(block.start, tz)}` : formatDateTime(block.start, tz);
              const due = task?.deadline && !block.seriesId ? formatDateTime(task.deadline, tz) : null;
              return (
                <li key={block.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-card">
                  {task && snapshot.canEdit ? (
                    <Checkbox
                      aria-label={`Mark ${block.title} done`}
                      checked={false}
                      disabled={busy}
                      onCheckedChange={() =>
                        onComplete(block.seriesId && block.occurrenceDate
                          ? { title: `${task.title} (${block.occurrenceDate})`, estimateMinutes: task.durationMinutes, url: `${base}/tasks/${task.id}/occurrences`, method: "POST", body: { date: block.occurrenceDate, status: "done" }, success: "Done. The rest of the series keeps repeating." }
                          : { title: task.title, estimateMinutes: task.durationMinutes, url: `${base}/tasks/${task.id}`, method: "PATCH", body: { status: "done" }, success: "Done. Replan to give the time back." })
                      }
                    />
                  ) : null}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(block)}>
                    <span className="flex items-center gap-1.5">
                      <ProjectDot hue={projectHue(snapshot.projects, task?.projectId)} />
                      <span className="truncate text-sm font-medium">{block.title}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {when} · {minutesLabel(block.minutes)}{due ? ` · due ${due}` : ""}
                    </span>
                  </button>
                  <MemberAvatar member={owner} size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {waiting.length ? (
        <section className="flex min-w-0 flex-col gap-2" aria-label="Waiting to be planned">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> Waiting to be planned · {waiting.length}</h3>
          <ul className="flex flex-col gap-1">
            {waiting.slice(0, 5).map((task) => (
              <li key={task.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <ProjectDot hue={projectHue(snapshot.projects, task.projectId)} />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{minutesLabel(task.durationMinutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ExplainDialog({
  block,
  task,
  snapshot,
  base,
  busy,
  mutate,
  onClose,
  onComplete,
}: ViewProps & { block: ScheduledBlock | null; task: Task | null; onClose: () => void; onComplete: (target: CompleteTarget) => void }) {
  const tz = snapshot.settings.timeZone;
  const owner = block ? memberById(snapshot, block.lane) : null;
  const project = task?.projectId ? snapshot.projects.find((entry) => entry.id === task.projectId) ?? null : null;
  const hue = projectHue(snapshot.projects, task?.projectId);

  return (
    <Dialog open={block !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {block ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ProjectDot hue={hue} className="size-2.5" />
                {project?.name ?? "No project"}
                {block.seriesId ? <Badge variant="secondary"><Repeat /> Repeating</Badge> : null}
                {task?.lockedStart ? <Badge variant="secondary"><Lock /> Locked</Badge> : null}
              </div>
              <DialogTitle className="brand-heading text-xl">{block.title}</DialogTitle>
              <DialogDescription>
                {formatDateTime(block.start, tz)} – {formatTime(block.end, tz)} · {minutesLabel(block.minutes)}
                {block.chunkCount > 1 ? ` · part ${block.chunkIndex + 1} of ${block.chunkCount}` : ""}
              </DialogDescription>
            </DialogHeader>
            {owner ? (
              <div className="flex items-center gap-2.5 rounded-lg bg-secondary/70 px-3 py-2">
                <MemberAvatar member={owner} size="md" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{owner.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{owner.title || "Planned on their calendar"}</p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-2">
              <p className="text-sm font-semibold">Why it&apos;s here</p>
              <ul className={styles.reasons}>{block.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
            {snapshot.canEdit && task ? (
              <DialogFooter className="flex-wrap gap-2">
                {block.seriesId && block.occurrenceDate ? (
                  <Button
                    disabled={busy}
                    onClick={() => onComplete({
                      title: `${task.title} (${block.occurrenceDate})`,
                      estimateMinutes: task.durationMinutes,
                      url: `${base}/tasks/${task.id}/occurrences`,
                      method: "POST",
                      body: { date: block.occurrenceDate, status: "done" },
                      success: "Done. The rest of the series keeps repeating.",
                    })}
                  >
                    <CheckCircle2 /> Mark this one done
                  </Button>
                ) : (
                  <>
                    {task.lockedStart ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ lockedStart: null }) }), "Unlocked. The next replan may move it.");
                          if (ok) onClose();
                        }}
                      >
                        <LockOpen /> Unlock
                      </Button>
                    ) : block.chunkCount === 1 ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await mutate(() => apiJson(`${base}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ lockedStart: block.start }) }), "Locked. Replans keep it exactly here.");
                          if (ok) onClose();
                        }}
                      >
                        <Lock /> Lock here
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await mutate(() => apiJson(`${base}/tasks/${task.id}/push`, { method: "POST" }), "Moved to the next working day. Replan to apply it.");
                        if (ok) onClose();
                      }}
                    >
                      Push to tomorrow
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => onComplete({
                        title: task.title,
                        estimateMinutes: task.durationMinutes,
                        url: `${base}/tasks/${task.id}`,
                        method: "PATCH",
                        body: { status: "done" },
                        success: "Done. Replan to give the time back.",
                      })}
                    >
                      <CheckCircle2 /> Mark done
                    </Button>
                  </>
                )}
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Preview = { result: ScheduleResult; diff: { moved: string[]; added: string[]; removed: string[]; newlyAtRisk: string[] }; basedOnVersion: number | null };

function WhatIfDialog({ open, onOpenChange, snapshot, base, busy, mutate }: ViewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const tz = snapshot.settings.timeZone;
  const [title, setTitle] = useState("Offsite with the board");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleOf = (id: string) => snapshot.tasks.find((task) => task.id === id)?.title ?? id;
  const hypothetical = start !== "" && end !== "";

  async function runPreview(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const extraBusy = hypothetical ? [{ title, start: fromLocalInput(start, tz), end: fromLocalInput(end, tz) }] : [];
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
          <DialogTitle>What if…</DialogTitle>
          <DialogDescription>See how your week would change before you commit. Add a meeting that might happen; nothing is saved until you apply.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={runPreview}>
          <div className="grid gap-1.5"><Label htmlFor="wi-title">A meeting that might happen</Label><Input id="wi-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="wi-start">Starts ({tz})</Label><Input id="wi-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="wi-end">Ends</Label><Input id="wi-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
          </div>
          <Button type="submit" variant="outline" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Preview the plan</Button>
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
                <li key={outcome.taskId} className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={outcome.status} /> <strong className="font-medium">{outcome.occurrenceDate ? `${outcome.title} (${outcome.occurrenceDate})` : titleOf(outcome.taskId)}</strong>
                  {preview.diff.moved.includes(outcome.taskId) && <Badge variant="outline">moved</Badge>}
                  <span className={styles.muted}>{outcome.finish ? `finishes ${formatDateTime(outcome.finish, tz)}` : outcome.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {snapshot.canEdit && preview && !hypothetical ? (
            <Button
              disabled={busy}
              onClick={async () => {
                const ok = await mutate(() => apiJson(`${base}/plans`, { method: "POST", body: JSON.stringify({ note: "Applied after a what-if preview" }) }), "Applied as a new plan.");
                if (ok) { onOpenChange(false); setPreview(null); }
              }}
            >
              Apply as new plan
            </Button>
          ) : null}
        </DialogFooter>
        {hypothetical && preview ? <p className={styles.muted}>A meeting that might happen is never applied. Add it under Calendars to plan around it for real.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
