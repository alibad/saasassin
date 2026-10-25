"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { courseAnalytics, type AnalyticsEnrollment } from "@/lib/creator/analytics";
import type { CourseDoc } from "@/lib/creator/model";

import { apiJson, panelClass } from "./client";

type Row = AnalyticsEnrollment & { courseId: string };

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="h-4 flex-1 border border-neutral-900 bg-white" aria-hidden="true">
        <div className="h-full bg-[#ff3d93]" style={{ width: `${width}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums">{label}</span>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-2 border-neutral-900 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

export function AnalyticsPanel({ tenantId, courses }: { tenantId: string; courses: CourseDoc[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    let active = true;
    apiJson<{ enrollments: Row[] }>(`/api/creator/tenants/${tenantId}/enrollments`)
      .then((body) => { if (active) setRows(body.enrollments); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load enrollments."); });
    return () => { active = false; };
  }, [tenantId]);

  const selectedId = courseId || courses[0]?.id || "";
  const course = courses.find((entry) => entry.id === selectedId);
  const analytics = useMemo(
    () => (course && rows ? courseAnalytics(course.modules, rows.filter((row) => row.courseId === course.id)) : null),
    [course, rows],
  );

  if (!courses.length) return <p className="text-sm text-neutral-600">Create and publish a course to see analytics.</p>;

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Course analytics</CardTitle>
        <CardDescription>Computed live from enrollment and progress records — nothing is sampled or estimated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Select value={selectedId} onValueChange={setCourseId}>
          <SelectTrigger className="w-72" aria-label="Choose a course"><SelectValue /></SelectTrigger>
          <SelectContent>{courses.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.title}</SelectItem>)}</SelectContent>
        </Select>
        {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Could not load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {!rows && !error && <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading…</p>}
        {analytics && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Enrollments" value={String(analytics.enrollments)} hint={`${analytics.active} with active access`} />
              <Stat label="Completed" value={String(analytics.completedCourse)} hint="every current lesson done" />
              <Stat label="Completion rate" value={`${analytics.completionRate}%`} hint="completed ÷ enrollments" />
              <Stat label="Drop-off lesson" value={analytics.dropOff ? `−${analytics.dropOff.lost}` : "—"} hint={analytics.dropOff ? analytics.dropOff.title : "no drop yet"} />
            </div>
            {analytics.enrollments === 0 ? (
              <p className="text-sm text-neutral-600">No enrollments in this course yet.</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-2">
                  <h3 className="font-semibold">Enrollments over time</h3>
                  <p className="text-xs text-neutral-500">Per UTC day, with running total.</p>
                  {analytics.overTime.map((day) => <Bar key={day.date} value={day.count} max={Math.max(...analytics.overTime.map((entry) => entry.count))} label={`${day.date} · ${day.count} (${day.cumulative})`} />)}
                </section>
                <section className="space-y-2">
                  <h3 className="font-semibold">Completion funnel</h3>
                  <p className="text-xs text-neutral-500">Learners who completed each lesson, in curriculum order. Drop-off = biggest fall from the previous step.</p>
                  {analytics.funnel.map((step) => (
                    <div key={step.lessonId}>
                      <p className={`truncate text-xs ${analytics.dropOff?.lessonId === step.lessonId ? "font-bold text-[#c2185b]" : ""}`}>{step.title}</p>
                      <Bar value={step.completed} max={analytics.enrollments} label={`${step.completed} · ${step.percent}%`} />
                    </div>
                  ))}
                </section>
                <section className="space-y-2 lg:col-span-2">
                  <h3 className="font-semibold">Quiz pass rates</h3>
                  <p className="text-xs text-neutral-500">Learners whose latest attempt passed ÷ learners who attempted.</p>
                  {analytics.quizzes.length === 0 && <p className="text-sm text-neutral-600">This course has no quizzes.</p>}
                  {analytics.quizzes.map((quiz) => (
                    <div key={quiz.lessonId}>
                      <p className="truncate text-xs">{quiz.title} · {quiz.attempts} attempted{quiz.averagePercent !== null ? ` · average ${quiz.averagePercent}%` : ""}</p>
                      <Bar value={quiz.passed} max={Math.max(quiz.attempts, 1)} label={quiz.passRate === null ? "no attempts" : `${quiz.passed}/${quiz.attempts} · ${quiz.passRate}%`} />
                    </div>
                  ))}
                </section>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
