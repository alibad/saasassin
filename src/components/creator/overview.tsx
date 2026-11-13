"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, GraduationCap, Mail, MessagesSquare, Plus, Sparkles, Trophy } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { orderedLessons, type CommentDoc, type CourseDoc, type LeadDoc } from "@/lib/creator/model";

import { timeAgo } from "./client";
import { CourseCard, NewCourseDialog } from "./courses-view";
import type { SchoolNavigate } from "./creator-workspace";
import { firstName, useEnrollments, useSchoolList, type EnrollmentRow } from "./school-data";

type ModerationComment = CommentDoc & { photoURL: string | null };

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof BookOpen; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" aria-hidden="true" /></span>
      </div>
      <p className="brand-heading mt-3 text-3xl tabular-nums sm:text-4xl">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The school's front page: how it's doing, the courses, and the people in it right now. */
export function OverviewView({
  tenantId,
  schoolName,
  userName,
  courses,
  canEdit,
  navigate,
  onCreated,
}: {
  tenantId: string;
  schoolName: string;
  userName: string;
  courses: CourseDoc[] | null;
  canEdit: boolean;
  navigate: SchoolNavigate;
  onCreated: (course: CourseDoc) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const { data: enrollments } = useEnrollments(tenantId);
  const { data: comments } = useSchoolList<ModerationComment[]>(`/api/creator/tenants/${tenantId}/comments`, "comments");
  const { data: leads } = useSchoolList<LeadDoc[]>(`/api/creator/tenants/${tenantId}/leads`, "leads");

  const stats = useMemo(() => {
    const rows = enrollments ?? [];
    const learners = new Set(rows.map((row) => row.uid)).size;
    const completed = rows.filter((row) => row.progress.isComplete).length;
    const weekAgo = openedAt - 7 * 86_400_000;
    const thisWeek = rows.filter((row) => new Date(row.enrolledAt).getTime() >= weekAgo).length;
    return { learners, completed, rate: rows.length ? Math.round((completed / rows.length) * 100) : 0, thisWeek, enrollments: rows.length };
  }, [enrollments, openedAt]);

  const byCourse = useMemo(() => {
    const map = new Map<string, EnrollmentRow[]>();
    for (const row of enrollments ?? []) map.set(row.courseId, [...(map.get(row.courseId) ?? []), row]);
    return map;
  }, [enrollments]);

  const featured = [...(courses ?? [])]
    .filter((course) => course.status !== "archived")
    .sort((a, b) => (byCourse.get(b.id)?.length ?? 0) - (byCourse.get(a.id)?.length ?? 0))
    .slice(0, 3);
  const published = (courses ?? []).filter((course) => course.status === "published").length;
  const lessonTitles = new Map((courses ?? []).flatMap((course) => orderedLessons(course.modules).map((lesson) => [`${course.id}:${lesson.id}`, lesson.title] as const)));
  const recentLearners = (enrollments ?? []).slice(0, 6);
  const recentComments = (comments ?? []).filter((comment) => !comment.hidden).slice(0, 4);
  const name = firstName(userName);

  return (
    <div className="grid gap-10">
      <section className="relative overflow-hidden rounded-3xl bg-brand-ink px-6 py-8 text-brand-ink-foreground sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_100%_0%,color-mix(in_oklab,var(--chart-1)_55%,transparent)_0%,transparent_70%),radial-gradient(50%_80%_at_80%_110%,color-mix(in_oklab,var(--brand-accent)_45%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-brand-accent">{schoolName}</p>
            <h1 className="brand-heading mt-2 text-4xl leading-tight sm:text-5xl">{greeting()}{name ? `, ${name}` : ""}.</h1>
            <p className="mt-3 text-brand-ink-foreground/80">
              {stats.thisWeek
                ? `${stats.thisWeek} ${stats.thisWeek === 1 ? "person" : "people"} enrolled this week, and ${stats.completed} ${stats.completed === 1 ? "learner has" : "learners have"} finished a course so far.`
                : "Here's how your school is doing today."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button size="lg" className="rounded-xl bg-brand-accent text-brand-accent-foreground hover:bg-brand-accent/90" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" /> New course
              </Button>
            ) : null}
            <Button size="lg" variant="outline" className="rounded-xl border-white/25 bg-white/5 text-brand-ink-foreground hover:bg-white/10 hover:text-brand-ink-foreground" onClick={() => navigate({ view: "analytics" })}>
              See analytics
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="School at a glance">
        {enrollments === null || courses === null ? (
          [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-36 rounded-2xl" />)
        ) : (
          <>
            <Stat icon={GraduationCap} label="Learners" value={String(stats.learners)} hint={`${stats.enrollments} enrollments across your courses`} tone="bg-secondary text-secondary-foreground" />
            <Stat icon={Trophy} label="Completion rate" value={`${stats.rate}%`} hint={`${stats.completed} finished every lesson`} tone="bg-accent text-accent-foreground" />
            <Stat icon={BookOpen} label="Published courses" value={String(published)} hint={`${(courses ?? []).length - published} more in draft or archived`} tone="bg-secondary text-secondary-foreground" />
            <Stat icon={Mail} label="Email list" value={String(leads?.length ?? 0)} hint="visitors who asked for updates" tone="bg-accent text-accent-foreground" />
          </>
        )}
      </section>

      <section className="grid gap-5">
        <div className="flex items-end justify-between gap-3">
          <h2 className="brand-heading text-2xl">Your courses</h2>
          <Button variant="ghost" onClick={() => navigate({ view: "courses" })}>All courses <ArrowRight aria-hidden="true" /></Button>
        </div>
        {courses === null ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-80 rounded-2xl" />)}</div>
        ) : featured.length === 0 ? (
          <div className="grid gap-6 rounded-2xl bg-card p-8 ring-1 ring-border sm:grid-cols-[auto_1fr] sm:items-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Sparkles className="size-6" aria-hidden="true" /></span>
            <div>
              <h3 className="brand-heading text-2xl">Create the course only you can teach</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add modules and lessons with video, text and quizzes, set a drip schedule, then publish a landing page. Already on Kajabi? Import your courses instead.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit ? <Button className="rounded-xl" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Create a course</Button> : null}
                <Button variant="outline" className="rounded-xl" onClick={() => navigate({ view: "import" })}>Import from Kajabi</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map((course) => (
              <CourseCard key={course.id} course={course} learners={byCourse.get(course.id) ?? []} onOpen={() => navigate({ view: "course", course: course.id })} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <h2 className="brand-heading text-xl">Recent learners</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ view: "learners" })}>View all</Button>
          </div>
          {enrollments === null ? (
            <div className="mt-4 grid gap-4">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-10" />)}</div>
          ) : recentLearners.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">When someone enrolls from a course page, they&apos;ll appear here with their progress.</p>
          ) : (
            <ul className="mt-4 grid gap-4">
              {recentLearners.map((row) => (
                <li key={row.id} className="flex items-center gap-3">
                  <UserAvatar person={{ uid: row.uid, name: row.name, email: row.email, photoURL: row.photoURL }} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.name || row.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.courseTitle} · joined {timeAgo(row.enrolledAt)}</p>
                  </div>
                  <div className="hidden w-32 shrink-0 sm:block">
                    <Progress value={row.progress.percent} aria-label={`${row.name || row.email}: ${row.progress.percent}% complete`} />
                    <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{row.progress.percent}%</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <h2 className="brand-heading text-xl">In the discussions</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ view: "discussions" })}>Open</Button>
          </div>
          {comments === null ? (
            <div className="mt-4 grid gap-4">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-14" />)}</div>
          ) : recentComments.length === 0 ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground"><MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Learners can ask questions under every lesson. New comments land here.</p>
          ) : (
            <ul className="mt-4 grid gap-5">
              {recentComments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <UserAvatar person={{ uid: comment.uid, name: comment.name, photoURL: comment.photoURL }} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{comment.name}</span> on {lessonTitles.get(`${comment.courseId}:${comment.lessonId}`) ?? "a lesson"} · {timeAgo(comment.createdAt)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm">{comment.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <NewCourseDialog
        tenantId={tenantId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(course) => {
          setCreating(false);
          onCreated(course);
          navigate({ view: "course", course: course.id });
        }}
      />
    </div>
  );
}
