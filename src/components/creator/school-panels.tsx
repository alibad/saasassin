"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CreditCard,
  Download,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  Mail,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CourseDoc, LeadDoc } from "@/lib/creator/model";

import { apiJson, formatDate, timeAgo, type PeopleRecord } from "./client";
import { useEnrollments, useSchoolBody, useSchoolList, type EnrollmentRow } from "./school-data";
import { PageHeader } from "./shell";

function PanelState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>This couldn&apos;t be loaded</AlertTitle>
        <AlertDescription>
          {error}
          <Button className="mt-2 w-fit" size="sm" variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" /> Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (loading) return <div className="grid gap-3">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-14 rounded-xl" />)}</div>;
  return null;
}

function EmptyInvite({ icon: Icon, title, body }: { icon: typeof Mail; title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Icon className="size-5" aria-hidden="true" /></span>
      <h2 className="brand-heading mt-4 text-xl">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */

export function LearnersPanel({ tenantId, courses, canManage }: { tenantId: string; courses: CourseDoc[]; canManage: boolean }) {
  const { data, error, loading, reload } = useEnrollments(tenantId);
  const [courseFilter, setCourseFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState<EnrollmentRow | null>(null);
  const [changeError, setChangeError] = useState("");
  const [pending, setPending] = useState(false);

  async function changeAccess(row: EnrollmentRow) {
    setPending(true);
    setChangeError("");
    try {
      await apiJson(`/api/creator/tenants/${tenantId}/enrollments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: row.status === "revoked" ? "active" : "revoked" }),
      });
      setChanging(null);
      reload();
    } catch (caught) {
      setChangeError(caught instanceof Error ? caught.message : "Access couldn't be changed.");
    } finally {
      setPending(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const rows = (data ?? [])
    .filter((row) => courseFilter === "all" || row.courseId === courseFilter)
    .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle));
  const completed = rows.filter((row) => row.progress.isComplete).length;

  return (
    <>
      <PageHeader
        title="Learners"
        description="Everyone enrolled in your courses, with their progress, quiz results and access."
        actions={data ? <p className="text-sm text-muted-foreground">{rows.length} enrolled · {completed} completed</p> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" aria-label="Search learners" className="h-10 rounded-xl bg-card pl-9" />
        </div>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="h-10 w-60 rounded-xl bg-card" aria-label="Filter by course"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <PanelState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.length === 0 ? (
        <EmptyInvite icon={GraduationCap} title="Your first learners are one link away" body="Publish a course and share its landing page. Anyone who enrolls shows up here with their progress." />
      ) : null}
      {data && data.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Learner</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="min-w-44">Progress</TableHead>
                  <TableHead>Quizzes</TableHead>
                  <TableHead className="pr-5">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const quizzes = Object.values(row.quizScores ?? {});
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar person={{ uid: row.uid, name: row.name, email: row.email, photoURL: row.photoURL }} size="lg" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name || row.email}</p>
                            {row.name ? <p className="truncate text-xs text-muted-foreground">{row.email}</p> : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{row.courseTitle}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(row.enrolledAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={row.progress.percent} className="w-24" aria-label={`${row.progress.percent}% complete`} />
                          <span className="text-xs tabular-nums text-muted-foreground">{row.progress.completed}/{row.progress.total}</span>
                          {row.progress.isComplete ? <Badge variant="secondary">Completed</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{quizzes.length ? `${quizzes.filter((quiz) => quiz.passed).length} of ${quizzes.length} passed` : "—"}</TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center gap-2">
                          <Badge variant={row.status === "revoked" ? "destructive" : "outline"}>{row.status === "revoked" ? "Revoked" : "Active"}</Badge>
                          {canManage ? (
                            <Button size="sm" variant="ghost" onClick={() => { setChangeError(""); setChanging(row); }}>
                              {row.status === "revoked" ? "Restore" : "Revoke"}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nobody matches that search.</p> : null}
        </div>
      ) : null}
      <AlertDialog open={changing !== null} onOpenChange={(open) => { if (!open) setChanging(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{changing?.status === "revoked" ? "Restore" : "Revoke"} access for {changing?.name || changing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {changing?.status === "revoked"
                ? "They can open the course again and pick up where they left off."
                : "They can no longer open lessons or enroll again. Their progress is kept, and you can restore access later."}{" "}
              This is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {changeError ? <p className="text-sm text-destructive" role="alert">{changeError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={changing?.status === "revoked" ? "default" : "destructive"}
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (changing) void changeAccess(changing);
              }}
            >
              {pending ? <LoaderCircle className="animate-spin" /> : null} {changing?.status === "revoked" ? "Restore access" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

export function LeadsPanel({ tenantId, courses, canRemove }: { tenantId: string; courses: CourseDoc[]; canRemove: boolean }) {
  const { data, error, loading, reload } = useSchoolList<LeadDoc[]>(`/api/creator/tenants/${tenantId}/leads`, "leads");
  const [removing, setRemoving] = useState<LeadDoc | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [pending, setPending] = useState(false);
  const courseTitles = new Map(courses.map((course) => [course.slug, course.title]));

  async function removeLead(lead: LeadDoc) {
    setPending(true);
    setRemoveError("");
    try {
      await apiJson(`/api/creator/tenants/${tenantId}/leads/${lead.id}`, { method: "DELETE" });
      setRemoving(null);
      reload();
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : "That address couldn't be removed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Email list"
        description="Visitors who asked for updates on a course page and agreed to hear from you."
      />
      <Alert className="mb-6 rounded-2xl border-0 bg-accent text-accent-foreground ring-1 ring-border">
        <Mail />
        <AlertTitle>Email sending isn&apos;t connected yet</AlertTitle>
        <AlertDescription className="text-accent-foreground/85">
          Addresses are collected with consent and kept here. To email them today, download your school from Settings and use the tool you already send with.
        </AlertDescription>
      </Alert>
      <PanelState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.length === 0 ? (
        <EmptyInvite icon={Mail} title="Grow a list before you launch" body="Every published course page has a sign-up box. Share a page while a course is still filling up, and interested people land here." />
      ) : null}
      {data && data.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Email</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Consent</TableHead>
                  <TableHead>Signed up</TableHead>
                  {canRemove ? <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="pl-5 font-medium">{lead.email}</TableCell>
                    <TableCell className="text-muted-foreground">{courseTitles.get(lead.courseSlug) ?? lead.courseSlug}</TableCell>
                    <TableCell>{lead.consent ? <Badge variant="secondary">Agreed</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(lead.createdAt, true)}</TableCell>
                    {canRemove ? (
                      <TableCell className="pr-5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setRemoveError(""); setRemoving(lead); }}><Trash2 aria-hidden="true" /> Remove</Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.email} from your list?</AlertDialogTitle>
            <AlertDialogDescription>Use this when someone asks to be removed. The address is deleted; the activity log keeps only that an address was removed.</AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? <p className="text-sm text-destructive" role="alert">{removeError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); if (removing) void removeLead(removing); }}>
              {pending ? <LoaderCircle className="animate-spin" /> : null} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

type AuditEvent = {
  id: string;
  action: string;
  actor: { uid: string; email: string };
  target: { type: string; id: string };
  details: Record<string, unknown>;
  occurredAt: string | null;
};

const ACTIONS: Record<string, string> = {
  "tenant.created": "created the school",
  "course.created": "started a course",
  "course.updated": "edited",
  "course.published": "published",
  "course.draft": "moved to draft",
  "course.archived": "archived",
  "course.duplicated": "duplicated",
  "import.committed": "imported courses from Kajabi",
  "enrollment.created": "enrolled in",
  "enrollment.granted": "enrolled a learner in",
  "enrollment.revoked": "removed a learner's access to",
  "enrollment.restored": "gave a learner access again to",
  "enrollment.completed": "finished",
  "progress.lesson_completed": "completed",
  "progress.lesson_reopened": "reopened",
  "quiz.submitted": "took the quiz in",
  "comment.created": "commented on",
  "comment.hidden": "hid a comment on",
  "comment.restored": "restored a comment on",
  "lead.captured": "joined the email list for",
  "lead.removed": "removed an address from the email list",
  "export.downloaded": "downloaded the school",
  "membership.granted": "added a teammate",
  "membership.removed": "removed a teammate",
  "membership.left": "left the team",
  "membership.role_changed": "changed a teammate's role",
  "invitation.created": "invited",
  "invitation.resent": "sent a new invitation link",
  "invitation.revoked": "revoked an invitation",
  "invitation.accepted": "joined the team",
  "ownership.transferred": "handed over ownership",
};

export function ActivityPanel({ tenantId, courses }: { tenantId: string; courses: CourseDoc[] }) {
  const { data: body, error, loading, reload } = useSchoolBody<{ events: AuditEvent[]; people: PeopleRecord }>(`/api/creator/tenants/${tenantId}/audit`);
  const data = body?.events ?? null;
  const people = body?.people;
  const courseTitles = useMemo(() => new Map(courses.map((course) => [course.id, course.title])), [courses]);
  const lessons = useMemo(
    () => new Map(courses.flatMap((course) => course.modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => [lesson.id, { title: lesson.title, courseId: course.id }] as const)))),
    [courses],
  );

  /** What an event was about: a lesson (and its course), a course, or an invited email. */
  function subjectOf(event: AuditEvent): { main: string; context: string } {
    const lesson = typeof event.details.lessonId === "string" ? lessons.get(event.details.lessonId) : undefined;
    const courseId =
      typeof event.details.courseId === "string" ? event.details.courseId
        : event.target.type === "course" ? event.target.id
          : event.target.type === "enrollment" ? event.target.id.split("_")[0]
            : lesson?.courseId ?? "";
    const course = courseTitles.get(courseId) ?? "";
    if (event.action === "invitation.created" && typeof event.details.email === "string") return { main: event.details.email, context: "" };
    if (lesson && event.action !== "quiz.submitted") return { main: lesson.title, context: course };
    return { main: course, context: lesson ? lesson.title : "" };
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change in your school, newest first: course edits and publishing, enrollments, progress, comments, the email list and your team. It can't be edited or deleted."
        actions={<Button variant="outline" className="rounded-xl" onClick={reload}><RefreshCw aria-hidden="true" /> Refresh</Button>}
      />
      <PanelState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.length === 0 ? <EmptyInvite icon={RefreshCw} title="Nothing has happened yet" body="As you and your team build courses and learners enroll, every step is recorded here." /> : null}
      {data && data.length > 0 ? (
        <ol className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {data.map((event, index) => {
            const person = people?.[event.actor?.uid ?? ""];
            const visitor = event.actor?.uid === "public";
            const name = visitor ? "A visitor" : person?.name || event.actor?.email || "Someone";
            const subject = subjectOf(event);
            const verb = ACTIONS[event.action] ?? event.action.replace(/[._]/g, " ");
            return (
              <li key={event.id} className={`flex items-start gap-3 px-5 py-4 ${index ? "border-t border-border" : ""}`}>
                <UserAvatar person={{ uid: event.actor?.uid ?? event.id, name: visitor ? "Visitor" : name, email: event.actor?.email, photoURL: person?.photoURL ?? null }} size="md" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    <span className="font-medium">{name}</span> <span className="text-muted-foreground">{verb}</span>
                    {subject.main ? <> <span className="font-medium">{subject.main}</span></> : null}
                    {subject.context ? <span className="text-muted-foreground"> · {subject.context}</span> : null}
                  </p>
                  {typeof event.details.reason === "string" && event.details.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{event.details.reason}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt ?? undefined}>{timeAgo(event.occurredAt)}</time>
              </li>
            );
          })}
        </ol>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

export function SettingsPanel({ tenantId, schoolName, canExport }: { tenantId: string; schoolName: string; canExport: boolean }) {
  const catalog = `/apps/creator/s/${tenantId}`;
  return (
    <>
      <PageHeader title="Settings" description={`How ${schoolName} meets the world, and how you take everything with you.`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <h2 className="brand-heading text-xl">Your school&apos;s site</h2>
          <p className="mt-1 text-sm text-muted-foreground">A public catalog of your published courses. Each course also has its own landing page with a sign-up box.</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{catalog}</span>
            <Button asChild size="sm" variant="outline"><Link href={catalog} target="_blank"><ExternalLink aria-hidden="true" /> Open</Link></Button>
          </div>
        </section>
        <section className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <h2 className="flex items-center gap-2 brand-heading text-xl"><CreditCard className="size-5 text-primary" aria-hidden="true" /> Payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You can set a price on any course and it&apos;s shown on its page, but no payment provider is connected yet, so nobody can be charged. Free courses are open for enrollment today.
          </p>
          <Badge variant="outline" className="mt-4">Not connected</Badge>
        </section>
        <section className="rounded-2xl bg-card p-6 ring-1 ring-border lg:col-span-2">
          <h2 className="flex items-center gap-2 brand-heading text-xl"><Download className="size-5 text-primary" aria-hidden="true" /> Take everything with you</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Download your whole school as one file: every course with its modules, lessons and quizzes, enrollments with progress and quiz scores, your email list, team and activity log. It&apos;s yours, in an open format.
          </p>
          {canExport ? (
            <Button asChild className="mt-4 rounded-xl" size="lg"><a href={`/api/creator/tenants/${tenantId}/export`} download><Download aria-hidden="true" /> Download my school</a></Button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Ask an owner or admin to download the school.</p>
          )}
        </section>
      </div>
    </>
  );
}
