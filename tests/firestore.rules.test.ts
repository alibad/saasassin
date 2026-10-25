import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let environment: RulesTestEnvironment;

const ownerPermissions = [
  "organization.read",
  "organization.manage",
  "directory.read",
  "directory.manage",
  "roles.read",
  "roles.manage",
  "roles.simulate",
  "reviews.read",
  "reviews.read_all",
  "reviews.manage",
  "reviews.submit",
  "audit.read",
  "audit.write",
];

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "saasassin-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "organizations/org-a"), { name: "Org A", createdBy: "owner-a" }),
      setDoc(doc(db, "organizations/org-a/roles/owner"), { name: "Owner", builtIn: true, permissions: ownerPermissions }),
      setDoc(doc(db, "organizations/org-a/roles/employee"), { name: "Employee", builtIn: true, permissions: ["directory.read", "reviews.read", "reviews.submit"] }),
      setDoc(doc(db, "organizations/org-a/roles/importer"), { name: "Importer", builtIn: false, permissions: ["directory.read", "directory.manage"] }),
      setDoc(doc(db, "organizations/org-a/members/owner-a"), { authUid: "owner-a", name: "Owner A", email: "owner-a@example.com", roleId: "owner", status: "active" }),
      setDoc(doc(db, "organizations/org-a/members/employee-a"), { authUid: "employee-a", name: "Employee A", email: "employee-a@example.com", roleId: "employee", status: "active" }),
      setDoc(doc(db, "organizations/org-a/members/importer-a"), { authUid: "importer-a", name: "Importer A", email: "importer-a@example.com", roleId: "importer", status: "active" }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a"), { name: "Cycle A", state: "review_writing" }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-a"), { reviewerId: "employee-a", subjectId: "employee-a", state: "draft", answers: {} }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-other"), { reviewerId: "owner-a", subjectId: "employee-a", state: "draft", answers: {} }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-a"), { subjectId: "employee-a", state: "released", content: {} }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/owner-a"), { subjectId: "owner-a", state: "released", content: {} }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/calibrations/employee-a"), { subjectId: "employee-a", rating: 4 }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/nominations/employee-a__importer-a"), { subjectId: "employee-a", peerId: "importer-a", state: "pending" }),
      setDoc(doc(db, "organizations/org-a/goals/goal-private"), { ownerId: "owner-a", visibility: "manager", title: "Private" }),
      setDoc(doc(db, "organizations/org-a/goals/goal-public"), { ownerId: "owner-a", visibility: "public", title: "Public" }),
      setDoc(doc(db, "organizations/org-a/feedback/feedback-a"), { authorId: "owner-a", recipientId: "employee-a", body: "Great work", visibility: "private" }),
      setDoc(doc(db, "organizations/org-a/oneOnOnes/meeting-a"), { managerId: "owner-a", reportId: "employee-a", participantIds: ["owner-a", "employee-a"] }),
      setDoc(doc(db, "organizations/org-a/notifications/notification-a"), { recipientId: "employee-a", kind: "reminder", read: false }),
      setDoc(doc(db, "organizations/org-a/members/employee-imported"), { authUid: "imported-uid", name: "Imported", email: "imported@example.com", roleId: "employee", status: "active" }),
      setDoc(doc(db, "organizations/org-a/memberLinks/imported-uid"), { memberId: "employee-imported" }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-imported"), { reviewerId: "employee-imported", subjectId: "employee-imported", state: "draft", answers: {} }),
      setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-imported"), { subjectId: "employee-imported", state: "released", content: {} }),
      setDoc(doc(db, "organizations/org-a/apiKeys/key-a"), { name: "HRIS", hash: "abc", scopes: ["directory:read"] }),
      setDoc(doc(db, "organizations/org-a/webhooks/hook-a"), { url: "https://example.com", secret: "whsec_x", active: true }),
      setDoc(doc(db, "organizations/org-a/reportViews/view-a"), { name: "Shared", shared: true, ownerId: "owner-a" }),
      setDoc(doc(db, "organizations/org-b"), { name: "Org B", createdBy: "owner-b" }),
      setDoc(doc(db, "organizations/org-b/roles/owner"), { name: "Owner", builtIn: true, permissions: ownerPermissions }),
      setDoc(doc(db, "organizations/org-b/members/owner-b"), { authUid: "owner-b", name: "Owner B", email: "owner-b@example.com", roleId: "owner", status: "active" }),
    ]);
  });
});

afterAll(async () => environment.cleanup());

