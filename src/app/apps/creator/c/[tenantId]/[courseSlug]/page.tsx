import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, ListChecks, PlayCircle } from "lucide-react";

import { EnrollPanel, LeadForm } from "@/components/creator/enroll-panel";
import { LessonBody } from "@/components/creator/lesson-body";
import { PublicChrome } from "@/components/creator/public-chrome";
import { Badge } from "@/components/ui/badge";
import { CREATOR_SLUG, countLessons, formatPrice } from "@/lib/creator/model";
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
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId, courseSlug } = await params;
  const loaded = await load(tenantId, courseSlug).catch(() => null);
  if (!loaded) return { title: "Course not found", robots: { index: false } };
  return {
    title: `${loaded.course.title} — ${loaded.schoolName}`,
    description: loaded.course.subtitle || loaded.course.description.slice(0, 160),
    robots: { index: false, follow: false },
  };
}

/** Public, unauthenticated landing page. Only published courses resolve; drafts 404. */
export default async function CourseLandingPage({ params }: PageProps) {
  const { tenantId, courseSlug } = await params;
  const loaded = await load(tenantId, courseSlug);
  if (!loaded) notFound();
  const { course, schoolName } = loaded;
  const outline = publicOutline(course);
  const user = await getFleetUser(CREATOR_SLUG);
  const enrollment = user ? await getEnrollment(tenantId, course.id, user.uid) : null;

  return (
    <PublicChrome
      schoolName={schoolName}
      right={user ? <span className="text-sm text-neutral-600">{user.email}</span> : <Link className="text-sm underline" href={`/apps/creator/sign-in?next=${encodeURIComponent(`/apps/creator/c/${tenantId}/${courseSlug}`)}`}>Sign in</Link>}
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <article className="space-y-6">
          <div className="space-y-3">
            <Badge variant="outline">{countLessons(course.modules)} lessons · {course.modules.length} modules</Badge>
            <h1 className="text-4xl font-bold leading-tight">{outline.title}</h1>
            {outline.subtitle && <p className="text-lg text-neutral-700">{outline.subtitle}</p>}
          </div>
          {outline.description && <LessonBody body={outline.description} />}
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Curriculum</h2>
            {outline.modules.map((courseModule, index) => (
              <div key={courseModule.id} className="border-2 border-neutral-900 bg-white shadow-[4px_4px_0_0_#171717]">
                <p className="border-b-2 border-neutral-900 px-4 py-2 font-semibold">Module {index + 1}: {courseModule.title}</p>
                <ol className="divide-y divide-neutral-200">
                  {courseModule.lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                      <span className="flex-1">{lesson.title}</span>
                      {lesson.hasVideo && <PlayCircle className="size-4 text-neutral-500" aria-label="Video lesson" />}
                      {lesson.hasQuiz && <ListChecks className="size-4 text-neutral-500" aria-label="Has a quiz" />}
                      {lesson.dripDays > 0 && <span className="flex items-center gap-1 text-xs text-neutral-500"><Clock3 className="size-3" aria-hidden="true" /> Unlocks day {lesson.dripDays}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </article>
        <aside className="h-fit space-y-6 border-2 border-neutral-900 bg-white p-4 shadow-[4px_4px_0_0_#ff3d93] lg:sticky lg:top-4">
          <EnrollPanel
            tenantId={tenantId}
            courseSlug={courseSlug}
            priceLabel={formatPrice(course.pricing)}
            paid={course.pricing.type === "paid"}
            signedIn={Boolean(user)}
            enrolled={Boolean(enrollment)}
          />
          <LeadForm tenantId={tenantId} courseSlug={courseSlug} />
        </aside>
      </div>
    </PublicChrome>
  );
}
