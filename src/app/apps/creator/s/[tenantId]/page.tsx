import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";

import { CourseCover } from "@/components/creator/course-cover";
import { PublicChrome } from "@/components/creator/public-chrome";
import { CREATOR_SLUG, formatPrice } from "@/lib/creator/model";
import { getSchoolName, listPublishedCourses } from "@/lib/creator/store";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string }> };

export const dynamic = "force-dynamic";

async function load(tenantId: string) {
  try {
    const [schoolName, courses] = await Promise.all([getSchoolName(tenantId), listPublishedCourses(tenantId)]);
    return { schoolName, courses };
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) return null;
    if (error instanceof FleetError && error.status === 503) return "unavailable" as const;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId } = await params;
  const loaded = await load(tenantId).catch(() => null);
  return {
    title: loaded && loaded !== "unavailable" ? `Courses by ${loaded.schoolName}` : "School",
    robots: { index: false, follow: false },
  };
}

/** A school's public catalog: every published course, as learners first meet it. */
export default async function SchoolCatalogPage({ params }: PageProps) {
  const { tenantId } = await params;
  const loaded = await load(tenantId);
  if (!loaded) notFound();
  const user = await getFleetUser(CREATOR_SLUG);
  const path = `/apps/creator/s/${tenantId}`;

  if (loaded === "unavailable") {
    return (
      <PublicChrome schoolName="Courses" signedIn={Boolean(user)} nextPath={path}>
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="brand-heading text-3xl">We&apos;ll be right back</h1>
          <p className="mt-2 text-muted-foreground">The catalog can&apos;t be reached for a moment. Nothing is lost; try again in a few minutes.</p>
        </div>
      </PublicChrome>
    );
  }

  const { schoolName, courses } = loaded;
  return (
    <PublicChrome schoolName={schoolName} tenantId={tenantId} signedIn={Boolean(user)} nextPath={path}>
      <section className="relative overflow-hidden border-b border-border bg-brand-subtle">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_90%_0%,color-mix(in_oklab,var(--chart-1)_22%,transparent)_0%,transparent_70%),radial-gradient(40%_70%_at_0%_100%,color-mix(in_oklab,var(--brand-accent)_35%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-medium text-primary">{courses.length} {courses.length === 1 ? "course" : "courses"}</p>
          <h1 className="brand-heading mt-3 max-w-3xl text-5xl leading-[1.05] sm:text-6xl">Learn with {schoolName}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">Pick a course, enroll in a minute, and go at your own pace. Your progress is saved as you learn.</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {courses.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-20 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><BookOpen className="size-6" aria-hidden="true" /></span>
            <h2 className="brand-heading mt-4 text-2xl">New courses are on the way</h2>
            <p className="mt-2 max-w-md text-muted-foreground">{schoolName} hasn&apos;t published a course yet. Check back soon.</p>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const lessons = course.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);
              return (
                <li key={course.id}>
                  <Link
                    href={`/apps/creator/c/${tenantId}/${course.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border transition hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgb(0_0_0/0.4)] hover:ring-primary/40"
                  >
                    <CourseCover seed={course.id} title={course.title} className="aspect-[16/10]" />
                    <div className="flex flex-1 flex-col gap-2 p-6">
                      <h2 className="brand-heading text-2xl leading-snug group-hover:text-primary">{course.title}</h2>
                      {course.subtitle ? <p className="line-clamp-3 text-sm text-muted-foreground">{course.subtitle}</p> : null}
                      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
                        <span className="text-muted-foreground">{lessons} {lessons === 1 ? "lesson" : "lessons"} · <span className="font-semibold text-foreground">{formatPrice(course.pricing)}</span></span>
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">View <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" /></span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicChrome>
  );
}
