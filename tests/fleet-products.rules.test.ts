import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "saasassin-fleet-rules-test",
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
    await setDoc(doc(db, "products/research/tenants/t-a"), { name: "Tenant A", createdBy: "member-a" });
    await setDoc(doc(db, "products/research/tenants/t-a/memberships/member-a"), { uid: "member-a", role: "owner", status: "active" });
    await setDoc(doc(db, "products/research/tenants/t-a/auditEvents/e-1"), { action: "tenant.created" });
  });
});

afterAll(async () => {
  await environment?.cleanup();
});

describe("fleet product data is server-only", () => {
  it("denies browser reads even to an active tenant member", async () => {
    const db = environment.authenticatedContext("member-a").firestore();
    await assertFails(getDoc(doc(db, "products/research/tenants/t-a")));
    await assertFails(getDocs(collection(db, "products/research/tenants/t-a/auditEvents")));
  });

  it("denies cross-product and cross-tenant writes from the browser", async () => {
    const db = environment.authenticatedContext("member-a").firestore();
    await assertFails(setDoc(doc(db, "products/planner/tenants/t-a/tasks/x"), { title: "Injected" }));
    await assertFails(setDoc(doc(db, "products/research/tenants/t-b/memberships/member-a"), { role: "owner" }));
    await assertFails(setDoc(doc(db, "products/research/users/member-a/tenants/t-b"), { role: "owner" }));
  });

  it("denies anonymous access", async () => {
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "products/research/tenants/t-a/memberships/member-a")));
  });
});
