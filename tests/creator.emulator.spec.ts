if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("creator.emulator.spec.ts only runs against the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden path for SaaSassin Creator, driving the real server data layer against the emulator:
// pnpm exec firebase emulators:exec --config .emulator-creator.json --only firestore --project demo-saasassin \
//   "pnpm exec vitest run --config vitest.emulator.config.mjs tests/creator.emulator.spec.ts"
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";
const app = initializeApp({ projectId: "demo-saasassin" }, "creator-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const store = await import("@/lib/creator/store");
const { buildCreatorExport } = await import("@/lib/creator/export");
const { EDITOR_ROLES, PUBLISHER_ROLES } = await import("@/lib/creator/roles");
const { mapKajabiExport } = await import("@/lib/creator/import");

const P = "creator";
const owner = { uid: "owner-1", email: "owner@example.com", name: "Olivia Owner" };
const viewer = { uid: "viewer-1", email: "viewer@example.com", name: "Vic Viewer" };
const stranger = { uid: "stranger-1", email: "stranger@example.com", name: "Sam Stranger" };
const learner = { uid: "learner-1", email: "learner@example.com", name: "Lee Learner" };

let tenantA = "";
let tenantB = "";
let courseId = "";
let slug = "";

async function expectFleetError(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FleetError);
    expect((error as InstanceType<typeof FleetError>).status).toBe(status);
    return;
  }
  throw new Error(`Expected FleetError ${status}, but the call succeeded.`);
}

beforeAll(async () => {
  tenantA = (await platform.createTenant(P, owner, "Studio Ceramics")).id;
  tenantB = (await platform.createTenant(P, stranger, "Other School")).id;
  // A viewer membership, written the way addTenantMember does (Auth is not available in the emulator run).
  await db.doc(`products/${P}/tenants/${tenantA}/memberships/${viewer.uid}`).set({ uid: viewer.uid, email: viewer.email, name: viewer.name, role: "viewer", status: "active" });
});

afterAll(async () => {
  await deleteApp(app);
});

