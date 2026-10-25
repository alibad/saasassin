import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";

import { PublicChrome } from "@/components/creator/public-chrome";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/creator/model";
import { getSchoolName, listPublishedCourses } from "@/lib/creator/store";
import { FleetError } from "@/lib/fleet/platform/session";

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
    title: loaded && loaded !== "unavailable" ? `${loaded.schoolName} — courses` : "School",
    robots: { index: false, follow: false },
  };
}

/** Public, unauthenticated catalog of a school's published courses. */
export default async function SchoolCatalogPage({ params }: PageProps) {
  const { tenantId } = await params;
  const loaded = await load(tenantId);
  if (!loaded) notFound();
  if (loaded === "unavailable") {
    return (
      <PublicChrome schoolName="Creator school">
        <p className="border-2 border-neutral-900 bg-white p-8">The course catalog is temporarily unavailable. Try again in a few minutes.</p>
      </PublicChrome>
    );
  }

  return (
    <PublicChrome schoolName={loaded.schoolName}>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Course catalog</p>
          <h1 className="text-4xl font-bold">{loaded.schoolName}</h1>
        </div>
        {loaded.courses.length === 0 ? (
          <p className="border-2 border-dashed border-neutral-400 p-8 text-neutral-600">No courses are published yet. Check back soon.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {loaded.courses.map((course) => {
              const lessons = course.modules.reduce((n, courseModule) => n + courseModule.lessons.length, 0);
              return (
                <li key={course.id}>
                  <Link href={`/apps/creator/c/${tenantId}/${course.slug}`} className="group flex h-full flex-col gap-3 border-2 border-neutral-900 bg-white p-5 shadow-[4px_4px_0_0_#171717] transition hover:shadow-[4px_4px_0_0_#ff3d93]">
                    <BookOpen className="size-6 text-[#ff3d93]" aria-hidden="true" />
                    <h2 className="text-xl font-bold">{course.title}</h2>
                    {course.subtitle && <p className="text-neutral-700">{course.subtitle}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{formatPrice(course.pricing)}</Badge>
                      <Badge variant="outline">{lessons} lessons</Badge>
                      <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold group-hover:underline">View course <ArrowRight className="size-4" aria-hidden="true" /></span>
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
