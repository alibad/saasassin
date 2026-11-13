import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Clock3, ListChecks, PlayCircle, Sparkles } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { CourseCover } from "@/components/creator/course-cover";
import { EnrollPanel, LeadForm } from "@/components/creator/enroll-panel";
import { LessonBody } from "@/components/creator/lesson-body";
import { PublicChrome } from "@/components/creator/public-chrome";
import { CREATOR_SLUG, countLessons, formatPrice } from "@/lib/creator/model";
import { courseInstructor } from "@/lib/creator/people";
import { getEnrollment, getPublishedCourse, getSchoolName, publicOutline } from "@/lib/creator/store";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string; courseSlug: string }> };

export const dynamic = "force-dynamic";

async function load(tenantId: string, courseSlug: string) {
  try {
    const [course, schoolName] = await Promise.all([getPublishedCourse(tenantId, courseSlug), getSchoolName(tenantId)]);
    return { course, schoolName };
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) return null;
    if (error instanceof FleetError && error.status === 503) return "unavailable" as const;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId, courseSlug } = await params;
  const loaded = await load(tenantId, courseSlug).catch(() => null);
  if (!loaded || loaded === "unavailable") return { title: "Course", robots: { index: false } };
  return {
    title: `${loaded.course.title} — ${loaded.schoolName}`,
    description: loaded.course.subtitle || loaded.course.description.slice(0, 160),
    robots: { index: false, follow: false },
  };
}

/** A course's public page. Only published courses resolve; drafts are a 404. */
export default async function CourseLandingPage({ params }: PageProps) {
  const { tenantId, courseSlug } = await params;
  const loaded = await load(tenantId, courseSlug);
  if (!loaded) notFound();
  const path = `/apps/creator/c/${tenantId}/${courseSlug}`;
  const user = await getFleetUser(CREATOR_SLUG);

  if (loaded === "unavailable") {
    return (
      <PublicChrome schoolName="Course" signedIn={Boolean(user)} nextPath={path}>
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="brand-heading text-3xl">We&apos;ll be right back</h1>
          <p className="mt-2 text-muted-foreground">This course can&apos;t be reached for a moment. Nothing is lost; try again in a few minutes.</p>
        </div>
      </PublicChrome>
    );
  }

  const { course, schoolName } = loaded;
  const outline = publicOutline(course);
  const [enrollment, instructor] = await Promise.all([
    user ? getEnrollment(tenantId, course.id, user.uid) : Promise.resolve(null),
    courseInstructor(tenantId, course.createdBy).catch(() => null),
  ]);
  const lessons = countLessons(course.modules);
  const quizzes = outline.modules.reduce((total, courseModule) => total + courseModule.lessons.filter((lesson) => lesson.hasQuiz).length, 0);
  const videos = outline.modules.reduce((total, courseModule) => total + courseModule.lessons.filter((lesson) => lesson.hasVideo).length, 0);
  const longestDrip = Math.max(0, ...outline.modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => lesson.dripDays)));

  return (
    <PublicChrome schoolName={schoolName} tenantId={tenantId} signedIn={Boolean(user)} nextPath={path}>
      <section className="border-b border-border bg-brand-subtle">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-16">
          <div>
            <p className="text-sm font-medium text-primary">{schoolName}</p>
            <h1 className="brand-heading mt-3 text-5xl leading-[1.05] sm:text-6xl">{outline.title}</h1>
            {outline.subtitle ? <p className="mt-5 max-w-xl text-lg text-muted-foreground">{outline.subtitle}</p> : null}
            {instructor ? (
              <div className="mt-7 flex items-center gap-3">
                <UserAvatar person={{ uid: instructor.uid, name: instructor.name, photoURL: instructor.photoURL }} size="xl" className="size-12 ring-2 ring-card" />
                <div>
                  <p className="text-xs text-muted-foreground">Your instructor</p>
                  <p className="font-semibold">{instructor.name}{instructor.title ? <span className="font-normal text-muted-foreground"> · {instructor.title}</span> : null}</p>
                </div>
              </div>
            ) : null}
            <ul className="mt-8 flex flex-wrap gap-2 text-sm">
              <li className="rounded-full bg-card px-3 py-1.5 ring-1 ring-border">{course.modules.length} {course.modules.length === 1 ? "module" : "modules"} · {lessons} {lessons === 1 ? "lesson" : "lessons"}</li>
              {videos ? <li className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-border"><PlayCircle className="size-4 text-primary" aria-hidden="true" /> {videos} video {videos === 1 ? "lesson" : "lessons"}</li> : null}
              {quizzes ? <li className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-border"><ListChecks className="size-4 text-primary" aria-hidden="true" /> {quizzes} {quizzes === 1 ? "quiz" : "quizzes"}</li> : null}
              {longestDrip ? <li className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-border"><CalendarClock className="size-4 text-primary" aria-hidden="true" /> Released over {longestDrip} days</li> : null}
            </ul>
          </div>
          <CourseCover seed={course.id} title={course.title} className="aspect-[4/3] rounded-3xl shadow-[0_40px_80px_-40px_rgb(0_0_0/0.45)] ring-1 ring-border" />
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="grid min-w-0 content-start gap-12">
          {outline.description ? (
            <section>
              <h2 className="brand-heading text-3xl">About this course</h2>
              <div className="mt-4 text-[15px] leading-7"><LessonBody body={outline.description} /></div>
            </section>
          ) : null}
          <section>
            <h2 className="brand-heading text-3xl">What&apos;s inside</h2>
            <div className="mt-5 grid gap-4">
              {outline.modules.map((courseModule, index) => (
                <div key={courseModule.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
                  <div className="flex items-center gap-3 border-b border-border bg-brand-subtle px-5 py-3.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm text-primary-foreground">{index + 1}</span>
                    <p className="font-semibold">{courseModule.title}</p>
                    <span className="ml-auto text-xs text-muted-foreground">{courseModule.lessons.length} {courseModule.lessons.length === 1 ? "lesson" : "lessons"}</span>
                  </div>
                  <ol className="divide-y divide-border">
                    {courseModule.lessons.map((lesson) => (
                      <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                        {lesson.hasVideo ? <PlayCircle className="size-4 shrink-0 text-primary" aria-label="Video lesson" /> : <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">{lesson.title}</span>
                        {lesson.hasQuiz ? <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"><ListChecks className="size-3" aria-hidden="true" /> Quiz</span> : null}
                        {lesson.dripDays > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"><Clock3 className="size-3" aria-hidden="true" /> Day {lesson.dripDays}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        </article>
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl bg-card shadow-[0_30px_60px_-36px_rgb(0_0_0/0.4)] ring-1 ring-border">
            <div className="p-6">
              <EnrollPanel
                tenantId={tenantId}
                courseSlug={courseSlug}
                priceLabel={formatPrice(course.pricing)}
                paid={course.pricing.type === "paid"}
                signedIn={Boolean(user)}
                enrolled={enrollment?.status === "active"}
                revoked={enrollment?.status === "revoked"}
              />
            </div>
            <div className="border-t border-border bg-brand-subtle p-6">
              <LeadForm tenantId={tenantId} courseSlug={courseSlug} />
            </div>
          </div>
        </aside>
      </div>
    </PublicChrome>
  );
}
