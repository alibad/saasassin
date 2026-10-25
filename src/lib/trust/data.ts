import "server-only";

import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import {
  addTenantMember,
  appendAuditEvent,
  listTenantMembers,
  tenantCollection,
} from "@/lib/fleet/platform/tenants";

import { CONTROL_LIBRARY_VERSION, getControl, getFramework, type FrameworkId } from "./frameworks";
import {
  canMarkNotApplicable,
  DEFAULT_TRUST_CENTER,
  latestPolicyVersion,
  type ControlRecord,
  type EvidenceRecord,
  type PolicyRecord,
  type ProgramData,
  type ProgramSettings,
  type RiskRecord,
  type VendorRecord,
} from "./model";
import { getPolicyTemplate } from "./policy-templates";
import type { TrustAction } from "./schemas";

export const TRUST = "trust";
const SETTINGS_DOC = "program";

const col = (tenantId: string, name: string) => tenantCollection(TRUST, tenantId, name);

function normaliseSettings(raw: Record<string, unknown> | undefined): ProgramSettings {
  const frameworkIds = Array.isArray(raw?.frameworkIds)
    ? (raw.frameworkIds as string[]).filter((id): id is FrameworkId => Boolean(getFramework(id)))
    : [];
  return {
    frameworkIds,
    employeeEmails: Array.isArray(raw?.employeeEmails) ? (raw.employeeEmails as string[]) : [],
    libraryVersion: typeof raw?.libraryVersion === "string" ? raw.libraryVersion : CONTROL_LIBRARY_VERSION,
    trustCenter: { ...DEFAULT_TRUST_CENTER, ...((raw?.trustCenter as object | undefined) ?? {}) },
  };
}

async function readAll<T>(tenantId: string, name: string) {
  const snapshot = await col(tenantId, name).get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as T), id: doc.id }));
}

export async function loadProgram(tenantId: string): Promise<ProgramData> {
  const [settingsDoc, controls, evidence, policies, risks, vendors, members] = await Promise.all([
    col(tenantId, "settings").doc(SETTINGS_DOC).get(),
    readAll<ControlRecord>(tenantId, "controls"),
    readAll<EvidenceRecord>(tenantId, "evidence"),
    readAll<PolicyRecord>(tenantId, "policies"),
    readAll<RiskRecord>(tenantId, "risks"),
    readAll<VendorRecord>(tenantId, "vendors"),
    listTenantMembers(TRUST, tenantId),
  ]);
  const settings = normaliseSettings(settingsDoc.data());
  const people = [
    ...members.filter((member) => member.status === "active" && member.email).map((member) => member.email.toLowerCase()),
    ...settings.employeeEmails.map((email) => email.toLowerCase()),
  ];
  return {
    settings,
    controls,
    evidence: evidence.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    policies: policies.sort((a, b) => a.title.localeCompare(b.title)),
    risks: risks.sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact),
    vendors: vendors.sort((a, b) => a.name.localeCompare(b.name)),
    memberEmails: [...new Set(people)],
  };
}

function assertControlInProgram(settings: ProgramSettings, controlId: string) {
  const found = getControl(controlId);
  if (!found || !settings.frameworkIds.includes(found.framework.id)) {
    throw new FleetError(`Control ${controlId} is not part of this program.`, 400);
  }
}

