import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CoursePlayer } from "@/components/creator/course-player";
import { LessonBody } from "@/components/creator/lesson-body";
import { PublicChrome } from "@/components/creator/public-chrome";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { getLearnerView } from "@/lib/creator/store";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string; courseSlug: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Learn — SaaSassin Creator", robots: { index: false, follow: false } };

export default async function LearnPage({ params }: PageProps) {
  const { tenantId, courseSlug } = await params;
  const landing = `/apps/creator/c/${tenantId}/${courseSlug}`;
  const user = await getFleetUser(CREATOR_SLUG);
  if (!user) redirect(`/apps/creator/sign-in?next=${encodeURIComponent(`${landing}/learn`)}`);

  let view;
  try {
    view = await getLearnerView(tenantId, courseSlug, user);
  } catch (error) {
    if (error instanceof FleetError && error.status === 403) redirect(landing);
    if (error instanceof FleetError && error.status === 404) notFound();
    throw error;
  }

  const renderBody = Object.fromEntries(
    view.course.modules.flatMap((courseModule) => courseModule.lessons).filter((lesson) => lesson.unlocked).map((lesson) => [lesson.id, <LessonBody key={lesson.id} body={lesson.body} />]),
  );

  return (
    <PublicChrome
      schoolName={view.schoolName}
      right={<><Link className="text-sm underline" href={landing}>Course page</Link><Link className="text-sm underline" href="/apps/creator">My learning</Link></>}
    >
      <CoursePlayer
        tenantId={tenantId}
        courseSlug={courseSlug}
        courseTitle={view.course.title}
        modules={view.course.modules}
        enrolledAt={view.enrollment.enrolledAt}
        initialCompleted={view.enrollment.completedLessonIds}
        initialProgress={view.progress}
        initialQuizScores={view.enrollment.quizScores}
        renderBody={renderBody}
      />
    </PublicChrome>
  );
}
