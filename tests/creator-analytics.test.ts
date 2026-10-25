import { describe, expect, it } from "vitest";

import { courseAnalytics, type AnalyticsEnrollment } from "../src/lib/creator/analytics";
import type { CourseModule } from "../src/lib/creator/model";

const lesson = (id: string, quiz = false) => ({
  id,
  title: id.toUpperCase(),
  body: "",
  videoUrl: "",
  dripDays: 0,
  quiz: quiz ? { passPercent: 50, questions: [{ id: "q", prompt: "?", options: ["a", "b"], correctIndex: 0 }] } : null,
});

const modules: CourseModule[] = [{ id: "m", title: "M", lessons: [lesson("l1", true), lesson("l2"), lesson("l3")] }];

const enrollments: AnalyticsEnrollment[] = [
  { enrolledAt: "2026-10-01T09:00:00.000Z", completedLessonIds: ["l1", "l2", "l3"], quizScores: { l1: { passed: true, percent: 100 } } },
  { enrolledAt: "2026-10-01T18:00:00.000Z", completedLessonIds: ["l1", "l2"], quizScores: { l1: { passed: false, percent: 0 } } },
  { enrolledAt: "2026-10-03T10:00:00.000Z", completedLessonIds: ["l1"], quizScores: {} },
  { enrolledAt: "2026-10-04T10:00:00.000Z", completedLessonIds: [], quizScores: {}, status: "revoked" },
];

describe("course analytics", () => {
  const result = courseAnalytics(modules, enrollments);

  it("buckets enrollments per day with a running total", () => {
    expect(result.overTime).toEqual([
      { date: "2026-10-01", count: 2, cumulative: 2 },
      { date: "2026-10-03", count: 1, cumulative: 3 },
      { date: "2026-10-04", count: 1, cumulative: 4 },
    ]);
    expect(result.active).toBe(3);
  });

  it("builds the completion funnel in curriculum order", () => {
    expect(result.funnel.map((step) => [step.lessonId, step.completed, step.percent])).toEqual([["l1", 3, 75], ["l2", 2, 50], ["l3", 1, 25]]);
    expect(result.completedCourse).toBe(1);
    expect(result.completionRate).toBe(25);
  });

  it("finds the drop-off lesson (ties go to the earliest)", () => {
    expect(result.dropOff).toEqual({ lessonId: "l1", title: "L1", lost: 1 });
    const steep = courseAnalytics(modules, [enrollments[0], { ...enrollments[1], completedLessonIds: ["l1"] }, { ...enrollments[2] }]);
    expect(steep.dropOff).toMatchObject({ lessonId: "l2", lost: 2 });
  });

  it("computes quiz pass rates from attempts only", () => {
    expect(result.quizzes).toEqual([{ lessonId: "l1", title: "L1", attempts: 2, passed: 1, passRate: 50, averagePercent: 50 }]);
  });

  it("handles a course with no enrollments", () => {
    const empty = courseAnalytics(modules, []);
    expect(empty).toMatchObject({ enrollments: 0, completionRate: 0, dropOff: null });
    expect(empty.quizzes[0].passRate).toBeNull();
  });
});
