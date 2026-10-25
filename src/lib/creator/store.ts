import "server-only";

import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, db, tenantCollection, tenantRef } from "@/lib/fleet/platform/tenants";

import {
  CREATOR_SLUG,
  calculateProgress,
  courseInputSchema,
  courseTransitionProblems,
  curriculumProblems,
  enrollmentId,
  isLessonUnlocked,
  orderedLessons,
  publicQuiz,
  scoreQuiz,
  uniqueSlug,
  type CourseDoc,
  type CourseInput,
  type CourseState,
  type EnrollmentDoc,
  type LeadDoc,
} from "./model";

const P = CREATOR_SLUG;

function courses(tenantId: string) {
  return tenantCollection<Omit<CourseDoc, "id">>(P, tenantId, "courses");
}
function enrollments(tenantId: string) {
  return tenantCollection<Omit<EnrollmentDoc, "id">>(P, tenantId, "enrollments");
}
function leads(tenantId: string) {
  return tenantCollection<Omit<LeadDoc, "id">>(P, tenantId, "leads");
}

/** Learner-side index so a learner can find every school they enrolled in. */
function learnerIndex(uid: string) {
  return db().collection("products").doc(P).collection("learners").doc(uid).collection("enrollments");
}

function normalizeCourse(id: string, data: Partial<CourseDoc>): CourseDoc {
  const parsed = courseInputSchema.safeParse(data);
  const input: CourseInput = parsed.success
    ? parsed.data
    : { title: String(data.title ?? "Untitled course"), subtitle: "", description: "", pricing: { type: "free" }, modules: [] };
  return {
    ...input,
    id,
    slug: String(data.slug ?? id),
    status: (data.status ?? "draft") as CourseState,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
    publishedAt: data.publishedAt ?? null,
    createdBy: String(data.createdBy ?? ""),
  };
}

function normalizeEnrollment(id: string, data: Partial<EnrollmentDoc>): EnrollmentDoc {
  return {
    id,
    courseId: String(data.courseId ?? ""),
    uid: String(data.uid ?? ""),
    email: String(data.email ?? ""),
    name: String(data.name ?? ""),
    enrolledAt: String(data.enrolledAt ?? new Date(0).toISOString()),
    completedLessonIds: Array.isArray(data.completedLessonIds) ? data.completedLessonIds.map(String) : [],
    quizScores: (data.quizScores ?? {}) as EnrollmentDoc["quizScores"],
    completedAt: data.completedAt ?? null,
    source: "free",
  };
}

// ---------- Creator (tenant member) operations ----------

export async function listCourses(tenantId: string) {
  const snapshot = await courses(tenantId).get();
  return snapshot.docs
    .map((doc) => normalizeCourse(doc.id, doc.data()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCourse(tenantId: string, courseId: string) {
  const doc = await courses(tenantId).doc(courseId).get();
  if (!doc.exists) throw new FleetError("Course not found.", 404);
  return normalizeCourse(doc.id, doc.data() ?? {});
}

export async function createCourse(tenantId: string, actor: FleetUser, title: string) {
  const existing = await courses(tenantId).select("slug").get();
  const slug = uniqueSlug(title, existing.docs.map((doc) => String(doc.get("slug"))));
  const now = new Date().toISOString();
  const ref = courses(tenantId).doc();
  const course: Omit<CourseDoc, "id"> = {
    title,
    subtitle: "",
    description: "",
    pricing: { type: "free" },
    modules: [],
    slug,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    createdBy: actor.uid,
  };
  await ref.set(course);
  await appendAuditEvent(P, tenantId, actor, "course.created", { type: "course", id: ref.id }, { title, slug });
  return normalizeCourse(ref.id, course);
}

export async function updateCourse(tenantId: string, actor: FleetUser, courseId: string, input: CourseInput) {
  const problems = curriculumProblems(input.modules);
  if (problems.length) throw new FleetError(problems[0], 400);
  const current = await getCourse(tenantId, courseId);
  if (current.status === "archived") throw new FleetError("Restore the course to draft before editing it.", 409);
  if (current.status === "published" && orderedLessons(input.modules).length === 0) {
    throw new FleetError("A published course needs at least one lesson. Unpublish it first.", 409);
  }
  const updatedAt = new Date().toISOString();
  await courses(tenantId).doc(courseId).set({ ...input, updatedAt }, { merge: true });
  await appendAuditEvent(P, tenantId, actor, "course.updated", { type: "course", id: courseId }, {
    title: input.title,
    modules: input.modules.length,
    lessons: orderedLessons(input.modules).length,
    pricing: input.pricing.type,
  });
  return { ...current, ...input, updatedAt };
}

export async function transitionCourse(tenantId: string, actor: FleetUser, courseId: string, to: CourseState) {
  const ref = courses(tenantId).doc(courseId);
  const result = await db().runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new FleetError("Course not found.", 404);
    const course = normalizeCourse(doc.id, doc.data() ?? {});
    const problems = courseTransitionProblems(course, to);
    if (problems.length) throw new FleetError(problems.join(" "), 409);
    const now = new Date().toISOString();
    const patch = {
      status: to,
      updatedAt: now,
      publishedAt: to === "published" ? now : course.publishedAt,
    };
    transaction.update(ref, patch);
    return { from: course.status, course: { ...course, ...patch } };
  });
  await appendAuditEvent(P, tenantId, actor, `course.${to}`, { type: "course", id: courseId }, { from: result.from, to });
  return result.course;
}

export async function listEnrollments(tenantId: string) {
  const [enrollmentSnapshot, courseList] = await Promise.all([enrollments(tenantId).get(), listCourses(tenantId)]);
  const byId = new Map(courseList.map((course) => [course.id, course]));
  return enrollmentSnapshot.docs
    .map((doc) => normalizeEnrollment(doc.id, doc.data()))
    .map((enrollment) => {
      const course = byId.get(enrollment.courseId);
      return {
        ...enrollment,
        courseTitle: course?.title ?? "Deleted course",
        progress: calculateProgress(course?.modules ?? [], enrollment.completedLessonIds),
      };
    })
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));
}