describe("tenant isolation and role access", () => {
  it("denies reads across organization boundaries", async () => {
    const db = environment.authenticatedContext("owner-a").firestore();
    await assertFails(getDoc(doc(db, "organizations/org-b/members/owner-b")));
  });

  it("allows directory reads but denies employee directory writes", async () => {
    const db = environment.authenticatedContext("employee-a").firestore();
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/members/owner-a")));
    await assertFails(updateDoc(doc(db, "organizations/org-a/members/employee-a"), { title: "Unauthorized" }));
  });

  it("prevents a directory importer from granting a privileged role", async () => {
    const db = environment.authenticatedContext("importer-a").firestore();
    await assertSucceeds(setDoc(doc(db, "organizations/org-a/members/new-employee"), {
      name: "New Employee", email: "new@example.com", roleId: "employee", status: "invited",
    }));
    await assertFails(setDoc(doc(db, "organizations/org-a/members/new-owner"), {
      name: "New Owner", email: "new-owner@example.com", roleId: "owner", status: "invited",
    }));
  });

  it("limits a reviewer to their own assignment", async () => {
    const db = environment.authenticatedContext("employee-a").firestore();
    await assertSucceeds(updateDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-a"), {
      answers: { q1: "Evidence" }, state: "draft", updatedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-other")));
    await assertFails(updateDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-other"), {
      answers: { q1: "Tampered" }, state: "submitted", updatedAt: serverTimestamp(),
    }));
  });

  it("keeps audit events immutable after creation", async () => {
    const db = environment.authenticatedContext("owner-a").firestore();
    const event = doc(db, "organizations/org-a/auditEvents/event-a");
    await assertSucceeds(setDoc(event, {
      actorId: "owner-a",
      actorName: "Owner A",
      eventType: "test.created",
      entityType: "test",
      entityId: "test-a",
      summary: "Created test evidence.",
      createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(event, { summary: "Rewritten" }));
    await assertFails(deleteDoc(event));
  });
});

describe("performance program records", () => {
  it("lets an employee read only their own packet, feedback, one-to-ones and notifications", async () => {
    const db = environment.authenticatedContext("employee-a").firestore();
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/owner-a")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/feedback/feedback-a")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/oneOnOnes/meeting-a")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/notifications/notification-a")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/nominations/employee-a__importer-a")));
  });

  it("hides calibration and manager-only goals from employees", async () => {
    const db = environment.authenticatedContext("employee-a").firestore();
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/calibrations/employee-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/goals/goal-private")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/goals/goal-public")));
  });

  it("keeps private feedback and one-to-ones away from uninvolved colleagues", async () => {
    const db = environment.authenticatedContext("importer-a").firestore();
    await assertFails(getDoc(doc(db, "organizations/org-a/feedback/feedback-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/oneOnOnes/meeting-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/notifications/notification-a")));
  });

  it("denies every client write to server-owned program records, even for owners", async () => {
    const db = environment.authenticatedContext("owner-a").firestore();
    await assertFails(setDoc(doc(db, "organizations/org-a/goals/new-goal"), { ownerId: "owner-a", title: "Client goal", visibility: "public" }));
    await assertFails(updateDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-a"), { state: "acknowledged" }));
    await assertFails(setDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/calibrations/employee-a"), { rating: 5 }));
    await assertFails(setDoc(doc(db, "organizations/org-a/feedback/forged"), { authorId: "employee-a", recipientId: "owner-a", body: "Forged" }));
    await assertFails(deleteDoc(doc(db, "organizations/org-a/notifications/notification-a")));
  });

  it("denies cross-tenant reads of program records", async () => {
    const db = environment.authenticatedContext("owner-b").firestore();
    await assertFails(getDoc(doc(db, "organizations/org-a/goals/goal-public")));
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-a")));
  });
});

describe("imported members linked on verified sign-in", () => {
  it("resolves a linked auth uid to the imported member id for reviews and packets", async () => {
    const db = environment.authenticatedContext("imported-uid").firestore();
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/members/owner-a")));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-imported")));
    await assertSucceeds(updateDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-imported"), {
      answers: { q1: "Linked" }, state: "draft", updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/packets/employee-imported")));
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-a")));
  });

  it("lets nobody forge or read someone else's member link", async () => {
    const attacker = environment.authenticatedContext("employee-a").firestore();
    await assertFails(setDoc(doc(attacker, "organizations/org-a/memberLinks/employee-a"), { memberId: "owner-a" }));
    await assertFails(getDoc(doc(attacker, "organizations/org-a/memberLinks/imported-uid")));
    const linked = environment.authenticatedContext("imported-uid").firestore();
    await assertSucceeds(getDoc(doc(linked, "organizations/org-a/memberLinks/imported-uid")));
  });

  it("does not let an unlinked uid with the same email act as the imported member", async () => {
    const db = environment.authenticatedContext("stranger-uid", { email: "imported@example.com" }).firestore();
    await assertFails(getDoc(doc(db, "organizations/org-a/reviewCycles/cycle-a/reviews/review-imported")));
    await assertFails(getDoc(doc(db, "organizations/org-a/members/owner-a")));
  });
});

describe("integration secrets", () => {
  it("keeps API key hashes, webhook secrets and report views server-only, even for owners", async () => {
    const db = environment.authenticatedContext("owner-a").firestore();
    await assertFails(getDoc(doc(db, "organizations/org-a/apiKeys/key-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/webhooks/hook-a")));
    await assertFails(getDoc(doc(db, "organizations/org-a/reportViews/view-a")));
    await assertFails(setDoc(doc(db, "organizations/org-a/apiKeys/forged"), { hash: "x", scopes: ["directory:read"] }));
    await assertFails(setDoc(doc(db, "organizations/org-a/webhooks/hook-a/deliveries/d1"), { status: "delivered" }));
  });
});
