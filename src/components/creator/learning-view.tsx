"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Plus, School } from "lucide-react";

import { CreateWorkspaceDialog } from "@/components/account/workspace-switcher";
import { Button } from "@/components/ui/button";

import { formatDate } from "./client";
import { CourseCover } from "./course-cover";
import { firstName } from "./school-data";
import { PageHeader } from "./shell";

export type LearnerCourse = { id: string; tenantId: string; courseSlug: string; courseTitle: string; schoolName: string; enrolledAt: string };

/**
 * The learner's library: every course they joined, in any school. People without a school of
 * their own land here too, with an invitation to start one.
 */
export function LearningView({
  userName,
  learnerCourses,
  hasSchool,
  onCreated,
}: {
  userName: string;
  learnerCourses: LearnerCourse[];
  hasSchool: boolean;
  onCreated: (tenantId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const name = firstName(userName);

  return (
    <>
      <PageHeader
        title={hasSchool ? "My learning" : name ? `Welcome, ${name}` : "Welcome to Creator"}
        description={hasSchool ? "Courses you joined as a learner, in any school." : "Pick up a course you joined, or open a school of your own and start teaching."}
      />

      <div className="flex flex-col">
      {!hasSchool ? (
        // People who are already learning see their courses first and this invitation after.
        <section className={`relative overflow-hidden rounded-3xl bg-brand-ink px-6 py-8 text-brand-ink-foreground sm:px-10 sm:py-10 ${learnerCourses.length ? "order-last mt-12" : "mb-10"}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_100%_0%,color-mix(in_oklab,var(--chart-1)_55%,transparent)_0%,transparent_70%),radial-gradient(50%_80%_at_85%_110%,color-mix(in_oklab,var(--brand-accent)_45%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
          <div className="relative max-w-xl">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10"><School className="size-6 text-brand-accent" aria-hidden="true" /></span>
            <h2 className="brand-heading mt-5 text-3xl leading-tight sm:text-4xl">Teach what you know</h2>
            <p className="mt-3 text-brand-ink-foreground/80">
              A school holds your courses, learners, email list and team. Build lessons with video, text and quizzes, publish a page people can enroll from, and take everything with you whenever you like.
            </p>
            <Button size="lg" className="mt-6 rounded-xl bg-brand-accent text-brand-accent-foreground hover:bg-brand-accent/90" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> Create your school
            </Button>
          </div>
        </section>
      ) : null}

      {learnerCourses.length ? (
        <section className="grid gap-4">
          {!hasSchool ? <h2 className="brand-heading text-2xl">Continue learning</h2> : null}
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {learnerCourses.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/apps/creator/c/${entry.tenantId}/${entry.courseSlug}/learn`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary/40"
                >
                  <CourseCover seed={entry.id.split("_").slice(-1)[0] ?? entry.id} title={entry.courseTitle} className="aspect-[16/9]" />
                  <div className="flex flex-1 flex-col gap-1 p-5">
                    <p className="text-xs font-medium text-primary">{entry.schoolName}</p>
                    <h3 className="brand-heading text-xl leading-snug">{entry.courseTitle}</h3>
                    <p className="text-xs text-muted-foreground">Joined {formatDate(entry.enrolledAt)}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-primary">
                      Continue <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><BookOpen className="size-5" aria-hidden="true" /></span>
          <h2 className="brand-heading mt-4 text-xl">Your library is ready for its first course</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">When you enroll in a course from a school&apos;s page, it appears here so you can pick up exactly where you left off.</p>
        </div>
      )}
      </div>

      <CreateWorkspaceDialog
        product="creator"
        open={creating}
        onOpenChange={setCreating}
        title="Create your school"
        label="School name"
        onCreated={(tenantId) => {
          setCreating(false);
          onCreated(tenantId);
        }}
      />
    </>
  );
}
