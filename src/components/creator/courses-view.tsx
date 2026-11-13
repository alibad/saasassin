"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BookOpen, LoaderCircle, Plus, Users } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_STATE_LABELS, formatPrice, type CourseDoc, type CourseState } from "@/lib/creator/model";
import { cn } from "@/lib/utils";

import { apiJson, type PeopleRecord } from "./client";
import { CourseCover } from "./course-cover";
import type { SchoolNavigate } from "./creator-workspace";
import { lessonCount, useEnrollments, type EnrollmentRow } from "./school-data";
import { PageHeader } from "./shell";

const STATUS_STYLES: Record<CourseState, string> = {
  published: "bg-emerald-600/90 text-white",
  draft: "bg-card/90 text-foreground",
  archived: "bg-muted/90 text-muted-foreground",
};

export function CourseStatusBadge({ status, className }: { status: CourseState; className?: string }) {
  return <Badge className={cn("backdrop-blur", STATUS_STYLES[status], className)}>{COURSE_STATE_LABELS[status]}</Badge>;
}

/** A course as a card: cover, status, title, size, and the learners taking it. */
export function CourseCard({
  course,
  learners,
  instructor,
  onOpen,
}: {
  course: CourseDoc;
  learners: EnrollmentRow[];
  instructor?: { uid: string; name: string; photoURL: string | null } | null;
  onOpen: () => void;
}) {
  const lessons = lessonCount(course);
  const shown = learners.slice(0, 4);
  const average = learners.length ? Math.round(learners.reduce((total, row) => total + row.progress.percent, 0) / learners.length) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)] hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CourseCover seed={course.id} title={course.title} className="aspect-[16/9] w-full">
        <CourseStatusBadge status={course.status} className="absolute top-3 left-3" />
        <span className="absolute right-3 bottom-3 rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium text-foreground backdrop-blur">
          {formatPrice(course.pricing)}
        </span>
      </CourseCover>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="brand-heading text-xl leading-snug group-hover:text-primary">{course.title}</h3>
          {course.subtitle ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.subtitle}</p> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {course.modules.length} {course.modules.length === 1 ? "module" : "modules"} · {lessons} {lessons === 1 ? "lesson" : "lessons"}
          {instructor ? ` · by ${instructor.name}` : ""}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
          {learners.length ? (
            <div className="flex items-center gap-2">
              <AvatarGroup>
                {shown.map((row) => (
                  <UserAvatar key={row.id} person={{ uid: row.uid, name: row.name, photoURL: row.photoURL }} size="sm" className="ring-2 ring-card" />
                ))}
                {learners.length > shown.length ? <AvatarGroupCount className="size-6 text-[10px]">+{learners.length - shown.length}</AvatarGroupCount> : null}
              </AvatarGroup>
              <span className="text-xs text-muted-foreground">{learners.length} {learners.length === 1 ? "learner" : "learners"}</span>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden="true" /> No learners yet</span>
          )}
          {average !== null ? <span className="text-xs font-medium tabular-nums">{average}% avg. progress</span> : null}
        </div>
      </div>
    </button>
  );
}

export function NewCourseDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (course: CourseDoc) => void;
}) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const { course } = await apiJson<{ course: CourseDoc }>(`/api/creator/tenants/${tenantId}/courses`, { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      onCreated(course);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The course couldn't be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(""); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="brand-heading text-2xl font-normal">Start a new course</DialogTitle>
            <DialogDescription>Give it a working title. It stays a private draft until you publish it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="new-course-title">Course title</Label>
            <Input id="new-course-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Sourdough from scratch" minLength={2} maxLength={140} required autoFocus />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || title.trim().length < 2}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Filter = "all" | CourseState;

export function CoursesView({
  tenantId,
  courses,
  people,
  canEdit,
  navigate,
  onCreated,
}: {
  tenantId: string;
  courses: CourseDoc[] | null;
  people: PeopleRecord;
  canEdit: boolean;
  navigate: SchoolNavigate;
  onCreated: (course: CourseDoc) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const { data: enrollments } = useEnrollments(tenantId);
  const byCourse = useMemo(() => {
    const map = new Map<string, EnrollmentRow[]>();
    for (const row of enrollments ?? []) map.set(row.courseId, [...(map.get(row.courseId) ?? []), row]);
    return map;
  }, [enrollments]);
  const counts = { all: courses?.length ?? 0, published: 0, draft: 0, archived: 0 };
  for (const course of courses ?? []) counts[course.status] += 1;
  const shown = (courses ?? []).filter((course) => filter === "all" || course.status === filter);

  return (
    <>
      <PageHeader
        title="Courses"
        description="Everything you teach. Open a course to shape its curriculum, landing page and price."
        actions={canEdit ? <Button size="lg" className="rounded-xl" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> New course</Button> : null}
      />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} className="mb-6">
        <TabsList className="h-10 rounded-xl">
          {(["all", "published", "draft", "archived"] as const).map((key) => (
            <TabsTrigger key={key} value={key} className="rounded-lg px-3">
              {key === "all" ? "All" : COURSE_STATE_LABELS[key]} <span className="text-muted-foreground tabular-nums">{counts[key]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {courses === null ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-80 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><BookOpen className="size-6" aria-hidden="true" /></span>
          <h2 className="brand-heading mt-4 text-2xl">{filter === "all" ? "Your first course starts here" : `No ${COURSE_STATE_LABELS[filter as CourseState].toLowerCase()} courses`}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {filter === "all"
              ? canEdit ? "Name it, add a few lessons with video and text, then publish a landing page your learners can enroll from." : "When an editor creates a course, it will show up here."
              : "Courses move here as you publish, unpublish or archive them."}
          </p>
          {filter === "all" && canEdit ? <Button className="mt-6 rounded-xl" size="lg" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Create a course</Button> : null}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((course) => {
            const instructor = people[course.createdBy];
            return (
              <CourseCard
                key={course.id}
                course={course}
                learners={byCourse.get(course.id) ?? []}
                instructor={instructor ? { uid: course.createdBy, ...instructor } : null}
                onOpen={() => navigate({ view: "course", course: course.id })}
              />
            );
          })}
        </div>
      )}
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
    </>
  );
}