export async function listLeads(tenantId: string) {
  const snapshot = await leads(tenantId).orderBy("createdAt", "desc").limit(500).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as LeadDoc);
}

export async function exportSchool(tenantId: string) {
  const [tenant, courseSnapshot, enrollmentSnapshot, leadSnapshot] = await Promise.all([
    tenantRef(P, tenantId).get(),
    courses(tenantId).get(),
    enrollments(tenantId).get(),
    leads(tenantId).get(),
  ]);
  return {
    tenant: tenant.data() ?? {},
    courses: courseSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    enrollments: enrollmentSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    leads: leadSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

// ---------- Public / learner operations ----------

export async function getSchoolName(tenantId: string) {
  const tenant = await tenantRef(P, tenantId).get();
  if (!tenant.exists) throw new FleetError("School not found.", 404);
  return String(tenant.get("name") ?? "Creator school");
}

/** Public read: only published courses are ever returned. */
export async function getPublishedCourse(tenantId: string, courseSlug: string) {
  const snapshot = await courses(tenantId).where("slug", "==", courseSlug).limit(5).get();
  const doc = snapshot.docs.find((entry) => entry.get("status") === "published");
  if (!doc) throw new FleetError("Course not found.", 404);
  return normalizeCourse(doc.id, doc.data());
}

/** The outline a visitor sees before enrolling: no lesson bodies, videos, or quiz answers. */
export function publicOutline(course: CourseDoc) {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    pricing: course.pricing,
    publishedAt: course.publishedAt,
    modules: course.modules.map((courseModule) => ({
      id: courseModule.id,
      title: courseModule.title,
      lessons: courseModule.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        dripDays: lesson.dripDays,
        hasVideo: Boolean(lesson.videoUrl),
        hasQuiz: Boolean(lesson.quiz?.questions.length),
      })),
    })),
  };
}

export type PublicOutline = ReturnType<typeof publicOutline>;

export async function getEnrollment(tenantId: string, courseId: string, uid: string) {
  const doc = await enrollments(tenantId).doc(enrollmentId(courseId, uid)).get();
  return doc.exists ? normalizeEnrollment(doc.id, doc.data() ?? {}) : null;
}

export async function enroll(tenantId: string, courseSlug: string, user: FleetUser) {
  const course = await getPublishedCourse(tenantId, courseSlug);
  if (course.pricing.type === "paid") {
    throw new FleetError("Payments are not connected for this school yet, so paid courses cannot be purchased.", 402);
  }
  const schoolName = await getSchoolName(tenantId);
  const id = enrollmentId(course.id, user.uid);
  const ref = enrollments(tenantId).doc(id);
  const created = await db().runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return false;
    const now = new Date().toISOString();
    transaction.set(ref, {
      courseId: course.id,
      uid: user.uid,
      email: user.email,
      name: user.name,
      enrolledAt: now,
      completedLessonIds: [],
      quizScores: {},
      completedAt: null,
      source: "free",
    });
    transaction.set(learnerIndex(user.uid).doc(`${tenantId}_${course.id}`), {
      tenantId,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      schoolName,
      enrolledAt: now,
    });
    return true;
  });
  if (created) {
    await appendAuditEvent(P, tenantId, user, "enrollment.created", { type: "enrollment", id }, { courseId: course.id, source: "free" });
  }
  return { id, created };
}

export async function listLearnerEnrollments(uid: string) {
  const snapshot = await learnerIndex(uid).orderBy("enrolledAt", "desc").limit(100).get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    tenantId: String(doc.get("tenantId")),
    courseSlug: String(doc.get("courseSlug")),
    courseTitle: String(doc.get("courseTitle")),
    schoolName: String(doc.get("schoolName")),
    enrolledAt: String(doc.get("enrolledAt")),
  }));
}

