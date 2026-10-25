import { calculateProgress, orderedLessons, type CourseModule } from "./model";

/**
 * Course analytics computed only from real enrollment records. Definitions are explicit so the
 * numbers can be checked by hand:
 * - enrollments over time: enrollments per UTC day, with a running total;
 * - completion funnel: for each lesson in curriculum order, learners who marked it complete;
 * - drop-off lesson: the lesson with the largest fall in completions versus the step before it
 *   (the first lesson is compared with total enrollments);
 * - quiz pass rate: learners whose latest attempt passed ÷ learners who attempted.
 */

export type AnalyticsEnrollment = {
  enrolledAt: string;
  completedLessonIds: string[];
  quizScores: Record<string, { passed: boolean; percent: number }>;
  status?: "active" | "revoked";
};

export function courseAnalytics(modules: CourseModule[], enrollments: AnalyticsEnrollment[]) {
  const lessons = orderedLessons(modules);
  const total = enrollments.length;

  const perDay = new Map<string, number>();
  for (const enrollment of enrollments) {
    const day = enrollment.enrolledAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  let running = 0;
  const overTime = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      running += count;
      return { date, count, cumulative: running };
    });

  const funnel = lessons.map((lesson) => {
    const completed = enrollments.filter((enrollment) => enrollment.completedLessonIds.includes(lesson.id)).length;
    return { lessonId: lesson.id, title: lesson.title, moduleTitle: lesson.moduleTitle, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
  });

  let dropOff: { lessonId: string; title: string; lost: number } | null = null;
  funnel.forEach((step, index) => {
    const previous = index === 0 ? total : funnel[index - 1].completed;
    const lost = previous - step.completed;
    if (lost > 0 && (!dropOff || lost > dropOff.lost)) dropOff = { lessonId: step.lessonId, title: step.title, lost };
  });

  const quizzes = lessons
    .filter((lesson) => lesson.quiz && lesson.quiz.questions.length > 0)
    .map((lesson) => {
      const attempts = enrollments.map((enrollment) => enrollment.quizScores?.[lesson.id]).filter(Boolean) as Array<{ passed: boolean; percent: number }>;
      const passed = attempts.filter((attempt) => attempt.passed).length;
      const averagePercent = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.percent, 0) / attempts.length) : null;
      return { lessonId: lesson.id, title: lesson.title, attempts: attempts.length, passed, passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : null, averagePercent };
    });

  const completedCourse = enrollments.filter((enrollment) => calculateProgress(modules, enrollment.completedLessonIds).isComplete).length;

  return {
    enrollments: total,
    active: enrollments.filter((enrollment) => enrollment.status !== "revoked").length,
    completedCourse,
    completionRate: total ? Math.round((completedCourse / total) * 100) : 0,
    overTime,
    funnel,
    dropOff: dropOff as { lessonId: string; title: string; lost: number } | null,
    quizzes,
  };
}

export type CourseAnalytics = ReturnType<typeof courseAnalytics>;
