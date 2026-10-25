import "server-only";

import { FieldValue, type CollectionReference, type DocumentData } from "firebase-admin/firestore";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

import { FleetError, type FleetUser } from "./session";

/**
 * Shared tenant primitives for the incubation fleet.
 *
 * Layout (server-only; client SDK access to products/** is denied by rules):
 *   products/{product}/tenants/{tenantId}
 *   products/{product}/tenants/{tenantId}/memberships/{uid}
 *   products/{product}/tenants/{tenantId}/auditEvents/{eventId}   (append-only)
 *   products/{product}/tenants/{tenantId}/{productCollection}/{id}
 *   products/{product}/users/{uid}/tenants/{tenantId}              (membership index)
 *
 * Roles are product-owned strings; "owner" and "admin" are the shared privileged roles.
 */

export type FleetTenantRole = "owner" | "admin" | "member" | "viewer" | (string & {});

export type FleetTenantSummary = {
  id: string;
  name: string;
  role: FleetTenantRole;
};

export type FleetMembership = {
  uid: string;
  email: string;
  name: string;
  role: FleetTenantRole;
  status: "active" | "removed";
};

export const PRIVILEGED_ROLES: FleetTenantRole[] = ["owner", "admin"];

export function db() {
  const firestore = getAdminDb();
  if (!firestore) throw new FleetError("Persistence is not configured.", 503);
  return firestore;
}

export function tenantRef(product: string, tenantId: string) {
  return db().collection("products").doc(product).collection("tenants").doc(tenantId);
}

/** A product-owned collection below a tenant. Always go through requireTenantMember first. */
export function tenantCollection<T = DocumentData>(product: string, tenantId: string, name: string) {
  return tenantRef(product, tenantId).collection(name) as CollectionReference<T>;
}

export async function listTenantsForUser(product: string, user: FleetUser): Promise<FleetTenantSummary[]> {
  const snapshot = await db()
    .collection("products").doc(product)
    .collection("users").doc(user.uid)
    .collection("tenants")
    .orderBy("name")
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    name: String(doc.get("name") ?? "Untitled workspace"),
    role: String(doc.get("role") ?? "member"),
  }));
}

export async function createTenant(product: string, user: FleetUser, name: string, data: DocumentData = {}) {
  const tenant = db().collection("products").doc(product).collection("tenants").doc();
  const batch = db().batch();
  const now = FieldValue.serverTimestamp();
  batch.set(tenant, { ...data, name, product, createdBy: user.uid, createdAt: now });
  batch.set(tenant.collection("memberships").doc(user.uid), {
    uid: user.uid,
    email: user.email,
    name: user.name,
    role: "owner",
    status: "active",
    joinedAt: now,
  });
  batch.set(userTenantIndex(product, user.uid, tenant.id), { name, role: "owner", joinedAt: now });
  batch.set(tenant.collection("auditEvents").doc(), auditPayload(user, "tenant.created", { type: "tenant", id: tenant.id }, { name }));
  await batch.commit();
  return { id: tenant.id, name, role: "owner" as const };
}

/** Verifies an active membership server-side; never trust a tenant or role sent by the browser. */
export async function requireTenantMember(
  product: string,
  tenantId: string,
  user: FleetUser,
  allowedRoles?: FleetTenantRole[],
) {
  const [tenant, membership] = await Promise.all([
    tenantRef(product, tenantId).get(),
    tenantRef(product, tenantId).collection("memberships").doc(user.uid).get(),
  ]);
  if (!tenant.exists || !membership.exists || membership.get("status") !== "active") {
    throw new FleetError("Workspace not found.", 404);
  }
  const role = String(membership.get("role")) as FleetTenantRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new FleetError("Your role does not allow this action.", 403);
  }
  return { tenant: { id: tenant.id, name: String(tenant.get("name") ?? ""), ...tenant.data() }, role };
}

export async function addTenantMember(
  product: string,
  tenantId: string,
  actor: FleetUser,
  input: { email: string; role: FleetTenantRole },
) {
  await requireTenantMember(product, tenantId, actor, PRIVILEGED_ROLES);
  if (input.role === "owner") throw new FleetError("Ownership cannot be granted by invitation.", 403);
  const auth = getAdminAuth();
  if (!auth) throw new FleetError("Authentication is not configured.", 503);
  const invited = await auth.getUserByEmail(input.email).catch(() => null);
  if (!invited) throw new FleetError("That person needs a SaaSassin account first.", 404);

  const tenant = await tenantRef(product, tenantId).get();
  const batch = db().batch();
  const now = FieldValue.serverTimestamp();
  batch.set(tenant.ref.collection("memberships").doc(invited.uid), {
    uid: invited.uid,
    email: invited.email ?? input.email,
    name: invited.displayName ?? "",
    role: input.role,
    status: "active",
    joinedAt: now,
  });
  batch.set(userTenantIndex(product, invited.uid, tenantId), { name: tenant.get("name"), role: input.role, joinedAt: now });
  batch.set(
    tenant.ref.collection("auditEvents").doc(),
    auditPayload(actor, "membership.granted", { type: "membership", id: invited.uid }, { role: input.role }),
  );
  await batch.commit();
  return { uid: invited.uid, email: invited.email ?? input.email, role: input.role };
}

export async function listTenantMembers(product: string, tenantId: string): Promise<FleetMembership[]> {
  const snapshot = await tenantRef(product, tenantId).collection("memberships").get();
  return snapshot.docs.map((doc) => doc.data() as FleetMembership);
}

export function auditPayload(
  actor: FleetUser,
  action: string,
  target: { type: string; id: string },
  details: Record<string, unknown> = {},
) {
  return {
    action,
    actor: { uid: actor.uid, email: actor.email },
    target,
    details,
    occurredAt: FieldValue.serverTimestamp(),
  };
}

/** Append-only: audit events are only ever created, never updated or deleted. */
export async function appendAuditEvent(
  product: string,
  tenantId: string,
  actor: FleetUser,
  action: string,
  target: { type: string; id: string },
  details: Record<string, unknown> = {},
) {
  await tenantRef(product, tenantId).collection("auditEvents").add(auditPayload(actor, action, target, details));
}

export async function listAuditEvents(product: string, tenantId: string, limit = 50) {
  const snapshot = await tenantRef(product, tenantId)
    .collection("auditEvents")
    .orderBy("occurredAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      action: String(data.action),
      actor: data.actor as { uid: string; email: string },
      target: data.target as { type: string; id: string },
      details: (data.details ?? {}) as Record<string, unknown>,
      occurredAt: data.occurredAt?.toDate?.().toISOString() ?? null,
    };
  });
}

function userTenantIndex(product: string, uid: string, tenantId: string) {
  return db().collection("products").doc(product).collection("users").doc(uid).collection("tenants").doc(tenantId);
}