describe("creator golden workflow on Firestore", () => {
  it("enforces tenant membership and roles", async () => {
    await expectFleetError(platform.requireTenantMember(P, tenantA, stranger), 404);
    await expectFleetError(platform.requireTenantMember(P, tenantA, viewer, EDITOR_ROLES), 403);
    await expectFleetError(platform.requireTenantMember(P, tenantA, viewer, PUBLISHER_ROLES), 403);
    const { role } = await platform.requireTenantMember(P, tenantA, owner, PUBLISHER_ROLES);
    expect(role).toBe("owner");
  });

  it("creates a draft course with a unique slug and builds its curriculum", async () => {
    const course = await store.createCourse(tenantA, owner, "Pottery 101");
    const twin = await store.createCourse(tenantA, owner, "Pottery 101");
    courseId = course.id;
    slug = course.slug;
    expect(course.status).toBe("draft");
    expect(slug).toBe("pottery-101");
    expect(twin.slug).toBe("pottery-101-2");

    await store.updateCourse(tenantA, owner, courseId, {
      title: "Pottery 101",
      subtitle: "From clay to kiln",
      description: "Learn **throwing**.",
      pricing: { type: "free" },
      modules: [
        {
          id: "m1",
          title: "Start",
          lessons: [
            { id: "l1", title: "Welcome", body: "Hello", videoUrl: "https://youtu.be/dQw4w9WgXcQ", dripDays: 0, quiz: { passPercent: 50, questions: [{ id: "q1", prompt: "Kiln?", options: ["Oven", "Fridge"], correctIndex: 0 }, { id: "q2", prompt: "Clay?", options: ["Earth", "Metal"], correctIndex: 0 }] } },
            { id: "l2", title: "Week two", body: "Secret drip content", videoUrl: "", dripDays: 7, quiz: null },
          ],
        },
      ],
    });
    const stored = await store.getCourse(tenantA, courseId);
    expect(stored.modules[0].lessons.map((lesson) => lesson.id)).toEqual(["l1", "l2"]);
    expect(stored.subtitle).toBe("From clay to kiln");
  });

  it("switching paid back to free leaves no stale price", async () => {
    const course = await store.getCourse(tenantA, courseId);
    await store.updateCourse(tenantA, owner, courseId, { ...course, pricing: { type: "paid", amountCents: 4900, currency: "USD" } });
    await store.updateCourse(tenantA, owner, courseId, { ...course, pricing: { type: "free" } });
    const raw = (await db.doc(`products/${P}/tenants/${tenantA}/courses/${courseId}`).get()).data();
    expect(raw?.pricing).toEqual({ type: "free" });
  });

  it("only serves published courses publicly, and never across tenants", async () => {
    await expectFleetError(store.getPublishedCourse(tenantA, slug), 404);
    const empty = await store.createCourse(tenantA, owner, "Empty");
    await expectFleetError(store.transitionCourse(tenantA, owner, empty.id, "published"), 409);

    const published = await store.transitionCourse(tenantA, owner, courseId, "published");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    const course = await store.getPublishedCourse(tenantA, slug);
    const outline = store.publicOutline(course);
    expect(JSON.stringify(outline)).not.toContain("Secret drip content");
    expect(JSON.stringify(outline)).not.toContain("correctIndex");
    await expectFleetError(store.getPublishedCourse(tenantB, slug), 404);

    const catalog = await store.listPublishedCourses(tenantA);
    expect(catalog.map((entry) => entry.slug)).toEqual([slug]);
    expect(JSON.stringify(catalog)).not.toContain("Secret drip content");
    expect(await store.listPublishedCourses(tenantB)).toHaveLength(0);
  });

  it("enrolls a learner idempotently and locks drip lessons", async () => {
    const first = await store.enroll(tenantA, slug, learner);
    const again = await store.enroll(tenantA, slug, learner);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);

    const view = await store.getLearnerView(tenantA, slug, learner);
    const [welcome, weekTwo] = view.course.modules[0].lessons;
    expect(welcome.unlocked).toBe(true);
    expect(welcome.body).toBe("Hello");
    expect(JSON.stringify(welcome.quiz)).not.toContain("correctIndex");
    expect(weekTwo.unlocked).toBe(false);
    expect(weekTwo.body).toBe("");

    const later = await store.getLearnerView(tenantA, slug, learner, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    expect(later.course.modules[0].lessons[1].unlocked).toBe(true);

    await expectFleetError(store.getLearnerView(tenantA, slug, stranger), 403);
    expect(await store.listLearnerEnrollments(learner.uid)).toHaveLength(1);
  });

  it("tracks progress, rejects locked lessons and scores quizzes server-side", async () => {
    await expectFleetError(store.setLessonProgress(tenantA, slug, learner, "l2", true), 403);
    await expectFleetError(store.setLessonProgress(tenantA, slug, learner, "nope", true), 404);
    const progress = await store.setLessonProgress(tenantA, slug, learner, "l1", true);
    expect(progress.progress).toMatchObject({ completed: 1, total: 2, percent: 50, isComplete: false });

    const score = await store.submitQuiz(tenantA, slug, learner, "l1", { q1: 0, q2: 1 });
    expect(score).toMatchObject({ correct: 1, total: 2, percent: 50, passed: true });
    await expectFleetError(store.getCertificate(tenantA, slug, learner), 403);

    const rows = await store.listEnrollments(tenantA);
    expect(rows).toHaveLength(1);
    expect(rows[0].progress.percent).toBe(50);
    expect(rows[0].quizScores.l1.percent).toBe(50);
    expect(await store.listEnrollments(tenantB)).toHaveLength(0);
  });

  it("revokes and restores access", async () => {
    const enrollmentId = `${courseId}_${learner.uid}`;
    await store.setEnrollmentAccess(tenantA, owner, enrollmentId, "revoked");
    await expectFleetError(store.getLearnerView(tenantA, slug, learner), 403);
    await expectFleetError(store.enroll(tenantA, slug, learner), 403);
    await store.setEnrollmentAccess(tenantA, owner, enrollmentId, "active");
    expect((await store.getLearnerView(tenantA, slug, learner)).progress.percent).toBe(50);
  });

  it("captures leads idempotently and removes them on request", async () => {
    expect((await store.captureLead(tenantA, slug, "fan@example.com")).created).toBe(true);
    expect((await store.captureLead(tenantA, slug, "fan@example.com")).created).toBe(false);
    const leads = await store.listLeads(tenantA);
    expect(leads).toHaveLength(1);
    expect(leads[0].id).not.toContain("fan");
    await store.captureLead(tenantA, slug, "gone@example.com");
    const gone = (await store.listLeads(tenantA)).find((lead) => lead.email === "gone@example.com");
    await store.removeLead(tenantA, owner, gone!.id);
    expect(await store.listLeads(tenantA)).toHaveLength(1);
    expect(await store.listLeads(tenantB)).toHaveLength(0);
  });

  it("imports a Kajabi export and duplicates a course as drafts", async () => {
    const { courses } = mapKajabiExport("Product Title,Category Title,Post Title\nImported,Intro,Hello\nImported,Intro,Again");
    const created = await store.importCourses(tenantA, owner, courses, "kajabi-csv");
    expect(created).toHaveLength(1);
    const imported = await store.getCourse(tenantA, created[0].id);
    expect(imported.status).toBe("draft");
    expect(imported.modules[0].lessons).toHaveLength(2);

    const copy = await store.duplicateCourse(tenantA, owner, courseId);
    expect(copy).toMatchObject({ status: "draft", slug: "pottery-101-copy" });
    expect(copy.modules).toEqual((await store.getCourse(tenantA, courseId)).modules);
  });

  it("runs lesson discussions with creator moderation", async () => {
    await expectFleetError(store.addLessonComment(tenantA, slug, stranger, "l1", "Hi"), 403);
    await expectFleetError(store.addLessonComment(tenantA, slug, learner, "l2", "Too early"), 403);
    const posted = await store.addLessonComment(tenantA, slug, learner, "l1", "Loved this");
    await store.addLessonComment(tenantA, slug, learner, "l1", "Spam spam");
    expect(posted.mine).toBe(true);
    expect(await store.listLessonComments(tenantA, slug, learner, "l1")).toHaveLength(2);
    const spam = (await store.listComments(tenantA)).find((comment) => comment.body === "Spam spam");
    await store.setCommentHidden(tenantA, owner, spam!.id, true);
    const visible = await store.listLessonComments(tenantA, slug, learner, "l1");
    expect(visible.map((comment) => comment.body)).toEqual(["Loved this"]);
    expect((await store.listComments(tenantA)).filter((comment) => comment.hidden)).toHaveLength(1);
    expect(await store.listComments(tenantB)).toHaveLength(0);
  });

  it("bulk-enrolls existing accounts and reports the rest", async () => {
    const accounts: Record<string, { uid: string; email: string; name: string }> = {
      "ana@example.com": { uid: "ana-1", email: "ana@example.com", name: "Ana" },
      [learner.email]: learner,
    };
    const result = await store.bulkEnroll(tenantA, owner, courseId, ["ana@example.com", learner.email, "ghost@example.com"], async (email) => accounts[email] ?? null);
    expect(result).toEqual({ enrolled: ["ana@example.com"], alreadyEnrolled: [learner.email], noAccount: ["ghost@example.com"] });
    expect((await store.getLearnerView(tenantA, slug, accounts["ana@example.com"])).progress.percent).toBe(0);
    const draft = await store.createCourse(tenantA, owner, "Unpublished");
    await expectFleetError(store.bulkEnroll(tenantA, owner, draft.id, ["ana@example.com"], async () => null), 409);
  });

  it("appends audit events for every mutation", async () => {
    const actions = (await platform.listAuditEvents(P, tenantA, 200)).map((event) => event.action);
    for (const action of ["tenant.created", "course.created", "course.updated", "course.published", "enrollment.created", "progress.lesson_completed", "quiz.submitted", "enrollment.revoked", "enrollment.restored", "lead.captured", "lead.removed", "import.committed", "course.duplicated", "comment.created", "comment.hidden", "enrollment.granted"]) {
      expect(actions).toContain(action);
    }
    const otherTenant = (await platform.listAuditEvents(P, tenantB, 200)).map((event) => event.action);
    expect(otherTenant).toEqual(["tenant.created"]);
  });

  it("exports every record of the school", async () => {
    const school = await store.exportSchool(tenantA);
    const payload = buildCreatorExport(tenantA, {
      ...school,
      members: await platform.listTenantMembers(P, tenantA),
      audit: await platform.listAuditEvents(P, tenantA, 1000),
    });
    const counts = Object.fromEntries(payload.manifest.files.map((file) => [file.path, file.records]));
    expect(counts["courses.json"]).toBe(6); // Pottery 101, its slug twin, Empty, Imported, the copy, Unpublished
    expect(counts["enrollments.json"]).toBe(2);
    expect(counts["leads.json"]).toBe(1);
    expect(counts["comments.json"]).toBe(2);
    expect(counts["members.json"]).toBe(2);
    expect(JSON.stringify(payload)).not.toContain("toDate");
    const enrollment = (payload.files["enrollments.json"].data as Array<Record<string, unknown>>).find((entry) => entry.uid === learner.uid);
    expect(enrollment).toMatchObject({ uid: learner.uid, completedLessonIds: ["l1"], status: "active" });
  });
});
