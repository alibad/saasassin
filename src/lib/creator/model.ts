import { z } from "zod";

/**
 * SaaSassin Creator domain model. Pure and framework-free so it can be unit-tested.
 *
 * Firestore layout (server-only, below products/creator/tenants/{tenantId}):
 *   courses/{courseId}        course + embedded ordered modules/lessons/quizzes
 *   enrollments/{courseId_uid} learner progress, quiz scores, completion
 *   leads/{leadId}            email-list capture from public landing pages
 */

export const CREATOR_SLUG = "creator";
export const EXPORT_SCHEMA_VERSION = "1.0.0";

// ---------- Course state machine ----------

export const COURSE_STATES = ["draft", "published", "archived"] as const;
export type CourseState = (typeof COURSE_STATES)[number];

export const COURSE_STATE_LABELS: Record<CourseState, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const COURSE_TRANSITIONS: Record<CourseState, CourseState[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export function allowedCourseTransitions(from: CourseState): CourseState[] {
  return COURSE_TRANSITIONS[from] ?? [];
}

export function canTransitionCourse(from: CourseState, to: CourseState) {
  return allowedCourseTransitions(from).includes(to);
}

/** Returns blocking reasons; an empty array means the transition may proceed. */
export function courseTransitionProblems(course: Pick<CourseDoc, "status" | "title" | "modules">, to: CourseState) {
  const problems: string[] = [];
  if (!canTransitionCourse(course.status, to)) {
    problems.push(`A ${COURSE_STATE_LABELS[course.status].toLowerCase()} course cannot move to ${COURSE_STATE_LABELS[to].toLowerCase()}.`);
    return problems;
  }
  if (to === "published") {
    if (!course.title.trim()) problems.push("Give the course a title.");
    if (countLessons(course.modules) === 0) problems.push("Add at least one lesson before publishing.");
    for (const courseModule of course.modules) {
      if (courseModule.lessons.length === 0) problems.push(`Module “${courseModule.title}” has no lessons.`);
    }
  }
  return problems;
}

// ---------- Slugs ----------

export function slugify(input: string) {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "course";
}

/** Picks the first free slug: base, base-2, base-3, ... */
export function uniqueSlug(input: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const base = slugify(input);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Could not find a free slug.");
}

// ---------- Curriculum ----------

export const quizQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  prompt: z.string().trim().min(1, "Every quiz question needs a prompt.").max(500),
  options: z.array(z.string().trim().min(1, "Quiz options cannot be empty.").max(200)).min(2, "Give each question at least two options.").max(6),
  correctIndex: z.number().int().min(0),
});

export const quizSchema = z.object({
  passPercent: z.number().int().min(0).max(100).default(70),
  questions: z.array(quizQuestionSchema).max(20),
}).refine((quiz) => quiz.questions.every((question) => question.correctIndex < question.options.length), {
  message: "Each quiz question must mark a correct option.",
});

export const lessonSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, "Every lesson needs a title.").max(140),
  body: z.string().max(20_000).default(""),
  videoUrl: z.union([z.literal(""), z.url("Video links must be full https URLs.").startsWith("https://", "Video links must use https.")]).default(""),
  dripDays: z.number().int().min(0).max(365).default(0),
  quiz: quizSchema.nullable().default(null),
});

export const moduleSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, "Every module needs a title.").max(140),
  lessons: z.array(lessonSchema).max(100),
});

export const pricingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("free") }),
  z.object({
    type: z.literal("paid"),
    amountCents: z.number().int().min(100, "Paid offers must be at least 1.00.").max(10_000_000),
    currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]),
  }),
]);

export const courseInputSchema = z.object({
  title: z.string().trim().min(2, "Give the course a title.").max(140),
  subtitle: z.string().trim().max(240).default(""),
  description: z.string().max(5_000).default(""),
  pricing: pricingSchema.default({ type: "free" }),
  modules: z.array(moduleSchema).max(50).default([]),
});

export const createCourseSchema = z.object({
  title: z.string().trim().min(2, "Give the course a title.").max(140),
});

export const transitionSchema = z.object({ to: z.enum(COURSE_STATES) });

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type CourseModule = z.infer<typeof moduleSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export type CourseInput = z.infer<typeof courseInputSchema>;

export type CourseDoc = CourseInput & {
  id: string;
  slug: string;
  status: CourseState;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
};

export type EnrollmentDoc = {
  id: string;
  courseId: string;
  uid: string;
  email: string;
  name: string;
  enrolledAt: string;
  completedLessonIds: string[];
  quizScores: Record<string, { correct: number; total: number; percent: number; passed: boolean; submittedAt: string }>;
  completedAt: string | null;
  source: "free";
  /** Access can be revoked by the school without losing progress history. */
  status: "active" | "revoked";
  revokedAt: string | null;
};

export const enrollmentAccessSchema = z.object({ status: z.enum(["active", "revoked"]) });

export const commentInputSchema = z.object({
  lessonId: z.string().min(1).max(40),
  body: z.string().trim().min(1, "Write a comment first.").max(2_000, "Keep comments under 2,000 characters."),
});

