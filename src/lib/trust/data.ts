import "server-only";

import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import {
  addTenantMember,
  appendAuditEvent,
  listAuditEvents,
  listTenantMembers,
  requireTenantMember,
  tenantCollection,
} from "@/lib/fleet/platform/tenants";

import { buildEvidencePackage, buildProgramExport } from "./export";
import { CONTROL_LIBRARY_VERSION, FRAMEWORKS, getControl, getFramework, libraryControlIds, type FrameworkId } from "./frameworks";
import {
  auditorAccess,
  canMarkNotApplicable,
  libraryMigrationPreview,
  findingOverdue,
  type AuditPeriodRecord,
  type FindingRecord,
  computeReadiness,
  DEFAULT_TRUST_CENTER,
  effectiveControls,
  evidenceExpiry,
  evidenceFreshness,
  generateGapTasks,
  latestPolicyVersion,
  policyReviewDue,
  policyStatus,
  riskLevel,
  riskScore,
  vendorNextReview,
  vendorReviewOverdue,
  type ControlRecord,
  type EvidenceRecord,
  type PolicyRecord,
  type ProgramData,
  type ProgramSettings,
  type RiskRecord,
  type VendorRecord,
} from "./model";
import { getPolicyTemplate, POLICY_TEMPLATES } from "./policy-templates";
import { roleCanPerform, trustActionSchema, type TrustAction } from "./schemas";

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
    adoptedControlIds: Array.isArray(raw?.adoptedControlIds) ? (raw.adoptedControlIds as string[]) : [],
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
  const [auditPeriods, findings] = await Promise.all([
    readAll<AuditPeriodRecord>(tenantId, "auditPeriods"),
    readAll<FindingRecord>(tenantId, "findings"),
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
    auditPeriods: auditPeriods.map((period) => ({ ...period, auditors: period.auditors ?? [] })).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    findings: findings.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
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
      // Keep the program pinned: newly added frameworks join at the current library version, while
      // controls already adopted for other frameworks stay as they are until a migration is applied.
      const kept = (settings.adoptedControlIds ?? []).filter((controlId) => input.frameworkIds.includes(getControl(controlId)?.framework.id ?? ("" as FrameworkId)));
      const keptFrameworks = new Set(kept.map((controlId) => getControl(controlId)!.framework.id));
      const joining = libraryControlIds(input.frameworkIds.filter((frameworkId) => !keptFrameworks.has(frameworkId)));
      await settingsRef.set(
        {
          frameworkIds: input.frameworkIds,
          libraryVersion: settings.adoptedControlIds?.length ? settings.libraryVersion : CONTROL_LIBRARY_VERSION,
          adoptedControlIds: [...kept, ...joining],
        },
        { merge: true },
      );
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
        reviewStatus: "pending",
        reviewedBy: "",
        reviewedAt: "",
        reviewNote: "",
      };
      await ref.set(record);
      await audit("evidence.added", { type: "evidence", id: ref.id }, { title: input.title, controlIds: record.controlIds });
      return { ok: true, id: ref.id };
    }
    case "reviewEvidence": {
      const ref = col(tenantId, "evidence").doc(input.evidenceId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Evidence not found.", 404);
      if (input.decision === "rejected" && input.note.length < 5) {
        throw new FleetError("Say why the evidence is rejected so the owner can fix it.", 400);
      }
      await ref.update({ reviewStatus: input.decision, reviewedBy: actor.email, reviewedAt: now, reviewNote: input.note });
      await audit(`evidence.${input.decision}`, { type: "evidence", id: input.evidenceId }, {
        note: input.note,
        selfReview: snapshot.get("createdBy") === actor.email,
      });
      return { ok: true };
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
      if (input.treatment === "accept" && input.treatmentPlan.length < 10) {
        throw new FleetError("Record why the risk is accepted and who accepted it in the treatment plan.", 400);
      }
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
    case "saveAuditPeriod": {
      if (input.endDate < input.startDate) throw new FleetError("The audit period must end after it starts.", 400);
      if (!settings.frameworkIds.includes(input.frameworkId as FrameworkId)) {
        throw new FleetError("Pick a framework that is part of this program.", 400);
      }
      const ref = input.auditPeriodId ? col(tenantId, "auditPeriods").doc(input.auditPeriodId) : col(tenantId, "auditPeriods").doc();
      const existing = input.auditPeriodId ? await ref.get() : null;
      if (input.auditPeriodId && !existing?.exists) throw new FleetError("Audit period not found.", 404);
      await ref.set({
        name: input.name,
        frameworkId: input.frameworkId,
        startDate: input.startDate,
        endDate: input.endDate,
        auditorFirm: input.auditorFirm,
        status: input.status,
        auditors: (existing?.get("auditors") as AuditPeriodRecord["auditors"] | undefined) ?? [],
        createdAt: (existing?.get("createdAt") as string | undefined) ?? now,
      });
      await audit(input.auditPeriodId ? "audit_period.updated" : "audit_period.created", { type: "audit_period", id: ref.id }, {
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      return { ok: true, id: ref.id };
    }
    case "grantAuditorAccess":
    case "revokeAuditorAccess": {
      const ref = col(tenantId, "auditPeriods").doc(input.auditPeriodId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new FleetError("Audit period not found.", 404);
      const email = input.email.toLowerCase();
      const others = ((snapshot.get("auditors") as AuditPeriodRecord["auditors"] | undefined) ?? []).filter((grant) => grant.email !== email);
      if (input.action === "grantAuditorAccess") {
        if (input.expiresAt < now.slice(0, 10)) throw new FleetError("Access must expire today or later.", 400);
        await ref.update({ auditors: [...others, { email, expiresAt: input.expiresAt, grantedBy: actor.email, grantedAt: now }] });
        await audit("auditor_access.granted", { type: "audit_period", id: input.auditPeriodId }, { email, expiresAt: input.expiresAt });
      } else {
        // Revoking keeps an already-expired grant so the person stays locked out.
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        await ref.update({ auditors: [...others, { email, expiresAt: yesterday, grantedBy: actor.email, grantedAt: now }] });
        await audit("auditor_access.revoked", { type: "audit_period", id: input.auditPeriodId }, { email });
      }
      return { ok: true };
    }
    case "saveFinding": {
      for (const controlId of input.controlIds) assertControlInProgram(settings, controlId);
      if (input.status === "risk_accepted" && input.remediation.length < 10) {
        throw new FleetError("Record why the finding's risk is accepted in the remediation notes.", 400);
      }
      const ref = input.findingId ? col(tenantId, "findings").doc(input.findingId) : col(tenantId, "findings").doc();
      const existing = input.findingId ? await ref.get() : null;
      if (input.findingId && !existing?.exists) throw new FleetError("Finding not found.", 404);
      const record: Omit<FindingRecord, "id"> = {
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: input.status,
        controlIds: input.controlIds,
        auditPeriodId: input.auditPeriodId,
        ownerEmail: input.ownerEmail,
        dueDate: input.dueDate,
        remediation: input.remediation,
        createdAt: (existing?.get("createdAt") as string | undefined) ?? now,
        createdBy: (existing?.get("createdBy") as string | undefined) ?? actor.email,
        updatedAt: now,
      };
      await ref.set(record);
      await audit(input.findingId ? "finding.updated" : "finding.created", { type: "finding", id: ref.id }, {
        severity: input.severity,
        status: input.status,
        overdue: findingOverdue(record),
      });
      return { ok: true, id: ref.id };
    }
    case "applyLibraryMigration": {
      const program = await loadProgram(tenantId);
      const preview = libraryMigrationPreview(program);
      if (preview.toVersion !== input.toVersion) throw new FleetError("The control library changed; review the preview again.", 409);
      if (preview.upToDate) return { ok: true };
      await settingsRef.set({ libraryVersion: preview.toVersion, adoptedControlIds: libraryControlIds(settings.frameworkIds) }, { merge: true });
      await audit("program.library_migrated", { type: "program", id: SETTINGS_DOC }, {
        fromVersion: preview.fromVersion,
        toVersion: preview.toVersion,
        added: preview.added.map((control) => control.id),
        removed: preview.removed.map((control) => control.id),
      });
      return { ok: true };
    }
    case "inviteMember": {
      // addTenantMember re-checks the privileged role and writes its own audit event.
      return { ok: true, member: await addTenantMember(TRUST, tenantId, actor, { email: input.email, role: input.role }) };
    }
  }
}

// ---------------------------------------------------------------- route-level services

/**
 * requireTenantMember plus auditor-expiry enforcement: a viewer whose auditor access has
 * expired is refused server-side, whatever the browser sends.
 */
export async function requireTrustMember(tenantId: string, user: FleetUser) {
  const membership = await requireTenantMember(TRUST, tenantId, user);
  if (membership.role === "viewer") {
    const periods = await readAll<AuditPeriodRecord>(tenantId, "auditPeriods");
    const access = auditorAccess(user.email, periods);
    if (access.state === "expired") {
      throw new FleetError(`Your auditor access to this workspace expired on ${access.expiresAt}.`, 403);
    }
  }
  return membership;
}

/** GET /api/trust/tenants/[tenantId]: the full workspace snapshot for a verified member. */
export async function getTrustSnapshot(tenantId: string, user: FleetUser) {
  const { tenant, role } = await requireTrustMember(tenantId, user);
  const [program, members, audit] = await Promise.all([
    loadProgram(tenantId),
    listTenantMembers(TRUST, tenantId),
    listAuditEvents(TRUST, tenantId, 100),
  ]);
  const now = new Date();
  return {
    tenant: { id: tenant.id, name: tenant.name },
    role,
    me: { email: user.email, name: user.name },
    libraryVersion: CONTROL_LIBRARY_VERSION,
    frameworks: FRAMEWORKS.map(({ id, name, summary, disclaimer, version, controls }) => ({
      id,
      name,
      summary,
      disclaimer,
      version,
      controlCount: controls.length,
    })),
    policyTemplates: POLICY_TEMPLATES.map(({ id, title, summary }) => ({ id, title, summary })),
    settings: program.settings,
    people: program.memberEmails,
    libraryMigration: libraryMigrationPreview(program),
    readiness: computeReadiness(program, now),
    tasks: generateGapTasks(program, now),
    controls: effectiveControls(program, now),
    evidence: program.evidence.map((item) => ({ ...item, freshness: evidenceFreshness(item, now), expiry: evidenceExpiry(item) })),
    policies: program.policies.map((policy) => ({ ...policy, status: policyStatus(policy), reviewDue: policyReviewDue(policy) })),
    risks: program.risks.map((risk) => {
      const score = riskScore(risk.likelihood, risk.impact);
      return { ...risk, score, level: riskLevel(score) };
    }),
    vendors: program.vendors.map((vendor) => ({ ...vendor, nextReview: vendorNextReview(vendor), overdue: vendorReviewOverdue(vendor, now) })),
    auditPeriods: program.auditPeriods ?? [],
    findings: (program.findings ?? []).map((finding) => ({ ...finding, overdue: findingOverdue(finding, now) })),
    members: members.filter((member) => member.status === "active"),
    audit,
  };
}

/** POST /api/trust/tenants/[tenantId]: membership, then validation, then role check, then write + audit. */
export async function runTrustAction(tenantId: string, user: FleetUser, raw: unknown) {
  const { role } = await requireTrustMember(tenantId, user);
  const input = trustActionSchema.parse(raw);
  if (!roleCanPerform(role, input.action)) {
    throw new FleetError("Your role does not allow this action.", 403);
  }
  return applyTrustAction(tenantId, user, input);
}

/** GET /api/trust/tenants/[tenantId]/export: full versioned export, or one framework's evidence package. */
export async function buildTrustExport(tenantId: string, user: FleetUser, packageFramework: string | null) {
  const { tenant } = await requireTrustMember(tenantId, user);
  const program = await loadProgram(tenantId);
  if (packageFramework) {
    const framework = getFramework(packageFramework);
    if (!framework || !program.settings.frameworkIds.includes(framework.id)) {
      throw new FleetError("That framework is not part of this program.", 400);
    }
    return {
      kind: "package" as const,
      filename: `trust-${framework.id}-evidence-package`,
      body: toPortable(buildEvidencePackage(program, framework.id, { tenantId, tenantName: tenant.name, exportedBy: user.email })),
    };
  }
  const [members, audit] = await Promise.all([listTenantMembers(TRUST, tenantId), listAuditEvents(TRUST, tenantId, 1000)]);
  const files = buildProgramExport(program, { members, audit });
  return {
    kind: "workspace" as const,
    filename: "trust-export",
    body: {
      manifest: buildExportManifest(TRUST, tenantId, files.map(({ path, schema, records }) => ({ path, schema, records: records.length }))),
      tenant: { id: tenantId, name: tenant.name },
      files: Object.fromEntries(files.map((file) => [file.path, { schema: file.schema, records: toPortable(file.records) }])),
    },
  };
}
