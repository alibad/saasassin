import { describe, expect, it } from "vitest";

import {
  allowedCourseTransitions,
  calculateProgress,
  canTransitionCourse,
  courseInputSchema,
  courseTransitionProblems,
  curriculumProblems,
  isLessonUnlocked,
  leadSchema,
  lessonUnlockAt,
  moveItem,
  publicQuiz,
  scoreQuiz,
  slugify,
  toEmbedUrl,
  uniqueSlug,
  type CourseModule,
  type Quiz,
} from "../src/lib/creator/model";

const lesson = (id: string, extra: Partial<CourseModule["lessons"][number]> = {}) => ({
  id,
  title: `Lesson ${id}`,
  body: "",
  videoUrl: "",
  dripDays: 0,
  quiz: null,
  ...extra,
});

const modules: CourseModule[] = [
  { id: "m1", title: "Start", lessons: [lesson("l1"), lesson("l2")] },
  { id: "m2", title: "Go deeper", lessons: [lesson("l3"), lesson("l4", { dripDays: 7 })] },
];

describe("course state machine", () => {
  it("allows draft -> published -> draft and archive/restore", () => {
    expect(allowedCourseTransitions("draft")).toEqual(["published", "archived"]);
    expect(canTransitionCourse("published", "draft")).toBe(true);
    expect(canTransitionCourse("archived", "draft")).toBe(true);
  });

  it("rejects archived -> published and no-op transitions", () => {
    expect(canTransitionCourse("archived", "published")).toBe(false);
    expect(canTransitionCourse("draft", "draft")).toBe(false);
    expect(courseTransitionProblems({ status: "archived", title: "X", modules }, "published")[0]).toMatch(/cannot move/);
  });

  it("blocks publishing an empty course or an empty module", () => {
    expect(courseTransitionProblems({ status: "draft", title: "X", modules: [] }, "published")).toContain("Add at least one lesson before publishing.");
    const withEmpty = [...modules, { id: "m3", title: "Empty", lessons: [] }];
    expect(courseTransitionProblems({ status: "draft", title: "X", modules: withEmpty }, "published").join(" ")).toMatch(/Empty/);
    expect(courseTransitionProblems({ status: "draft", title: "X", modules }, "published")).toEqual([]);
  });
});

describe("slugs", () => {
  it("normalizes titles into url-safe slugs", () => {
    expect(slugify("  Créer & Grow: Your First 100 Students!  ")).toBe("creer-and-grow-your-first-100-students");
    expect(slugify("!!!")).toBe("course");
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it("suffixes taken slugs", () => {
    expect(uniqueSlug("Intro", [])).toBe("intro");
    expect(uniqueSlug("Intro", ["intro"])).toBe("intro-2");
    expect(uniqueSlug("Intro", ["intro", "intro-2", "intro-3"])).toBe("intro-4");
  });
});

describe("progress", () => {
  it("counts only lessons that still exist and dedupes", () => {
    expect(calculateProgress(modules, ["l1", "l1", "deleted"])).toEqual({ completed: 1, total: 4, percent: 25, isComplete: false });
  });

  it("is complete only when every lesson is complete", () => {
    expect(calculateProgress(modules, ["l1", "l2", "l3", "l4"]).isComplete).toBe(true);
    expect(calculateProgress([], []).isComplete).toBe(false);
    expect(calculateProgress([], []).percent).toBe(0);
  });
});

describe("drip unlocking", () => {
  const enrolledAt = "2026-10-01T00:00:00.000Z";

  it("unlocks immediately when dripDays is 0", () => {
    expect(isLessonUnlocked(enrolledAt, 0, new Date("2026-10-01T00:00:00.000Z"))).toBe(true);
  });

  it("unlocks exactly N days after enrollment", () => {
    expect(lessonUnlockAt(enrolledAt, 7).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(isLessonUnlocked(enrolledAt, 7, new Date("2026-10-07T23:59:59.000Z"))).toBe(false);
    expect(isLessonUnlocked(enrolledAt, 7, new Date("2026-10-08T00:00:00.000Z"))).toBe(true);
  });
});

describe("quizzes", () => {
  const quiz: Quiz = {
    passPercent: 70,
    questions: [
      { id: "q1", prompt: "1+1", options: ["1", "2"], correctIndex: 1 },
      { id: "q2", prompt: "2+2", options: ["4", "5"], correctIndex: 0 },
      { id: "q3", prompt: "3+3", options: ["6", "7"], correctIndex: 0 },
    ],
  };

  it("scores and applies the pass mark", () => {
    expect(scoreQuiz(quiz, { q1: 1, q2: 0, q3: 0 })).toEqual({ correct: 3, total: 3, percent: 100, passed: true });
    expect(scoreQuiz(quiz, { q1: 1, q2: 1 })).toEqual({ correct: 1, total: 3, percent: 33, passed: false });
  });

  it("never exposes correct answers to learners", () => {
    expect(JSON.stringify(publicQuiz(quiz))).not.toContain("correctIndex");
  });
});

describe("validation and helpers", () => {
  it("rejects non-https video links and accepts empty", () => {
    expect(courseInputSchema.safeParse({ title: "Course", modules: [{ id: "m", title: "M", lessons: [{ id: "l", title: "L", videoUrl: "http://x.com" }] }] }).success).toBe(false);
    expect(courseInputSchema.safeParse({ title: "Course", modules: [{ id: "m", title: "M", lessons: [{ id: "l", title: "L", videoUrl: "" }] }] }).success).toBe(true);
  });

  it("converts known video links into embeds", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(toEmbedUrl("https://evil.example.com/video")).toBeNull();
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
  });

  it("reorders lessons and detects duplicate ids", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(curriculumProblems([{ id: "m", title: "M", lessons: [lesson("x"), lesson("x")] }])).toHaveLength(1);
  });

  it("requires consent for leads and normalizes email", () => {
    expect(leadSchema.safeParse({ email: "A@B.co", consent: false }).success).toBe(false);
    expect(leadSchema.parse({ email: "Ann@Example.com", consent: true }).email).toBe("ann@example.com");
  });
});
