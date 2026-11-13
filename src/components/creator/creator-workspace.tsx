"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { useAccount } from "@/components/account/client";
import { TeamPanel } from "@/components/account/team-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { CourseDoc } from "@/lib/creator/model";

import { AnalyticsPanel } from "./analytics-panel";
import { apiJson, type PeopleRecord } from "./client";
import { CourseEditor } from "./course-editor";
import { CoursesView } from "./courses-view";
import { DiscussionsModeration } from "./discussions";
import { ImportPanel } from "./import-panel";
import { LearningView, type LearnerCourse } from "./learning-view";
import { OverviewView } from "./overview";
import { ActivityPanel, LeadsPanel, LearnersPanel, SettingsPanel } from "./school-panels";
import { CreatorShell, PageHeader, type CreatorView } from "./shell";

const EDITOR = ["owner", "admin", "member"];
const PUBLISHER = ["owner", "admin"];
const VIEWS: CreatorView[] = ["home", "courses", "course", "learners", "analytics", "discussions", "emails", "team", "activity", "import", "settings", "learning"];
const REMEMBERED = "creator:school";

function remembered() {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(tenantId: string) {
  try {
    window.localStorage.setItem(REMEMBERED, tenantId);
  } catch {
    // Private windows can refuse storage; the choice still applies through the URL.
  }
}

/**
 * Creator once signed in. The school and the page live in the URL (`?workspace=…&view=…`), so
 * links from the account menu, invitations and the browser's back button all land correctly.
 */
export function CreatorWorkspace({ user, learnerCourses }: { user: { email: string; name: string }; learnerCourses: LearnerCourse[] }) {
  const { data, loading, error, refresh } = useAccount("creator");
  const searchParams = useSearchParams();
  const [stored, setStored] = useState<string | null>(null);
  const [refreshedFor, setRefreshedFor] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only memory of the last school
    setStored(remembered());
  }, []);

  const workspaces = useMemo(() => data?.workspaces ?? [], [data]);
  const requested = searchParams.get("workspace");
  const school = workspaces.find((entry) => entry.id === requested)
    ?? workspaces.find((entry) => entry.id === stored)
    ?? workspaces[0]
    ?? null;
  const requestedView = searchParams.get("view") as CreatorView | null;
  const view: CreatorView = requestedView && VIEWS.includes(requestedView) ? requestedView : school ? "home" : "learning";
  const courseId = searchParams.get("course");

  // Arriving from an invitation (?workspace=…) before the account list knows the new school.
  useEffect(() => {
    if (requested && data && !workspaces.some((entry) => entry.id === requested) && refreshedFor !== requested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one refresh per unknown school
      setRefreshedFor(requested);
      void refresh();
    }
  }, [requested, data, workspaces, refreshedFor, refresh]);

  useEffect(() => {
    if (school) remember(school.id);
  }, [school]);

  const navigate = useCallback((next: { view?: CreatorView; workspace?: string; course?: string | null }) => {
    const params = new URLSearchParams(window.location.search);
    if (next.workspace) params.set("workspace", next.workspace);
    if (next.view) params.set("view", next.view);
    if (next.course === null) params.delete("course");
    else if (next.course) params.set("course", next.course);
    if (next.view && next.view !== "course") params.delete("course");
    window.history.pushState(null, "", `?${params.toString()}`);
    window.scrollTo({ top: 0 });
  }, []);

  const switchSchool = useCallback((tenantId: string) => {
    remember(tenantId);
    setStored(tenantId);
    navigate({ workspace: tenantId, view: "home", course: null });
  }, [navigate]);

  return (
    <CreatorShell
      tenantId={school?.id ?? null}
      schoolName={school?.name ?? null}
      view={view}
      onNavigate={(next) => navigate({ view: next, workspace: school?.id })}
      onSwitchSchool={switchSchool}
    >
      {loading && !data ? (
        <div className="grid gap-6" aria-busy="true">
          <Skeleton className="h-10 w-72" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error && !data ? (
        <Alert variant="destructive"><CircleAlert /><AlertTitle>Your account couldn&apos;t be loaded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : view === "learning" || !school ? (
        <LearningView userName={data?.profile.name || user.name} learnerCourses={learnerCourses} hasSchool={Boolean(school)} onCreated={switchSchool} />
      ) : (
        <SchoolWorkspace
          key={school.id}
          tenantId={school.id}
          schoolName={school.name}
          role={school.role}
          userName={data?.profile.name || user.name}
          view={view}
          courseId={courseId}
          navigate={(next) => navigate({ ...next, workspace: school.id })}
          onLeft={() => {
            void refresh().then(() => navigate({ view: "home", course: null }));
          }}
        />
      )}
    </CreatorShell>
  );
}

export type SchoolNavigate = (next: { view?: CreatorView; course?: string | null }) => void;

function SchoolWorkspace({
  tenantId,
  schoolName,
  role,
  userName,
  view,
  courseId,
  navigate,
  onLeft,
}: {
  tenantId: string;
  schoolName: string;
  role: string;
  userName: string;
  view: CreatorView;
  courseId: string | null;
  navigate: SchoolNavigate;
  onLeft: () => void;
}) {
  const [courses, setCourses] = useState<CourseDoc[] | null>(null);
  const [people, setPeople] = useState<PeopleRecord>({});
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const canEdit = EDITOR.includes(role);
  const canPublish = PUBLISHER.includes(role);

  useEffect(() => {
    let active = true;
    apiJson<{ courses: CourseDoc[]; people: PeopleRecord }>(`/api/creator/tenants/${tenantId}/courses`)
      .then((result) => {
        if (!active) return;
        setCourses(result.courses);
        setPeople(result.people ?? {});
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Your courses couldn't be loaded.");
        setCourses([]);
      });
    return () => {
      active = false;
    };
  }, [tenantId, version]);

  const replaceCourse = (course: CourseDoc) => setCourses((current) => current?.map((entry) => (entry.id === course.id ? course : entry)) ?? null);
  const addCourse = (course: CourseDoc) => setCourses((current) => [course, ...(current ?? [])]);
  const list = courses ?? [];
  const selected = courseId ? list.find((course) => course.id === courseId) ?? null : null;

  return (
    <>
      {error ? (
        <Alert variant="destructive" className="mb-6"><CircleAlert /><AlertTitle>Something didn&apos;t load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      {view === "home" ? (
        <OverviewView tenantId={tenantId} schoolName={schoolName} userName={userName} courses={courses} canEdit={canEdit} navigate={navigate} onCreated={addCourse} />
      ) : null}

      {view === "courses" ? (
        <CoursesView tenantId={tenantId} courses={courses} people={people} canEdit={canEdit} navigate={navigate} onCreated={addCourse} />
      ) : null}

      {view === "course" ? (
        courses === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Opening the course…</p>
        ) : selected ? (
          <CourseEditor
            key={selected.id}
            tenantId={tenantId}
            course={selected}
            canEdit={canEdit}
            canPublish={canPublish}
            onBack={() => navigate({ view: "courses" })}
            onChange={replaceCourse}
            onDuplicated={(course) => {
              addCourse(course);
              navigate({ view: "course", course: course.id });
            }}
          />
        ) : (
          <>
            <PageHeader title="Course not found" back={{ label: "All courses", onClick: () => navigate({ view: "courses" }) }} description="It may have been removed, or it belongs to another school." />
          </>
        )
      ) : null}

      {view === "learners" ? <LearnersPanel tenantId={tenantId} courses={list} canManage={canPublish} /> : null}

      {view === "analytics" ? (
        <>
          <PageHeader title="Analytics" description="Enrollments, completion and quiz results, computed live from your learners' records. Nothing is sampled or estimated." />
          <AnalyticsPanel tenantId={tenantId} courses={list} />
        </>
      ) : null}

      {view === "discussions" ? (
        <>
          <PageHeader title="Discussions" description="What learners are saying under your lessons, newest first. Hide anything that doesn't belong; it's logged and you can restore it." />
          <DiscussionsModeration tenantId={tenantId} courses={list} canModerate={canEdit} />
        </>
      ) : null}

      {view === "emails" ? <LeadsPanel tenantId={tenantId} courses={list} canRemove={canPublish} /> : null}

      {view === "team" ? (
        <>
          <PageHeader title="Team" description="Everyone who helps run your school. Invite people by email, even if they don't have a Creator account yet." />
          <TeamPanel product="creator" productName="Creator" tenantId={tenantId} onLeft={onLeft} />
        </>
      ) : null}

      {view === "activity" ? <ActivityPanel tenantId={tenantId} courses={list} /> : null}

      {view === "import" ? (
        <>
          <PageHeader title="Import from Kajabi" description="Bring your courses over from a Kajabi export. You'll see everything before it's created, and each course arrives as a draft." />
          <ImportPanel tenantId={tenantId} canImport={canEdit} onImported={() => setVersion((current) => current + 1)} />
        </>
      ) : null}

      {view === "settings" ? <SettingsPanel tenantId={tenantId} schoolName={schoolName} canExport={canPublish} /> : null}
    </>
  );
}
