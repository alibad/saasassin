"use client";

import { useMemo, useState } from "react";
import { BarChart3, CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { courseAnalytics } from "@/lib/creator/analytics";
import type { CourseDoc } from "@/lib/creator/model";
import { cn } from "@/lib/utils";

import { useEnrollments } from "./school-data";

function Bar({ value, max, label, highlight = false, tone = "bg-[var(--chart-1)]" }: { value: number; max: number; label: string; highlight?: boolean; tone?: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", highlight ? "bg-[var(--chart-5)]" : tone)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{label}</span>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="brand-heading mt-2 text-4xl tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Section({ title, hint, children, className }: { title: string; hint: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-card p-6 ring-1 ring-border", className)}>
      <h3 className="brand-heading text-xl">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-5 grid gap-3">{children}</div>
    </section>
  );
}

function shortDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

/** Daily enrollment counts folded into Monday-to-Sunday weeks, drawn as columns. */
function WeeklyColumns({ days }: { days: Array<{ date: string; count: number }> }) {
  const weeks = new Map<string, number>();
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = date.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) ?? 0) + day.count);
  }
  // Fill empty weeks between the first and last, so quiet weeks show as gaps.
  const keys = [...weeks.keys()].sort();
  const series: Array<[string, number]> = [];
  if (keys.length) {
    for (let cursor = new Date(`${keys[0]}T00:00:00Z`); cursor.toISOString().slice(0, 10) <= keys.at(-1)!; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
      const key = cursor.toISOString().slice(0, 10);
      series.push([key, weeks.get(key) ?? 0]);
    }
  }
  const shown = series.slice(-12);
  const max = Math.max(1, ...shown.map(([, count]) => count));
  return (
    <div className="flex h-52 items-end gap-2" role="img" aria-label={shown.map(([week, count]) => `Week of ${shortDate(week)}: ${count}`).join(", ")}>
      {shown.map(([week, count]) => (
        <div key={week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-xs font-medium tabular-nums">{count || ""}</span>
          <div className="w-full rounded-t-lg bg-[var(--chart-1)]" style={{ height: `${Math.max(count ? 6 : 2, (count / max) * 100)}%`, opacity: count ? 1 : 0.25 }} />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">{shortDate(week)}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPanel({ tenantId, courses }: { tenantId: string; courses: CourseDoc[] }) {
  const { data: rows, error } = useEnrollments(tenantId);
  const [courseId, setCourseId] = useState("");

  // Open on the course with the most learners: it has the most to say.
  const busiestCourse = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.courseId, (counts.get(row.courseId) ?? 0) + 1);
    return [...courses].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0]?.id ?? "";
  }, [courses, rows]);
  const selectedId = courseId || busiestCourse;
  const course = courses.find((entry) => entry.id === selectedId);
  const analytics = useMemo(
    () => (course && rows ? courseAnalytics(course.modules, rows.filter((row) => row.courseId === course.id)) : null),
    [course, rows],
  );

  if (!courses.length) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><BarChart3 className="size-5" aria-hidden="true" /></span>
        <h2 className="brand-heading mt-4 text-xl">Numbers arrive with your first learners</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Publish a course and share it. Enrollments, completion and quiz results show up here as soon as people start.</p>
      </div>
    );
  }


  return (
    <div className="grid gap-6">
      <Select value={selectedId} onValueChange={setCourseId}>
        <SelectTrigger className="h-10 w-full max-w-sm rounded-xl bg-card" aria-label="Choose a course"><SelectValue /></SelectTrigger>
        <SelectContent>{courses.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.title}</SelectItem>)}</SelectContent>
      </Select>
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Learner records couldn&apos;t be loaded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!rows && !error ? <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-32 rounded-2xl" />)}</div> : null}
      {analytics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Enrollments" value={String(analytics.enrollments)} hint={`${analytics.active} with active access`} />
            <Stat label="Completed" value={String(analytics.completedCourse)} hint="finished every current lesson" />
            <Stat label="Completion rate" value={`${analytics.completionRate}%`} hint="completed ÷ enrollments" />
            <Stat label="Biggest drop-off" value={analytics.dropOff ? `−${analytics.dropOff.lost}` : "—"} hint={analytics.dropOff ? `at ${analytics.dropOff.title}` : "nobody has stalled yet"} />
          </div>
          {analytics.enrollments === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-border">Nobody has enrolled in this course yet. Share its page and check back.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Enrollments over time" hint={`New learners per week (weeks start on Monday, UTC). ${analytics.enrollments} in total.`}>
                <WeeklyColumns days={analytics.overTime} />
              </Section>
              <Section title="Lesson funnel" hint="How many learners completed each lesson, in order. The highlighted lesson is where the most people stopped.">
                {analytics.funnel.map((step) => (
                  <div key={step.lessonId} className="grid gap-1">
                    <p className={cn("truncate text-xs", analytics.dropOff?.lessonId === step.lessonId ? "font-semibold text-foreground" : "text-muted-foreground")}>{step.title}</p>
                    <Bar value={step.completed} max={analytics.enrollments} highlight={analytics.dropOff?.lessonId === step.lessonId} label={`${step.completed} · ${step.percent}%`} />
                  </div>
                ))}
              </Section>
              <Section title="Quiz pass rates" hint="Learners whose latest attempt passed, out of everyone who tried." className="lg:col-span-2">
                {analytics.quizzes.length === 0 ? <p className="text-sm text-muted-foreground">This course has no quizzes yet. Add one to any lesson in the curriculum.</p> : null}
                {analytics.quizzes.map((quiz) => (
                  <div key={quiz.lessonId} className="grid gap-1">
                    <p className="truncate text-xs text-muted-foreground"><span className="font-medium text-foreground">{quiz.title}</span> · {quiz.attempts} tried{quiz.averagePercent !== null ? ` · average score ${quiz.averagePercent}%` : ""}</p>
                    <Bar value={quiz.passed} max={Math.max(quiz.attempts, 1)} label={quiz.passRate === null ? "no attempts" : `${quiz.passed}/${quiz.attempts} · ${quiz.passRate}%`} tone="bg-[var(--chart-3)]" />
                  </div>
                ))}
              </Section>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