/** Applies one validated action. Caller has already authenticated, checked membership and role. */
export async function applyTrustAction(tenantId: string, actor: FleetUser, input: TrustAction) {
  const now = new Date().toISOString();
  const audit = (action: string, target: { type: string; id: string }, details: Record<string, unknown> = {}) =>
    appendAuditEvent(TRUST, tenantId, actor, action, target, details);
  const settingsRef = col(tenantId, "settings").doc(SETTINGS_DOC);
  const settings = normaliseSettings((await settingsRef.get()).data());

  switch (input.action) {
    case "setFrameworks": {
      await settingsRef.set({ frameworkIds: input.frameworkIds, libraryVersion: CONTROL_LIBRARY_VERSION }, { merge: true });
      await audit("program.frameworks_selected", { type: "program", id: SETTINGS_DOC }, {
        frameworkIds: input.frameworkIds,
        libraryVersion: CONTROL_LIBRARY_VERSION,
      });
      return { ok: true };
    }
    case "updateControl": {
      assertControlInProgram(settings, input.controlId);
      if (input.status === "not_applicable" && !canMarkNotApplicable(input.naJustification)) {
        throw new FleetError("Explain why the control is not applicable (at least 10 characters).", 400);
      }
      const found = getControl(input.controlId)!;
      const record: Omit<ControlRecord, "id"> = {
        frameworkId: found.framework.id,
        ownerEmail: input.ownerEmail,
        status: input.status,
        naJustification: input.status === "not_applicable" ? input.naJustification : "",
        notes: input.notes,
        updatedAt: now,
        updatedBy: actor.email,
      };
      await col(tenantId, "controls").doc(input.controlId).set(record);
      await audit("control.updated", { type: "control", id: input.controlId }, {
        status: input.status,
        ownerEmail: input.ownerEmail,
      });
      return { ok: true };
    }
    case "addEvidence": {
      for (const controlId of input.controlIds) assertControlInProgram(settings, controlId);
      if (input.kind === "link" && !/^https?:\/\//i.test(input.url)) {
        throw new FleetError("Evidence links must start with http:// or https://.", 400);
      }
      if (input.kind === "text" && input.text.length < 2) throw new FleetError("Paste the evidence text.", 400);
      const ref = col(tenantId, "evidence").doc();
      const record: Omit<EvidenceRecord, "id"> = {
        title: input.title,
        description: input.description,
        kind: input.kind,
        url: input.kind === "link" ? input.url : "",
        text: input.kind === "text" ? input.text : "",
        controlIds: [...new Set(input.controlIds)],
        collectedAt: input.collectedAt,
        cadence: input.cadence,
        expiresAt: input.expiresAt,
        createdAt: now,
        createdBy: actor.email,
      };
      await ref.set(record);
      await audit("evidence.added", { type: "evidence", id: ref.id }, { title: input.title, controlIds: record.controlIds });
      return { ok: true, id: ref.id };
    }
    case "deleteEvidence": {
      const ref = col(tenantId, "evidence").doc(input.evidenceId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Evidence not found.", 404);
      await ref.delete();
      await audit("evidence.removed", { type: "evidence", id: input.evidenceId }, { title: snapshot.get("title") });
      return { ok: true };
    }
    case "createPolicy": {
      const template = getPolicyTemplate(input.templateId);
      const body = (template?.body ?? `# ${input.title}\n\nOwner: {{owner}}\n\nDescribe the policy here.`).replaceAll(
        "{{owner}}",
        input.ownerEmail || "Unassigned",
      );
      const ref = col(tenantId, "policies").doc();
      const record: Omit<PolicyRecord, "id"> = {
        title: input.title,
        templateId: template?.id ?? "blank",
        ownerEmail: input.ownerEmail,
        reviewCadence: input.reviewCadence,
        versions: [{ version: 1, body, createdAt: now, createdBy: actor.email, approvedAt: null, approvedBy: null }],
        acknowledgements: [],
        createdAt: now,
      };
      await ref.set(record);
      await audit("policy.created", { type: "policy", id: ref.id }, { title: input.title, templateId: record.templateId });
      return { ok: true, id: ref.id };
    }
    case "revisePolicy": {
      const ref = col(tenantId, "policies").doc(input.policyId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Policy not found.", 404);
      const policy = snapshot.data() as PolicyRecord;
      const latest = latestPolicyVersion(policy);
      if (latest && latest.body === input.body) throw new FleetError("No changes to save.", 400);
      // Versions are append-only: approved text is never rewritten in place.
      const version = (latest?.version ?? 0) + 1;
      await ref.update({
        versions: [...policy.versions, { version, body: input.body, createdAt: now, createdBy: actor.email, approvedAt: null, approvedBy: null }],
      });
      await audit("policy.revised", { type: "policy", id: input.policyId }, { version });
      return { ok: true };
    }
    case "approvePolicy": {
      const ref = col(tenantId, "policies").doc(input.policyId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Policy not found.", 404);
      const policy = snapshot.data() as PolicyRecord;
      const latest = latestPolicyVersion(policy);
      if (!latest || latest.version !== input.version) throw new FleetError("Only the latest version can be approved.", 409);
      if (latest.approvedAt) throw new FleetError("This version is already approved.", 409);
      await ref.update({
        versions: policy.versions.map((entry) =>
          entry.version === input.version ? { ...entry, approvedAt: now, approvedBy: actor.email } : entry,
        ),
      });
      await audit("policy.approved", { type: "policy", id: input.policyId }, { version: input.version });
      return { ok: true };
    }
    case "acknowledgePolicy": {
      const ref = col(tenantId, "policies").doc(input.policyId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Policy not found.", 404);
      const policy = snapshot.data() as PolicyRecord;
      const approved = policy.versions.filter((entry) => entry.approvedAt).sort((a, b) => b.version - a.version)[0];
      if (!approved) throw new FleetError("Only approved policies can be acknowledged.", 409);
      const email = actor.email.toLowerCase();
      if (policy.acknowledgements.some((entry) => entry.email.toLowerCase() === email && entry.version === approved.version)) {
        return { ok: true };
      }
      await ref.update({
        acknowledgements: [...policy.acknowledgements, { email, version: approved.version, acknowledgedAt: now }],
      });
      await audit("policy.acknowledged", { type: "policy", id: input.policyId }, { version: approved.version });
      return { ok: true };
    }
    case "saveRisk": {
      for (const controlId of input.controlIds) assertControlInProgram(settings, controlId);
      const ref = input.riskId ? col(tenantId, "risks").doc(input.riskId) : col(tenantId, "risks").doc();
      const existing = input.riskId ? await ref.get() : null;
      if (input.riskId && !existing?.exists) throw new FleetError("Risk not found.", 404);
      const record: Omit<RiskRecord, "id"> = {
        title: input.title,
        description: input.description,
        likelihood: input.likelihood,
        impact: input.impact,
        treatment: input.treatment,
        treatmentPlan: input.treatmentPlan,
        ownerEmail: input.ownerEmail,
        status: input.status,
        controlIds: input.controlIds,
        createdAt: (existing?.get("createdAt") as string | undefined) ?? now,
        updatedAt: now,
      };
      await ref.set(record);
      await audit(input.riskId ? "risk.updated" : "risk.created", { type: "risk", id: ref.id }, {
        score: input.likelihood * input.impact,
        status: input.status,
      });
      return { ok: true, id: ref.id };
    }
    case "saveVendor": {
      const ref = input.vendorId ? col(tenantId, "vendors").doc(input.vendorId) : col(tenantId, "vendors").doc();
      const existing = input.vendorId ? await ref.get() : null;
      if (input.vendorId && !existing?.exists) throw new FleetError("Vendor not found.", 404);
      const record: Omit<VendorRecord, "id"> = {
        name: input.name,
        service: input.service,
        tier: input.tier,
        dataAccess: input.dataAccess,
        ownerEmail: input.ownerEmail,
        lastReviewedAt: input.lastReviewedAt,
        reviewCadence: input.reviewCadence,
        createdAt: (existing?.get("createdAt") as string | undefined) ?? now,
      };
      await ref.set(record);
      await audit(input.vendorId ? "vendor.updated" : "vendor.created", { type: "vendor", id: ref.id }, { tier: input.tier });
      return { ok: true, id: ref.id };
    }
    case "deleteVendor": {
      const ref = col(tenantId, "vendors").doc(input.vendorId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Vendor not found.", 404);
      await ref.delete();
      await audit("vendor.removed", { type: "vendor", id: input.vendorId }, { name: snapshot.get("name") });
      return { ok: true };
    }
    case "saveTrustCenter": {
      const { action: _action, ...trustCenter } = input;
      void _action;
      await settingsRef.set({ trustCenter: { ...trustCenter, updatedAt: now } }, { merge: true });
      await audit("trust_center.updated", { type: "trust_center", id: SETTINGS_DOC }, {
        published: input.published,
        showReadiness: input.showReadiness,
        showControlCategories: input.showControlCategories,
        publishedPolicies: input.publishedPolicyIds.length,
      });
      return { ok: true };
    }
    case "setEmployees": {
      const emails = [...new Set(input.emails.map((email) => email.toLowerCase()))];
      await settingsRef.set({ employeeEmails: emails }, { merge: true });
      await audit("program.people_in_scope_updated", { type: "program", id: SETTINGS_DOC }, { count: emails.length });
      return { ok: true };
    }
    case "recordAcknowledgement": {
      const ref = col(tenantId, "policies").doc(input.policyId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Policy not found.", 404);
      const policy = snapshot.data() as PolicyRecord;
      const approved = policy.versions.filter((entry) => entry.approvedAt).sort((a, b) => b.version - a.version)[0];
      if (!approved) throw new FleetError("Only approved policies can be acknowledged.", 409);
      const email = input.email.toLowerCase();
      if (policy.acknowledgements.some((entry) => entry.email.toLowerCase() === email && entry.version === approved.version)) {
        return { ok: true };
      }
      await ref.update({
        acknowledgements: [...policy.acknowledgements, { email, version: approved.version, acknowledgedAt: now, recordedBy: actor.email }],
      });
      await audit("policy.acknowledgement_recorded", { type: "policy", id: input.policyId }, { version: approved.version, email });
      return { ok: true };
    }
    case "inviteMember": {
      // addTenantMember re-checks the privileged role and writes its own audit event.
      return { ok: true, member: await addTenantMember(TRUST, tenantId, actor, { email: input.email, role: input.role }) };
    }
  }
}
