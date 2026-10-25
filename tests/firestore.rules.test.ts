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