export const commentModerationSchema = z.object({ hidden: z.boolean() });

export type CommentDoc = {
  id: string;
  courseId: string;
  lessonId: string;
  uid: string;
  name: string;
  body: string;
  createdAt: string;
  hidden: boolean;
  hiddenBy: string | null;
  hiddenAt: string | null;
};

/** Accepts commas, semicolons, spaces or new lines; dedupes case-insensitively. */
export function parseEmailList(input: string) {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,;]+/)) {
    const email = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) valid.push(email);
    else invalid.push(raw.trim());
  }
  return { valid, invalid };
}

export const bulkEnrollSchema = z.object({
  emails: z.string().min(3, "Paste at least one email address.").max(50_000),
});

export type LeadDoc = {
  id: string;
  email: string;
  courseId: string;
  courseSlug: string;
  consent: boolean;
  createdAt: string;
};

export function countLessons(modules: CourseModule[]) {
  return modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);
}

export function orderedLessons(modules: CourseModule[]) {
  return modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => ({ ...lesson, moduleId: courseModule.id, moduleTitle: courseModule.title })));
}

/** Moves an item one step; returns a new array and leaves out-of-range moves unchanged. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function newId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** Duplicate ids would corrupt progress tracking, so reject them at the boundary. */
export function curriculumProblems(modules: CourseModule[]) {
  const problems: string[] = [];
  const moduleIds = new Set<string>();
  const lessonIds = new Set<string>();
  for (const courseModule of modules) {
    if (moduleIds.has(courseModule.id)) problems.push(`Duplicate module id ${courseModule.id}.`);
    moduleIds.add(courseModule.id);
    for (const lesson of courseModule.lessons) {
      if (lessonIds.has(lesson.id)) problems.push(`Duplicate lesson id ${lesson.id}.`);
      lessonIds.add(lesson.id);
    }
  }
  return problems;
}

// ---------- Progress ----------

export type ProgressSummary = {
  completed: number;
  total: number;
  percent: number;
  isComplete: boolean;
};

/** Only lessons that still exist count; deleted lessons never inflate progress. */
export function calculateProgress(modules: CourseModule[], completedLessonIds: string[]): ProgressSummary {
  const lessonIds = new Set(orderedLessons(modules).map((lesson) => lesson.id));
  const completed = new Set(completedLessonIds.filter((id) => lessonIds.has(id))).size;
  const total = lessonIds.size;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent, isComplete: total > 0 && completed === total };
}

// ---------- Drip ----------

const DAY_MS = 24 * 60 * 60 * 1000;

export function lessonUnlockAt(enrolledAt: string, dripDays: number) {
  return new Date(new Date(enrolledAt).getTime() + Math.max(0, dripDays) * DAY_MS);
}

export function isLessonUnlocked(enrolledAt: string, dripDays: number, now: Date = new Date()) {
  if (!dripDays || dripDays <= 0) return true;
  return now.getTime() >= lessonUnlockAt(enrolledAt, dripDays).getTime();
}

// ---------- Quizzes ----------

export function scoreQuiz(quiz: Quiz, answers: Record<string, number>) {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((question) => answers[question.id] === question.correctIndex).length;
  const percent = total === 0 ? 100 : Math.round((correct / total) * 100);
  return { correct, total, percent, passed: percent >= quiz.passPercent };
}

/** The learner never receives correct answers. */
export function publicQuiz(quiz: Quiz | null) {
  if (!quiz) return null;
  return {
    passPercent: quiz.passPercent,
    questions: quiz.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
  };
}

// ---------- Video embeds ----------

/** Turns common video share links into an embeddable https URL; unknown hosts are returned as null. */
export function toEmbedUrl(url: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = parsed.pathname.match(/^\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return url;
  if (host === "loom.com") {
    const id = parsed.pathname.match(/^\/(?:share|embed)\/([\w-]+)/)?.[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  return null;
}

// ---------- Pricing ----------

export function formatPrice(pricing: Pricing) {
  if (pricing.type === "free") return "Free";
  return new Intl.NumberFormat("en", { style: "currency", currency: pricing.currency }).format(pricing.amountCents / 100);
}

// ---------- Leads ----------

export const leadSchema = z.object({
  email: z.email("Enter a valid email address.").max(200).transform((value) => value.trim().toLowerCase()),
  consent: z.literal(true, "Confirm you want to hear from this school."),
});

export const progressSchema = z.object({
  lessonId: z.string().min(1).max(40),
  complete: z.boolean(),
});

export const quizSubmissionSchema = z.object({
  lessonId: z.string().min(1).max(40),
  answers: z.record(z.string(), z.number().int().min(0).max(10)),
});

export const memberInviteSchema = z.object({
  email: z.email("Enter a valid email address."),
  role: z.enum(["admin", "member", "viewer"]),
});

export function enrollmentId(courseId: string, uid: string) {
  return `${courseId}_${uid}`;
}