async function requireEnrollment(tenantId: string, courseSlug: string, user: FleetUser) {
  const course = await getPublishedCourse(tenantId, courseSlug);
  const enrollment = await getEnrollment(tenantId, course.id, user.uid);
  if (!enrollment) throw new FleetError("Enroll in this course to continue.", 403);
  return { course, enrollment };
}

/** Everything a learner needs; locked lessons ship without their content. */
export async function getLearnerView(tenantId: string, courseSlug: string, user: FleetUser, now = new Date()) {
  const { course, enrollment } = await requireEnrollment(tenantId, courseSlug, user);
  const schoolName = await getSchoolName(tenantId);
  return {
    schoolName,
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      modules: course.modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        lessons: courseModule.lessons.map((lesson) => {
          const unlocked = isLessonUnlocked(enrollment.enrolledAt, lesson.dripDays, now);
          return {
            id: lesson.id,
            title: lesson.title,
            dripDays: lesson.dripDays,
            unlocked,
            body: unlocked ? lesson.body : "",
            videoUrl: unlocked ? lesson.videoUrl : "",
            quiz: unlocked ? publicQuiz(lesson.quiz) : null,
          };
        }),
      })),
    },
    enrollment,
    progress: calculateProgress(course.modules, enrollment.completedLessonIds),
  };
}

export type LearnerView = Awaited<ReturnType<typeof getLearnerView>>;

export async function setLessonProgress(tenantId: string, courseSlug: string, user: FleetUser, lessonId: string, complete: boolean) {
  const { course, enrollment } = await requireEnrollment(tenantId, courseSlug, user);
  const lesson = orderedLessons(course.modules).find((entry) => entry.id === lessonId);
  if (!lesson) throw new FleetError("Lesson not found.", 404);
  if (!isLessonUnlocked(enrollment.enrolledAt, lesson.dripDays)) throw new FleetError("This lesson is not unlocked yet.", 403);
  const completed = new Set(enrollment.completedLessonIds);
  if (complete) completed.add(lessonId);
  else completed.delete(lessonId);
  const completedLessonIds = [...completed];
  const progress = calculateProgress(course.modules, completedLessonIds);
  const completedAt = progress.isComplete ? (enrollment.completedAt ?? new Date().toISOString()) : null;
  await enrollments(tenantId).doc(enrollment.id).update({ completedLessonIds, completedAt });
  await appendAuditEvent(P, tenantId, user, complete ? "progress.lesson_completed" : "progress.lesson_reopened", { type: "enrollment", id: enrollment.id }, { lessonId, percent: progress.percent });
  if (progress.isComplete && !enrollment.completedAt) {
    await appendAuditEvent(P, tenantId, user, "enrollment.completed", { type: "enrollment", id: enrollment.id }, { courseId: course.id });
  }
  return { completedLessonIds, completedAt, progress };
}

export async function submitQuiz(tenantId: string, courseSlug: string, user: FleetUser, lessonId: string, answers: Record<string, number>) {
  const { course, enrollment } = await requireEnrollment(tenantId, courseSlug, user);
  const lesson = orderedLessons(course.modules).find((entry) => entry.id === lessonId);
  if (!lesson?.quiz || lesson.quiz.questions.length === 0) throw new FleetError("This lesson has no quiz.", 404);
  if (!isLessonUnlocked(enrollment.enrolledAt, lesson.dripDays)) throw new FleetError("This lesson is not unlocked yet.", 403);
  const score = { ...scoreQuiz(lesson.quiz, answers), submittedAt: new Date().toISOString() };
  await enrollments(tenantId).doc(enrollment.id).update({ [`quizScores.${lessonId}`]: score });
  await appendAuditEvent(P, tenantId, user, "quiz.submitted", { type: "enrollment", id: enrollment.id }, { lessonId, percent: score.percent, passed: score.passed });
  return score;
}

export async function captureLead(tenantId: string, courseSlug: string, email: string) {
  const course = await getPublishedCourse(tenantId, courseSlug);
  // Deterministic id keeps repeat sign-ups idempotent without a composite query.
  const id = `${course.id}_${Buffer.from(email).toString("base64url").slice(0, 120)}`;
  const ref = leads(tenantId).doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({ email, courseId: course.id, courseSlug: course.slug, consent: true, createdAt: new Date().toISOString() });
    await appendAuditEvent(P, tenantId, { uid: "public", email, name: "" }, "lead.captured", { type: "lead", id }, { courseId: course.id });
  }
  return { id, created: !existing.exists };
}

export async function getCertificate(tenantId: string, courseSlug: string, user: FleetUser) {
  const { course, enrollment } = await requireEnrollment(tenantId, courseSlug, user);
  const progress = calculateProgress(course.modules, enrollment.completedLessonIds);
  if (!progress.isComplete) throw new FleetError("Complete every lesson to earn the certificate.", 403);
  return {
    schoolName: await getSchoolName(tenantId),
    courseTitle: course.title,
    learnerName: enrollment.name || enrollment.email,
    completedAt: enrollment.completedAt ?? new Date().toISOString(),
    certificateId: enrollment.id,
  };
}
