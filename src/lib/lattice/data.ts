import "server-only";

import { createHash } from "node:crypto";

import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { parseEmployeeCsv } from "@/lib/lattice/csv";
import {
  DEFAULT_ROLES,
  effectiveRolePermissions,
  hasPermission,
  type Permission,
} from "@/lib/lattice/permissions";
import {
  previewCycleTransition,
  type ReviewCycleState,
} from "@/lib/lattice/state-machine";
import type {
  AssignedReview,
  AuditEvent,
  ReviewCycle,
  ReviewQuestion,
  ReviewTemplate,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSnapshot,
} from "@/types/lattice";
import type { SessionUser } from "@/lib/lattice/auth";

export class LatticeDataError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LatticeDataError";
    this.status = status;
  }
}

export function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new LatticeDataError("Firebase persistence is not configured.", 503);
  }
  return db;
}

export function toIso(value: Timestamp | Date | null | undefined) {
  if (!value) return null;
  return (typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : value as Date
  ).toISOString();
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function roleFromSnapshot(document: DocumentSnapshot<DocumentData>): WorkspaceRole {
  const data = document.data() ?? {};
  return {
    id: document.id,
    name: String(data.name ?? document.id),
    description: String(data.description ?? ""),
    permissions: effectiveRolePermissions(
      document.id,
      Boolean(data.builtIn),
      Array.isArray(data.permissions) ? data.permissions : [],
    ),
    builtIn: Boolean(data.builtIn),
  };
}

export function memberFromSnapshot(document: DocumentSnapshot<DocumentData>): WorkspaceMember {
  const data = document.data() ?? {};
  return {
    id: document.id,
    authUid: typeof data.authUid === "string" ? data.authUid : null,
    name: String(data.name ?? "Unnamed employee"),
    email: String(data.email ?? ""),
    title: String(data.title ?? ""),
    teamId: typeof data.teamId === "string" ? data.teamId : null,
    teamName: typeof data.teamName === "string" ? data.teamName : null,
    managerId: typeof data.managerId === "string" ? data.managerId : null,
    managerName: typeof data.managerName === "string" ? data.managerName : null,
    roleId: String(data.roleId ?? "employee"),
    status: data.status === "inactive" ? "inactive" : data.status === "active" ? "active" : "invited",
  };
}

function templateFromSnapshot(
  document: DocumentSnapshot<DocumentData>,
): ReviewTemplate {
  const data = document.data() ?? {};
  return {
    id: document.id,
    name: String(data.name ?? "Untitled template"),
    directions: Array.isArray(data.directions) ? data.directions : ["self"],
    questions: Array.isArray(data.questions) ? data.questions : [],
    createdAt: toIso(data.createdAt),
  };
}

function auditFromSnapshot(document: DocumentSnapshot<DocumentData>): AuditEvent {
  const data = document.data() ?? {};
  return {
    id: document.id,
    actorId: String(data.actorId ?? "system"),
    actorName: String(data.actorName ?? "System"),
    eventType: String(data.eventType ?? "unknown"),
    entityType: String(data.entityType ?? "unknown"),
    entityId: String(data.entityId ?? ""),
    summary: String(data.summary ?? ""),
    createdAt: toIso(data.createdAt),
  };
}

export function auditRecord(input: {
  actor: SessionUser;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    actorId: input.actor.uid,
    actorName: input.actor.name || input.actor.email,
    actorEmail: input.actor.email,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    metadata: input.metadata ?? {},
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function authorizeOrganization(
  actor: SessionUser,
  organizationId: string,
  permission: Permission,
) {
  const db = requireDb();
  const memberRef = db.doc(`organizations/${organizationId}/members/${actor.uid}`);
  const memberSnapshot = await memberRef.get();
  if (!memberSnapshot.exists || memberSnapshot.data()?.status !== "active") {
    throw new LatticeDataError("You do not belong to this workspace.", 403);
  }

  const roleId = String(memberSnapshot.data()?.roleId ?? "employee");
  const roleSnapshot = await db.doc(`organizations/${organizationId}/roles/${roleId}`).get();
  const permissions = roleSnapshot.exists
    ? effectiveRolePermissions(
      roleId,
      Boolean(roleSnapshot.data()?.builtIn),
      Array.isArray(roleSnapshot.data()?.permissions)
        ? roleSnapshot.data()!.permissions as string[]
        : [],
    )
    : [];
  if (!hasPermission(permissions, permission)) {
    throw new LatticeDataError(`Missing permission: ${permission}.`, 403);
  }

  return {
    db,
    member: memberFromSnapshot(memberSnapshot),
    role: roleSnapshot.exists ? roleFromSnapshot(roleSnapshot) : null,
  };
}

export async function createOrganization(actor: SessionUser, name: string) {
  const db = requireDb();
  const organizationRef = db.collection("organizations").doc();
  const membershipRef = db.doc(
    `users/${actor.uid}/memberships/${organizationRef.id}`,
  );
  const auditRef = organizationRef.collection("auditEvents").doc();
  const normalizedName = name.trim();

  await db.runTransaction(async (transaction) => {
    transaction.set(organizationRef, {
      name: normalizedName,
      slug: `${slugify(normalizedName)}-${organizationRef.id.slice(0, 6)}`,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.doc(`users/${actor.uid}`), {
      email: actor.email,
      name: actor.name || actor.email.split("@")[0],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(membershipRef, {
      organizationId: organizationRef.id,
      organizationName: normalizedName,
      roleId: "owner",
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(organizationRef.collection("members").doc(actor.uid), {
      authUid: actor.uid,
      name: actor.name || actor.email.split("@")[0],
      email: actor.email.toLowerCase(),
      title: "Workspace owner",
      teamId: null,
      teamName: null,
      managerId: null,
      managerName: null,
      roleId: "owner",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const role of DEFAULT_ROLES) {
      transaction.set(organizationRef.collection("roles").doc(role.id), {
        ...role,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(auditRef, auditRecord({
      actor,
      eventType: "organization.created",
      entityType: "organization",
      entityId: organizationRef.id,
      summary: `Created workspace ${normalizedName}.`,
    }));
  });

  return organizationRef.id;
}

async function loadCycleReviews(db: Firestore, organizationId: string, cycleId: string) {
  return db.collection(`organizations/${organizationId}/reviewCycles/${cycleId}/reviews`).get();
}

export async function getWorkspaceSnapshot(
  actor: SessionUser,
  requestedOrganizationId?: string,
): Promise<WorkspaceSnapshot> {
  const db = requireDb();
  const membershipsSnapshot = await db.collection(`users/${actor.uid}/memberships`).get();
  const memberships = membershipsSnapshot.docs.map((document) => ({
    organizationId: document.id,
    organizationName: String(document.data().organizationName ?? "Workspace"),
  }));
  const organizationId = requestedOrganizationId && memberships.some(
    (membership) => membership.organizationId === requestedOrganizationId,
  ) ? requestedOrganizationId : memberships[0]?.organizationId;

  const empty: WorkspaceSnapshot = {
    user: { uid: actor.uid, email: actor.email, name: actor.name || actor.email },
    memberships,
    organization: null,
    currentMember: null,
    currentRole: null,
    permissions: [],
    members: [],
    roles: [],
    templates: [],
    cycles: [],
    assignedReviews: [],
    auditEvents: [],
  };
  if (!organizationId) return empty;

  const base = db.collection("organizations").doc(organizationId);
  const [organization, membersSnapshot, rolesSnapshot, templatesSnapshot, cyclesSnapshot, auditsSnapshot] = await Promise.all([
    base.get(),
    base.collection("members").orderBy("name").get(),
    base.collection("roles").orderBy("name").get(),
    base.collection("reviewTemplates").orderBy("createdAt", "desc").get(),
    base.collection("reviewCycles").orderBy("createdAt", "desc").get(),
    base.collection("auditEvents").orderBy("createdAt", "desc").limit(100).get(),
  ]);
  if (!organization.exists) return empty;

  const members = membersSnapshot.docs.map(memberFromSnapshot);
  const roles = rolesSnapshot.docs.map(roleFromSnapshot);
  const templates = templatesSnapshot.docs.map(templateFromSnapshot);
  const currentMember = members.find((member) => member.authUid === actor.uid) ?? null;
  const currentRole = roles.find((role) => role.id === currentMember?.roleId) ?? null;
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  const templateNames = new Map(templates.map((template) => [template.id, template.name]));

  const cycleReviewSnapshots = await Promise.all(
    cyclesSnapshot.docs.map((cycle) => loadCycleReviews(db, organizationId, cycle.id)),
  );
  const cycles: ReviewCycle[] = cyclesSnapshot.docs.map((document, index) => {
    const data = document.data();
    const reviewDocuments = cycleReviewSnapshots[index].docs;
    return {
      id: document.id,
      name: String(data.name ?? "Untitled cycle"),
      templateId: String(data.templateId ?? ""),
      templateName: templateNames.get(String(data.templateId ?? "")) ?? "Deleted template",
      state: data.state as ReviewCycleState,
      dueDate: typeof data.dueDate === "string" ? data.dueDate : null,
      peerNominationEnabled: Boolean(data.peerNominationEnabled),
      calibrationEnabled: Boolean(data.calibrationEnabled),
      assignedReviews: reviewDocuments.length,
      submittedReviews: reviewDocuments.filter((review) => review.data().state === "submitted").length,
      createdAt: toIso(data.createdAt),
    };
  });

  const assignedReviews: AssignedReview[] = cycleReviewSnapshots.flatMap((snapshot, cycleIndex) => {
    const cycle = cycles[cycleIndex];
    return snapshot.docs
      .filter((review) => review.data().reviewerId === currentMember?.id)
      .map((review) => {
        const data = review.data();
        return {
          id: review.id,
          cycleId: cycle.id,
          cycleName: cycle.name,
          templateId: String(data.templateId ?? cycle.templateId),
          subjectId: String(data.subjectId ?? ""),
          subjectName: memberNames.get(String(data.subjectId ?? "")) ?? "Employee",
          reviewerId: String(data.reviewerId ?? ""),
          direction: data.direction ?? "self",
          state: data.state === "submitted" ? "submitted" : "draft",
          answers: data.answers && typeof data.answers === "object" ? data.answers : {},
          updatedAt: toIso(data.updatedAt),
          submittedAt: toIso(data.submittedAt),
        };
      });
  });

  return {
    ...empty,
    organization: {
      id: organization.id,
      name: String(organization.data()?.name ?? "Workspace"),
      slug: String(organization.data()?.slug ?? organization.id),
      createdAt: toIso(organization.data()?.createdAt),
    },
    currentMember,
    currentRole,
    permissions: currentRole?.permissions ?? [],
    members,
    roles,
    templates,
    cycles,
    assignedReviews,
    auditEvents: auditsSnapshot.docs.map(auditFromSnapshot),
  };
}

export async function importEmployees(input: {
  actor: SessionUser;
  organizationId: string;
  csv: string;
  dryRun: boolean;
}) {
  const { actor, organizationId, csv, dryRun } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "directory.manage");
  const preview = parseEmployeeCsv(csv);
  if (dryRun || preview.errors.length) return preview;

  const base = db.collection("organizations").doc(organizationId);
  const [membersSnapshot, teamsSnapshot] = await Promise.all([
    base.collection("members").get(),
    base.collection("teams").get(),
  ]);
  const existingMembers = membersSnapshot.docs.map(memberFromSnapshot);
  const memberIdByEmail = new Map(existingMembers.map((member) => [member.email.toLowerCase(), member.id]));
  for (const row of preview.rows) {
    if (!memberIdByEmail.has(row.email)) {
      memberIdByEmail.set(row.email, stableId("employee", row.email));
    }
  }

  const existingTeamIdByName = new Map(
    teamsSnapshot.docs.map((document) => [String(document.data().name ?? "").toLowerCase(), document.id]),
  );
  const teamIdByName = new Map(existingTeamIdByName);
  for (const row of preview.rows) {
    if (row.team && !teamIdByName.has(row.team.toLowerCase())) {
      teamIdByName.set(row.team.toLowerCase(), stableId("team", row.team.toLowerCase()));
    }
  }

  const batch = db.batch();
  for (const [teamName, teamId] of teamIdByName) {
    if (!existingTeamIdByName.has(teamName)) {
      const canonicalName = preview.rows.find((row) => row.team.toLowerCase() === teamName)?.team ?? teamName;
      batch.set(base.collection("teams").doc(teamId), {
        name: canonicalName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  for (const row of preview.rows) {
    const memberId = memberIdByEmail.get(row.email)!;
    const existing = existingMembers.find((member) => member.id === memberId);
    const managerId = row.managerEmail ? memberIdByEmail.get(row.managerEmail) ?? null : null;
    const managerName = managerId
      ? preview.rows.find((candidate) => memberIdByEmail.get(candidate.email) === managerId)?.name
        ?? existingMembers.find((member) => member.id === managerId)?.name
        ?? null
      : null;
    batch.set(base.collection("members").doc(memberId), {
      authUid: existing?.authUid ?? null,
      name: row.name,
      email: row.email,
      title: row.title,
      teamId: row.team ? teamIdByName.get(row.team.toLowerCase()) ?? null : null,
      teamName: row.team || null,
      managerId,
      managerName,
      roleId: existing?.roleId === "owner" ? "owner" : row.roleId,
      status: existing?.status === "active" ? "active" : "invited",
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  const auditRef = base.collection("auditEvents").doc();
  batch.set(auditRef, auditRecord({
    actor,
    eventType: "directory.csv_imported",
    entityType: "employee_directory",
    entityId: organizationId,
    summary: `Imported ${preview.rows.length} employee records from CSV.`,
    metadata: { imported: preview.rows.length },
  }));
  await batch.commit();
  return preview;
}

export async function createRole(input: {
  actor: SessionUser;
  organizationId: string;
  name: string;
  description: string;
  permissions: Permission[];
}) {
  const { actor, organizationId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "roles.manage");
  const base = db.collection("organizations").doc(organizationId);
  const roleRef = base.collection("roles").doc();
  const auditRef = base.collection("auditEvents").doc();
  const batch = db.batch();
  batch.set(roleRef, {
    name: input.name.trim(),
    description: input.description.trim(),
    permissions: input.permissions,
    builtIn: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(auditRef, auditRecord({
    actor,
    eventType: "role.created",
    entityType: "role",
    entityId: roleRef.id,
    summary: `Created role ${input.name.trim()} with ${input.permissions.length} permissions.`,
  }));
  await batch.commit();
  return roleRef.id;
}

export async function createReviewTemplate(input: {
  actor: SessionUser;
  organizationId: string;
  name: string;
  directions: ReviewTemplate["directions"];
  questions: ReviewQuestion[];
}) {
  const { actor, organizationId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const base = db.collection("organizations").doc(organizationId);
  const templateRef = base.collection("reviewTemplates").doc();
  const auditRef = base.collection("auditEvents").doc();
  const batch = db.batch();
  batch.set(templateRef, {
    name: input.name.trim(),
    directions: input.directions,
    questions: input.questions,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(auditRef, auditRecord({
    actor,
    eventType: "review_template.created",
    entityType: "review_template",
    entityId: templateRef.id,
    summary: `Created review template ${input.name.trim()}.`,
    metadata: { questionCount: input.questions.length },
  }));
  await batch.commit();
  return templateRef.id;
}

export async function createReviewCycle(input: {
  actor: SessionUser;
  organizationId: string;
  name: string;
  templateId: string;
  dueDate: string | null;
  peerNominationEnabled: boolean;
  calibrationEnabled: boolean;
}) {
  const { actor, organizationId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const base = db.collection("organizations").doc(organizationId);
  const template = await base.collection("reviewTemplates").doc(input.templateId).get();
  if (!template.exists) throw new LatticeDataError("Choose an existing review template.");
  const cycleRef = base.collection("reviewCycles").doc();
  const auditRef = base.collection("auditEvents").doc();
  const batch = db.batch();
  batch.set(cycleRef, {
    name: input.name.trim(),
    templateId: input.templateId,
    state: "draft",
    dueDate: input.dueDate,
    peerNominationEnabled: input.peerNominationEnabled,
    calibrationEnabled: input.calibrationEnabled,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(auditRef, auditRecord({
    actor,
    eventType: "review_cycle.created",
    entityType: "review_cycle",
    entityId: cycleRef.id,
    summary: `Created draft review cycle ${input.name.trim()}.`,
  }));
  await batch.commit();
  return cycleRef.id;
}

async function loadTransitionContext(
  db: Firestore,
  organizationId: string,
  cycleId: string,
  targetState: ReviewCycleState,
) {
  const base = db.collection("organizations").doc(organizationId);
  const cycleRef = base.collection("reviewCycles").doc(cycleId);
  const [cycle, reviews] = await Promise.all([
    cycleRef.get(),
    cycleRef.collection("reviews").get(),
  ]);
  if (!cycle.exists) throw new LatticeDataError("Review cycle not found.", 404);
  const data = cycle.data()!;
  const preview = previewCycleTransition({
    from: data.state as ReviewCycleState,
    to: targetState,
    config: {
      peerNominationEnabled: Boolean(data.peerNominationEnabled),
      calibrationEnabled: Boolean(data.calibrationEnabled),
    },
    assignedReviews: reviews.size,
    submittedReviews: reviews.docs.filter((review) => review.data().state === "submitted").length,
  });
  return { base, cycleRef, cycle, reviews, preview };
}

export async function transitionReviewCycle(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  targetState: ReviewCycleState;
  dryRun: boolean;
}) {
  const { actor, organizationId, cycleId, targetState, dryRun } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const context = await loadTransitionContext(db, organizationId, cycleId, targetState);
  if (dryRun || !context.preview.canTransition) return context.preview;

  const cycleData = context.cycle.data()!;
  const assignments: Array<{ id: string; data: Record<string, unknown> }> = [];
  if (cycleData.state === "draft") {
    const [template, membersSnapshot] = await Promise.all([
      context.base.collection("reviewTemplates").doc(String(cycleData.templateId)).get(),
      context.base.collection("members").where("status", "==", "active").get(),
    ]);
    if (!template.exists) throw new LatticeDataError("The cycle template no longer exists.");
    const directions = Array.isArray(template.data()?.directions) ? template.data()!.directions as string[] : ["self"];
    const members = membersSnapshot.docs.map(memberFromSnapshot);
    for (const subject of members) {
      if (directions.includes("self") && subject.authUid) {
        assignments.push({
          id: stableId("review", `${subject.id}:${subject.id}:self`),
          data: {
            cycleId,
            templateId: cycleData.templateId,
            subjectId: subject.id,
            reviewerId: subject.id,
            direction: "self",
            state: "draft",
            answers: {},
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
      }
      if (directions.includes("manager") && subject.managerId) {
        assignments.push({
          id: stableId("review", `${subject.id}:${subject.managerId}:manager`),
          data: {
            cycleId,
            templateId: cycleData.templateId,
            subjectId: subject.id,
            reviewerId: subject.managerId,
            direction: "manager",
            state: "draft",
            answers: {},
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
      }
    }
  }

  const auditRef = context.base.collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const freshCycle = await transaction.get(context.cycleRef);
    if (freshCycle.data()?.state !== cycleData.state) {
      throw new LatticeDataError("The cycle changed while the transition was being confirmed.", 409);
    }
    transaction.update(context.cycleRef, {
      state: targetState,
      updatedAt: FieldValue.serverTimestamp(),
      lastTransitionedBy: actor.uid,
    });
    for (const assignment of assignments) {
      transaction.set(context.cycleRef.collection("reviews").doc(assignment.id), assignment.data, { merge: true });
    }
    transaction.set(auditRef, auditRecord({
      actor,
      eventType: context.preview.direction === "reverse" ? "review_cycle.reopened" : "review_cycle.transitioned",
      entityType: "review_cycle",
      entityId: cycleId,
      summary: `Moved ${cycleData.name} from ${cycleData.state} to ${targetState}.`,
      metadata: { from: cycleData.state, to: targetState, assignmentsCreated: assignments.length },
    }));
  });
  return context.preview;
}

export async function saveReview(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  reviewId: string;
  answers: Record<string, string | number>;
  submit: boolean;
}) {
  const { actor, organizationId, cycleId, reviewId, answers, submit } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.submit");
  const base = db.collection("organizations").doc(organizationId);
  const cycleRef = base.collection("reviewCycles").doc(cycleId);
  const reviewRef = cycleRef.collection("reviews").doc(reviewId);
  const auditRef = base.collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const [cycle, review] = await Promise.all([
      transaction.get(cycleRef),
      transaction.get(reviewRef),
    ]);
    if (!review.exists || review.data()?.reviewerId !== member.id) {
      throw new LatticeDataError("This review is not assigned to you.", 403);
    }
    if (cycle.data()?.state !== "review_writing") {
      throw new LatticeDataError("Reviews can only be edited during review writing.", 409);
    }
    if (submit) {
      const template = await transaction.get(
        base.collection("reviewTemplates").doc(String(review.data()?.templateId ?? "")),
      );
      const questions = Array.isArray(template.data()?.questions)
        ? template.data()!.questions as ReviewQuestion[]
        : [];
      const missing = questions.find(
        (question) => question.required && String(answers[question.id] ?? "").trim() === "",
      );
      if (missing) {
        throw new LatticeDataError(`Complete “${missing.prompt}” before submitting.`);
      }
    }
    if (review.data()?.state === "submitted" && !submit) {
      throw new LatticeDataError("This review has already been submitted.", 409);
    }
    transaction.update(reviewRef, {
      answers,
      state: submit ? "submitted" : "draft",
      updatedAt: FieldValue.serverTimestamp(),
      ...(submit ? { submittedAt: FieldValue.serverTimestamp() } : {}),
    });
    if (submit && review.data()?.state !== "submitted") {
      transaction.set(auditRef, auditRecord({
        actor,
        eventType: "review.submitted",
        entityType: "review",
        entityId: reviewId,
        summary: `Submitted a ${review.data()?.direction ?? "performance"} review.`,
        metadata: { cycleId, subjectId: review.data()?.subjectId },
      }));
    }
  });
}
