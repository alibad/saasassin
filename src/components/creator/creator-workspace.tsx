"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  FileUp,
  BookOpen,
  CircleAlert,
  Download,
  GraduationCap,
  History,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCw,
  School,
  Trash2,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_STATE_LABELS, formatPrice, type CourseDoc, type EnrollmentDoc, type LeadDoc, type ProgressSummary } from "@/lib/creator/model";

import { apiJson, formatDate, panelClass } from "./client";
import { CourseEditor } from "./course-editor";
import { ImportPanel } from "./import-panel";
import { CreatorSignOutButton } from "./sign-out-button";

type Tenant = { id: string; name: string; role: string };
type LearnerCourse = { id: string; tenantId: string; courseSlug: string; courseTitle: string; schoolName: string; enrolledAt: string };
type EnrollmentRow = EnrollmentDoc & { courseTitle: string; progress: ProgressSummary };
type Member = { uid: string; email: string; name: string; role: string; status: string };
type AuditEvent = { id: string; action: string; actor: { uid: string; email: string }; target: { type: string; id: string }; details: Record<string, unknown>; occurredAt: string | null };

const EDITOR = ["owner", "admin", "member"];
const PUBLISHER = ["owner", "admin"];

export function CreatorWorkspace({ user, learnerCourses }: { user: { email: string; name: string }; learnerCourses: LearnerCourse[] }) {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [loadError, setLoadError] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<{ tenants: Tenant[] }>("/api/fleet/creator/tenants")
      .then(({ tenants: list }) => {
        if (!active) return;
        setTenants(list);
        setTenantId((current) => current && list.some((tenant) => tenant.id === current) ? current : list[0]?.id ?? "");
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(caught instanceof Error ? caught.message : "Could not load your schools.");
        setTenants([]);
      });
    return () => { active = false; };
  }, []);

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setLoadError("");
    try {
      const { tenant } = await apiJson<{ tenant: Tenant }>("/api/fleet/creator/tenants", { method: "POST", body: JSON.stringify({ name: schoolName }) });
      setTenants((current) => [...(current ?? []), tenant]);
      setTenantId(tenant.id);
      setSchoolName("");
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not create the school.");
    } finally {
      setCreating(false);
    }
  }

  const tenant = tenants?.find((entry) => entry.id === tenantId) ?? null;

  return (
    <main className="fleet-app min-h-screen bg-[#f6f1e7] text-neutral-900" style={{ ["--creator-accent" as string]: "#ff3d93" }}>
      <header className="border-b-2 border-neutral-900 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/apps/creator" className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center border-2 border-neutral-900 bg-[#ff3d93] text-white"><GraduationCap className="size-4" aria-hidden="true" /></span>
            SaaSassin <span className="font-normal">Creator</span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {tenants && tenants.length > 0 && (
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="w-52" aria-label="Choose a school"><SelectValue placeholder="Choose a school" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <span className="hidden text-sm text-neutral-600 sm:inline">{user.email}</span>
            <CreatorSignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {loadError && (
          <Alert variant="destructive"><CircleAlert /><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>
        )}

        {learnerCourses.length > 0 && (
          <Card className={panelClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="size-4" aria-hidden="true" /> My learning</CardTitle>
              <CardDescription>Courses you enrolled in as a learner.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {learnerCourses.map((entry) => (
                <Button key={entry.id} variant="outline" asChild>
                  <Link href={`/apps/creator/c/${entry.tenantId}/${entry.courseSlug}/learn`}>{entry.courseTitle} · {entry.schoolName}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {tenants === null ? (
          <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your schools…</p>
        ) : (
          <Card className={panelClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><School className="size-4" aria-hidden="true" /> {tenants.length ? "Start another school" : "Create your school"}</CardTitle>
              <CardDescription>A school is the workspace for your courses, learners, team and exports.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={createSchool} className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-56 flex-1 gap-1">
                  <Label htmlFor="school-name">School name</Label>
                  <Input id="school-name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. Studio Ceramics Academy" minLength={2} maxLength={80} required />
                </div>
                <Button type="submit" disabled={creating || schoolName.trim().length < 2}><Plus aria-hidden="true" /> {creating ? "Creating…" : "Create school"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {tenant && <SchoolWorkspace key={tenant.id} tenant={tenant} />}
      </div>
    </main>
  );
}

function SchoolWorkspace({ tenant }: { tenant: Tenant }) {
  const [courses, setCourses] = useState<CourseDoc[] | null>(null);
  const [role, setRole] = useState(tenant.role);
  const [selectedId, setSelectedId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coursesVersion, setCoursesVersion] = useState(0);
  const canEdit = EDITOR.includes(role);
  const canPublish = PUBLISHER.includes(role);

  useEffect(() => {
    let active = true;
    apiJson<{ courses: CourseDoc[]; role: string }>(`/api/creator/tenants/${tenant.id}/courses`)
      .then((result) => {
        if (!active) return;
        setCourses(result.courses);
        setRole(result.role);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load courses.");
        setCourses([]);
      });
    return () => { active = false; };
  }, [tenant.id, coursesVersion]);

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { course } = await apiJson<{ course: CourseDoc }>(`/api/creator/tenants/${tenant.id}/courses`, { method: "POST", body: JSON.stringify({ title: newTitle }) });
      setCourses((current) => [course, ...(current ?? [])]);
      setSelectedId(course.id);
      setNewTitle("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the course.");
    } finally {
      setBusy(false);
    }
  }

  const selected = courses?.find((course) => course.id === selectedId) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{tenant.name}</h1>
        <Badge variant="outline">Your role: {role}</Badge>
      </div>
      {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <Tabs defaultValue="courses">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="courses"><BookOpen aria-hidden="true" /> Courses</TabsTrigger>
          <TabsTrigger value="learners"><GraduationCap aria-hidden="true" /> Learners</TabsTrigger>
          <TabsTrigger value="leads"><Mail aria-hidden="true" /> Leads</TabsTrigger>
          <TabsTrigger value="team"><Users aria-hidden="true" /> Team</TabsTrigger>
          <TabsTrigger value="audit"><History aria-hidden="true" /> Audit</TabsTrigger>
          <TabsTrigger value="import"><FileUp aria-hidden="true" /> Import</TabsTrigger>
          <TabsTrigger value="export"><Download aria-hidden="true" /> Export</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="space-y-3">
              {canEdit && (
                <form onSubmit={createCourse} className={`${panelClass} grid gap-2 p-3`}>
                  <Label htmlFor="new-course">New course</Label>
                  <Input id="new-course" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Course title" minLength={2} maxLength={140} required />
                  <Button type="submit" disabled={busy || newTitle.trim().length < 2}><Plus aria-hidden="true" /> {busy ? "Creating…" : "Create draft"}</Button>
                </form>
              )}
              {courses === null && <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading courses…</p>}
              {courses?.length === 0 && <p className="border-2 border-dashed border-neutral-400 p-4 text-sm text-neutral-600">No courses yet. {canEdit ? "Create a draft to start building the curriculum." : "An editor has not created one yet."}</p>}
              <ul className="space-y-2">
                {courses?.map((course) => (
                  <li key={course.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(course.id)}
                      className={`w-full border-2 p-3 text-left transition ${course.id === selectedId ? "border-neutral-900 bg-[#ff3d93]/10 shadow-[3px_3px_0_0_#171717]" : "border-neutral-300 bg-white hover:border-neutral-900"}`}
                      aria-pressed={course.id === selectedId}
                    >
                      <span className="block font-semibold">{course.title}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Badge variant={course.status === "published" ? "default" : "outline"}>{COURSE_STATE_LABELS[course.status]}</Badge>
                        <Badge variant="secondary">{formatPrice(course.pricing)}</Badge>
                        <Badge variant="outline">{course.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {selected ? (
                <CourseEditor
                  key={selected.id}
                  tenantId={tenant.id}
                  course={selected}
                  canEdit={canEdit}
                  canPublish={canPublish}
                  onChange={(course) => setCourses((current) => current?.map((entry) => entry.id === course.id ? course : entry) ?? null)}
                  onDuplicated={(course) => { setCourses((current) => [course, ...(current ?? [])]); setSelectedId(course.id); }}
                />
              ) : (
                <div className="border-2 border-dashed border-neutral-400 p-8 text-center text-sm text-neutral-600">Choose a course to edit its curriculum, offer and publishing state.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="import" className="mt-4"><ImportPanel tenantId={tenant.id} canImport={canEdit} onImported={() => setCoursesVersion((current) => current + 1)} /></TabsContent>
        <TabsContent value="learners" className="mt-4"><LearnersPanel tenantId={tenant.id} courses={courses ?? []} canManage={canPublish} /></TabsContent>
        <TabsContent value="leads" className="mt-4"><LeadsPanel tenantId={tenant.id} canRemove={canPublish} /></TabsContent>
        <TabsContent value="team" className="mt-4"><TeamPanel tenantId={tenant.id} canInvite={canPublish} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPanel tenantId={tenant.id} /></TabsContent>
        <TabsContent value="export" className="mt-4">
          <Card className={panelClass}>
            <CardHeader>
              <CardTitle>Export the whole school</CardTitle>
              <CardDescription>
                One versioned JSON file (manifest schema net.saasassin.workspace-export 1.0.0) with the school, every course with its modules, lessons and quizzes, enrollments with progress and quiz scores, leads, team members and the audit log.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canPublish ? (
                <Button asChild><a href={`/api/creator/tenants/${tenant.id}/export`} download><Download aria-hidden="true" /> Download export</a></Button>
              ) : (
                <p className="text-sm text-neutral-600">Only owners and admins can export the school.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function useLoader<T>(url: string, key: string) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    apiJson<Record<string, unknown>>(url)
      .then((body) => { if (active) setState({ data: body[key] as T, error: "", loading: false }); })
      .catch((caught) => { if (active) setState((current) => ({ ...current, error: caught instanceof Error ? caught.message : "Could not load.", loading: false })); });
    return () => { active = false; };
  }, [url, key, version]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setVersion((current) => current + 1);
  }, []);
  return { ...state, reload };
}

function PanelState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) return <Alert variant="destructive"><CircleAlert /><AlertTitle>Could not load</AlertTitle><AlertDescription>{error} <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button></AlertDescription></Alert>;
  if (loading) return <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading…</p>;
  return null;
}

function LearnersPanel({ tenantId, courses, canManage }: { tenantId: string; courses: CourseDoc[]; canManage: boolean }) {
  const { data, error, loading, reload } = useLoader<EnrollmentRow[]>(`/api/creator/tenants/${tenantId}/enrollments`, "enrollments");
  const [courseFilter, setCourseFilter] = useState("all");
  const [changing, setChanging] = useState<EnrollmentRow | null>(null);
  const [changeError, setChangeError] = useState("");
  const [pending, setPending] = useState(false);

  async function changeAccess() {
    if (!changing) return;
    setPending(true);
    setChangeError("");
    try {
      await apiJson(`/api/creator/tenants/${tenantId}/enrollments/${changing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: changing.status === "revoked" ? "active" : "revoked" }),
      });
      setChanging(null);
      reload();
    } catch (caught) {
      setChangeError(caught instanceof Error ? caught.message : "Could not change access.");
    } finally {
      setPending(false);
    }
  }

  const rows = (data ?? []).filter((row) => courseFilter === "all" || row.courseId === courseFilter);
  const completed = rows.filter((row) => row.progress.isComplete).length;
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Learners and progress</CardTitle>
        <CardDescription>Progress = completed lessons that still exist ÷ lessons in the course today.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-60" aria-label="Filter by course"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={reload}><RefreshCw aria-hidden="true" /> Refresh</Button>
          {data && <span className="text-sm text-neutral-600">{rows.length} enrolled · {completed} completed</span>}
        </div>
        <PanelState loading={loading && !data} error={error} onRetry={reload} />
        {data && rows.length === 0 && <p className="text-sm text-neutral-600">No enrollments yet. Publish a course and share its landing page.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Learner</TableHead><TableHead>Course</TableHead><TableHead>Enrolled</TableHead><TableHead className="min-w-40">Progress</TableHead><TableHead>Quizzes</TableHead><TableHead>Completed</TableHead><TableHead>Access</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const quizzes = Object.values(row.quizScores ?? {});
                  return (
                    <TableRow key={row.id}>
                      <TableCell><span className="block font-medium">{row.name || row.email}</span>{row.name && <span className="text-xs text-neutral-500">{row.email}</span>}</TableCell>
                      <TableCell>{row.courseTitle}</TableCell>
                      <TableCell>{formatDate(row.enrolledAt)}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Progress value={row.progress.percent} className="w-24" /><span className="text-xs">{row.progress.completed}/{row.progress.total} · {row.progress.percent}%</span></div></TableCell>
                      <TableCell className="text-xs">{quizzes.length ? `${quizzes.filter((q) => q.passed).length}/${quizzes.length} passed` : "—"}</TableCell>
                      <TableCell>{row.progress.isComplete ? formatDate(row.completedAt) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={row.status === "revoked" ? "destructive" : "outline"}>{row.status === "revoked" ? "Revoked" : "Active"}</Badge>
                          {canManage && <Button size="sm" variant="ghost" onClick={() => { setChangeError(""); setChanging(row); }}>{row.status === "revoked" ? "Restore" : "Revoke"}</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Dialog open={changing !== null} onOpenChange={(open) => !open && setChanging(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{changing?.status === "revoked" ? "Restore" : "Revoke"} access for {changing?.name || changing?.email}?</DialogTitle>
              <DialogDescription>
                {changing?.status === "revoked"
                  ? "They can open the course again and continue where they left off."
                  : "They can no longer open lessons or re-enroll. Their progress is kept, and you can restore access later."} This is recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            {changeError && <p className="text-sm text-red-700" role="alert">{changeError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setChanging(null)}>Cancel</Button>
              <Button variant={changing?.status === "revoked" ? "default" : "destructive"} onClick={changeAccess} disabled={pending}>{pending ? "Saving…" : "Confirm"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function LeadsPanel({ tenantId, canRemove }: { tenantId: string; canRemove: boolean }) {
  const { data, error, loading, reload } = useLoader<LeadDoc[]>(`/api/creator/tenants/${tenantId}/leads`, "leads");
  const [removing, setRemoving] = useState<LeadDoc | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [pending, setPending] = useState(false);

  async function removeLead() {
    if (!removing) return;
    setPending(true);
    setRemoveError("");
    try {
      await apiJson(`/api/creator/tenants/${tenantId}/leads/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      reload();
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : "Could not remove the lead.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Email list</CardTitle>
        <CardDescription>Visitors who asked for updates on a course landing page and ticked the consent box. No email provider is connected, so nothing is sent from here yet — export the list to use it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <PanelState loading={loading && !data} error={error} onRetry={reload} />
        {data && data.length === 0 && <p className="text-sm text-neutral-600">No leads yet. Every published landing page has a sign-up box.</p>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Course</TableHead><TableHead>Consent</TableHead><TableHead>Captured</TableHead>{canRemove && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {data.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.email}</TableCell><TableCell>{lead.courseSlug}</TableCell><TableCell>{lead.consent ? "Yes" : "No"}</TableCell><TableCell>{formatDate(lead.createdAt, true)}</TableCell>
                    {canRemove && <TableCell><Button size="sm" variant="ghost" onClick={() => setRemoving(lead)}><Trash2 aria-hidden="true" /> Remove</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email} from the list?</DialogTitle>
            <DialogDescription>Use this when someone withdraws consent. The address is deleted; the audit log keeps only that a lead was removed.</DialogDescription>
          </DialogHeader>
          {removeError && <p className="text-sm text-red-700" role="alert">{removeError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={removeLead} disabled={pending}>{pending ? "Removing…" : "Remove"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TeamPanel({ tenantId, canInvite }: { tenantId: string; canInvite: boolean }) {
  const { data, error, loading, reload } = useLoader<Member[]>(`/api/creator/tenants/${tenantId}/members`, "members");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteError, setInviteError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setInviteError("");
    setNotice("");
    try {
      await apiJson(`/api/creator/tenants/${tenantId}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
      setNotice(`${email} can now open this school as ${role}.`);
      setEmail("");
      reload();
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : "Could not add that person.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Admins publish, export and invite. Members draft and edit courses. Viewers read learners, leads and audit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canInvite ? (
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-56 flex-1 gap-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" required />
            </div>
            <div className="grid gap-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending}><Plus aria-hidden="true" /> {pending ? "Adding…" : "Add to school"}</Button>
          </form>
        ) : <p className="text-sm text-neutral-600">Only owners and admins can add people.</p>}
        {inviteError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Not added</AlertTitle><AlertDescription>{inviteError}</AlertDescription></Alert>}
        {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
        <PanelState loading={loading && !data} error={error} onRetry={reload} />
        {data && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((member) => (
                  <TableRow key={member.uid}><TableCell>{member.name || member.email}<span className="block text-xs text-neutral-500">{member.name ? member.email : ""}</span></TableCell><TableCell><Badge variant="outline">{member.role}</Badge></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ tenantId }: { tenantId: string }) {
  const { data, error, loading, reload } = useLoader<AuditEvent[]>(`/api/creator/tenants/${tenantId}/audit`, "events");
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Append-only record of every change: course edits and state changes, enrollments, progress, quizzes, leads, team and exports. Latest 100.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" variant="outline" onClick={reload}><RefreshCw aria-hidden="true" /> Refresh</Button>
        <PanelState loading={loading && !data} error={error} onRetry={reload} />
        {data && data.length === 0 && <p className="text-sm text-neutral-600">No events yet.</p>}
        {data && data.length > 0 && (
          <ol className="divide-y divide-neutral-200 border-2 border-neutral-900 bg-white">
            {data.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <code className="font-mono text-xs font-semibold">{event.action}</code>
                <span className="text-neutral-700">{event.actor?.email || event.actor?.uid}</span>
                <span className="text-xs text-neutral-500">{event.target?.type} {event.target?.id}</span>
                <span className="ml-auto text-xs text-neutral-500">{formatDate(event.occurredAt, true)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
