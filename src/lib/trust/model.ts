/** Pure domain model for SaaSassin Trust. No server or browser dependencies, so it is unit-testable. */

import { CONTROL_LIBRARY_VERSION, FRAMEWORKS, getFramework, type Framework, type FrameworkId } from "./frameworks";

export const CONTROL_STATUSES = ["not_started", "in_progress", "implemented", "needs_evidence", "not_applicable"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];
export const CONTROL_STATUS_LABELS: Record<ControlStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  implemented: "Implemented",
  needs_evidence: "Needs evidence",
  not_applicable: "Not applicable",
};

export const REVIEW_CADENCES = ["none", "monthly", "quarterly", "semiannual", "annual"] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];
export const CADENCE_DAYS: Record<ReviewCadence, number | null> = {
  none: null,
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  annual: 365,
};
export const CADENCE_LABELS: Record<ReviewCadence, string> = {
  none: "No expiry",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  annual: "Annually",
};

export const EXPIRING_SOON_DAYS = 14;

export type ControlRecord = {
  id: string; // library control id
  frameworkId: FrameworkId;
  ownerEmail: string;
  status: Exclude<ControlStatus, "needs_evidence"> | "needs_evidence";
  naJustification: string;
  notes: string;
  updatedAt: string;
  updatedBy: string;
};

export type EvidenceRecord = {
  id: string;
  title: string;
  description: string;
  kind: "link" | "text";
  url: string;
  text: string;
  controlIds: string[];
  collectedAt: string; // YYYY-MM-DD
  cadence: ReviewCadence;
  expiresAt: string; // optional explicit YYYY-MM-DD, "" when derived from cadence
  createdAt: string;
  createdBy: string;
  /** Review provenance. Missing on older records, which are treated as pending. */
  reviewStatus?: EvidenceReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export type EvidenceReviewStatus = "pending" | "accepted" | "rejected";

export type PolicyVersion = {
  version: number;
  body: string;
  createdAt: string;
  createdBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

export type PolicyAcknowledgement = { email: string; version: number; acknowledgedAt: string; recordedBy?: string };

export type PolicyRecord = {
  id: string;
  title: string;
  templateId: string;
  ownerEmail: string;
  reviewCadence: ReviewCadence;
  versions: PolicyVersion[];
  acknowledgements: PolicyAcknowledgement[];
  createdAt: string;
};

export const RISK_TREATMENTS = ["mitigate", "accept", "transfer", "avoid"] as const;
export type RiskTreatment = (typeof RISK_TREATMENTS)[number];
export type RiskRecord = {
  id: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  treatment: RiskTreatment;
  treatmentPlan: string;
  ownerEmail: string;
  status: "open" | "closed";
  controlIds: string[];
  createdAt: string;
  updatedAt: string;
};

export const VENDOR_TIERS = ["low", "medium", "high", "critical"] as const;
export type VendorTier = (typeof VENDOR_TIERS)[number];
export type VendorRecord = {
  id: string;
  name: string;
  service: string;
  tier: VendorTier;
  dataAccess: string;
  ownerEmail: string;
  lastReviewedAt: string; // YYYY-MM-DD or ""
  reviewCadence: ReviewCadence;
  createdAt: string;
};

export type TrustCenterSettings = {
  published: boolean;
  displayName: string;
  headline: string;
  contactEmail: string;
  showFrameworks: boolean;
  showReadiness: boolean;
  showControlCategories: boolean;
  publishedPolicyIds: string[];
  updatedAt: string;
};

export type ProgramSettings = {
  frameworkIds: FrameworkId[];
  /** People in scope for policy acknowledgement who are not workspace members (e.g. all employees). */
  employeeEmails: string[];
  /**
   * Control ids the program adopted at `libraryVersion`. The program stays pinned to this set until
   * an admin previews and applies a library migration. Empty for programs created before pinning.
   */
  adoptedControlIds?: string[];
  libraryVersion: string;
  trustCenter: TrustCenterSettings;
};

export const DEFAULT_TRUST_CENTER: TrustCenterSettings = {
  published: false,
  displayName: "",
  headline: "",
  contactEmail: "",
  showFrameworks: true,
  showReadiness: false,
  showControlCategories: false,
  publishedPolicyIds: [],
  updatedAt: "",
};

const DAY_MS = 86_400_000;

function parseDay(value: string) {
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

export function addDays(day: string, days: number) {
  const time = parseDay(day);
  if (time === null) return "";
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- evidence

export type EvidenceFreshness = "fresh" | "expiring_soon" | "expired" | "no_expiry";

export function evidenceExpiry(evidence: Pick<EvidenceRecord, "collectedAt" | "cadence" | "expiresAt">) {
  if (evidence.expiresAt) return evidence.expiresAt.slice(0, 10);
  const days = CADENCE_DAYS[evidence.cadence];
  if (days === null) return null;
  return addDays(evidence.collectedAt, days) || null;
}

export function evidenceFreshness(
  evidence: Pick<EvidenceRecord, "collectedAt" | "cadence" | "expiresAt">,
  now = new Date(),
): EvidenceFreshness {
  const expiry = evidenceExpiry(evidence);
  if (!expiry) return "no_expiry";
  const expiryTime = parseDay(expiry);
  const nowTime = parseDay(today(now));
  if (expiryTime === null || nowTime === null) return "expired";
  if (expiryTime <= nowTime) return "expired";
  if (expiryTime - nowTime <= EXPIRING_SOON_DAYS * DAY_MS) return "expiring_soon";
  return "fresh";
}

/** Rejected evidence never supports a control, whatever its dates say. */
export function evidenceSupportsControls(item: Pick<EvidenceRecord, "reviewStatus">) {
  return item.reviewStatus !== "rejected";
}

export function isEvidenceCurrent(freshness: EvidenceFreshness) {
  return freshness !== "expired";
}

// ---------------------------------------------------------------- controls

/**
 * Effective control status. A control marked implemented still needs proof: with no current
 * evidence linked it shows "needs evidence". Any control whose linked evidence has all expired
 * also falls back to "needs evidence". Not-applicable controls are excluded from coverage.
 */
export function deriveControlStatus(
  control: Pick<ControlRecord, "id" | "status">,
  evidence: Array<Pick<EvidenceRecord, "controlIds" | "collectedAt" | "cadence" | "expiresAt" | "reviewStatus">>,
  now = new Date(),
): ControlStatus {
  if (control.status === "not_applicable") return "not_applicable";
  const linked = evidence.filter((item) => item.controlIds.includes(control.id) && evidenceSupportsControls(item));
  const current = linked.filter((item) => isEvidenceCurrent(evidenceFreshness(item, now)));
  if (linked.length > 0 && current.length === 0) return "needs_evidence";
  if (control.status === "implemented" && current.length === 0) return "needs_evidence";
  return control.status;
}

export function canMarkNotApplicable(justification: string) {
  return justification.trim().length >= 10;
}

// ---------------------------------------------------------------- risks

export type RiskLevel = "low" | "medium" | "high" | "critical";

export function riskScore(likelihood: number, impact: number) {
  const clamp = (value: number) => Math.min(5, Math.max(1, Math.round(value)));
  return clamp(likelihood) * clamp(impact);
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 16) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

// ---------------------------------------------------------------- policies

export function latestPolicyVersion(policy: Pick<PolicyRecord, "versions">) {
  return policy.versions.reduce<PolicyVersion | null>(
    (latest, entry) => (!latest || entry.version > latest.version ? entry : latest),
    null,
  );
}

export function currentApprovedVersion(policy: Pick<PolicyRecord, "versions">) {
  return policy.versions
    .filter((entry) => entry.approvedAt)
    .reduce<PolicyVersion | null>((latest, entry) => (!latest || entry.version > latest.version ? entry : latest), null);
}

export function policyStatus(policy: Pick<PolicyRecord, "versions">) {
  const latest = latestPolicyVersion(policy);
  const approved = currentApprovedVersion(policy);
  if (!approved) return "draft" as const;
  if (latest && latest.version > approved.version) return "revision_pending" as const;
  return "approved" as const;
}

export function policyReviewDue(policy: Pick<PolicyRecord, "versions" | "reviewCadence">) {
  const approved = currentApprovedVersion(policy);
  const days = CADENCE_DAYS[policy.reviewCadence];
  if (!approved?.approvedAt || days === null) return null;
  return addDays(approved.approvedAt.slice(0, 10), days);
}

export function acknowledgementCoverage(
  policy: Pick<PolicyRecord, "versions" | "acknowledgements">,
  memberEmails: string[],
) {
  const approved = currentApprovedVersion(policy);
  const people = [...new Set(memberEmails.map((email) => email.toLowerCase()))];
  if (!approved || people.length === 0) return { acknowledged: 0, total: people.length, pending: people };
  const acked = new Set(
    policy.acknowledgements
      .filter((entry) => entry.version === approved.version)
      .map((entry) => entry.email.toLowerCase()),
  );
  const pending = people.filter((email) => !acked.has(email));
  return { acknowledged: people.length - pending.length, total: people.length, pending };
}

// ---------------------------------------------------------------- vendors

export function vendorNextReview(vendor: Pick<VendorRecord, "lastReviewedAt" | "reviewCadence">) {
  const days = CADENCE_DAYS[vendor.reviewCadence];
  if (!vendor.lastReviewedAt || days === null) return null;
  return addDays(vendor.lastReviewedAt, days);
}

export function vendorReviewOverdue(vendor: Pick<VendorRecord, "lastReviewedAt" | "reviewCadence">, now = new Date()) {
  if (!vendor.lastReviewedAt) return vendor.reviewCadence !== "none";
  const next = vendorNextReview(vendor);
  return next !== null && next <= today(now);
}

// ---------------------------------------------------------------- audits and findings

export const AUDIT_PERIOD_STATUSES = ["planned", "fieldwork", "closed"] as const;
export type AuditPeriodStatus = (typeof AUDIT_PERIOD_STATUSES)[number];
export type AuditorGrant = { email: string; expiresAt: string; grantedBy: string; grantedAt: string };
export type AuditPeriodRecord = {
  id: string;
  name: string;
  frameworkId: string;
  startDate: string;
  endDate: string;
  auditorFirm: string;
  status: AuditPeriodStatus;
  auditors: AuditorGrant[];
  createdAt: string;
};

export type AuditorAccess = { state: "none" } | { state: "active"; expiresAt: string } | { state: "expired"; expiresAt: string };

/**
 * Auditor access for an email across all audit periods. Viewers with no grant are ordinary
 * read-only members. Once any grant exists, access lasts until the latest grant's expiry date
 * (inclusive) and is refused afterwards.
 */
export function auditorAccess(email: string, periods: Array<Pick<AuditPeriodRecord, "auditors">>, now = new Date()): AuditorAccess {
  const needle = email.toLowerCase();
  const grants = periods.flatMap((period) => period.auditors ?? []).filter((grant) => grant.email.toLowerCase() === needle);
  if (grants.length === 0) return { state: "none" };
  const latest = grants.map((grant) => grant.expiresAt).sort().at(-1)!;
  return latest >= today(now) ? { state: "active", expiresAt: latest } : { state: "expired", expiresAt: latest };
}

export const FINDING_SEVERITIES = ["low", "medium", "high"] as const;
export const FINDING_STATUSES = ["open", "in_remediation", "resolved", "risk_accepted"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  in_remediation: "In remediation",
  resolved: "Resolved",
  risk_accepted: "Risk accepted",
};
export type FindingRecord = {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: FindingStatus;
  controlIds: string[];
  auditPeriodId: string;
  ownerEmail: string;
  dueDate: string;
  remediation: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export function findingOverdue(finding: Pick<FindingRecord, "status" | "dueDate">, now = new Date()) {
  const closed = finding.status === "resolved" || finding.status === "risk_accepted";
  return !closed && Boolean(finding.dueDate) && finding.dueDate < today(now);
}

// ---------------------------------------------------------------- access reviews

export type SystemUser = { email: string; role: string };
export type AccessReview = {
  quarter: string; // e.g. 2026-Q4
  reviewedAt: string;
  reviewedBy: string;
  kept: string[];
  removed: string[];
  notes: string;
};
export type SystemRecord = {
  id: string;
  name: string;
  description: string;
  ownerEmail: string;
  users: SystemUser[];
  reviews: AccessReview[];
  createdAt: string;
};

export function quarterOf(now = new Date()) {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

/** A system needs a review each calendar quarter until one is signed off for that quarter. */
export function accessReviewDue(system: Pick<SystemRecord, "reviews">, now = new Date()) {
  return !system.reviews.some((review) => review.quarter === quarterOf(now));
}

// ---------------------------------------------------------------- readiness

export type ProgramData = {
  settings: ProgramSettings;
  controls: ControlRecord[];
  evidence: EvidenceRecord[];
  policies: PolicyRecord[];
  risks: RiskRecord[];
  vendors: VendorRecord[];
  auditPeriods?: AuditPeriodRecord[];
  findings?: FindingRecord[];
  systems?: SystemRecord[];
  /** Everyone expected to acknowledge policies: active members plus employees in scope. */
  memberEmails: string[];
};

export type EffectiveControl = {
  id: string;
  frameworkId: FrameworkId;
  title: string;
  description: string;
  category: string;
  requirementRefs: string[];
  suggestedEvidence: string;
  ownerEmail: string;
  storedStatus: ControlStatus;
  status: ControlStatus;
  naJustification: string;
  notes: string;
  evidenceCount: number;
  currentEvidenceCount: number;
};

/** Library controls for the selected frameworks merged with the tenant's stored control state. */
export type LibraryMigration = {
  fromVersion: string;
  toVersion: string;
  upToDate: boolean;
  baselineRecorded: boolean;
  added: Array<{ id: string; frameworkId: string; ref: string; title: string }>;
  removed: Array<{ id: string; hasRecords: boolean }>;
  unchanged: number;
};

/** Diff between the control ids a program adopted and the current library for its frameworks. */
export function libraryMigrationPreview(
  data: Pick<ProgramData, "settings" | "controls" | "evidence">,
  frameworks: Framework[] = FRAMEWORKS,
  currentVersion = CONTROL_LIBRARY_VERSION,
): LibraryMigration {
  const library = frameworks
    .filter((framework) => data.settings.frameworkIds.includes(framework.id))
    .flatMap((framework) =>
      framework.controls.map((control) => ({
        id: control.id,
        frameworkId: framework.id,
        ref: control.requirementIds.map((requirementId) => framework.requirements.find((entry) => entry.id === requirementId)?.ref ?? requirementId).join(", "),
        title: control.title,
      })),
    );
  const adopted = data.settings.adoptedControlIds ?? [];
  const baselineRecorded = adopted.length > 0;
  const adoptedSet = new Set(adopted);
  const librarySet = new Set(library.map((control) => control.id));
  const added = baselineRecorded ? library.filter((control) => !adoptedSet.has(control.id)) : [];
  const withRecords = new Set([...data.controls.map((control) => control.id), ...data.evidence.flatMap((item) => item.controlIds)]);
  const removed = adopted.filter((id) => !librarySet.has(id)).map((id) => ({ id, hasRecords: withRecords.has(id) }));
  return {
    fromVersion: data.settings.libraryVersion,
    toVersion: currentVersion,
    upToDate: baselineRecorded && added.length === 0 && removed.length === 0 && data.settings.libraryVersion === currentVersion,
    baselineRecorded,
    added,
    removed,
    unchanged: library.length - added.length,
  };
}

export function effectiveControls(data: ProgramData, now = new Date()): EffectiveControl[] {
  const stored = new Map(data.controls.map((control) => [control.id, control]));
  return data.settings.frameworkIds.flatMap((frameworkId) => {
    const framework = getFramework(frameworkId);
    if (!framework) return [];
    const adopted = data.settings.adoptedControlIds?.length ? new Set(data.settings.adoptedControlIds) : null;
    return framework.controls.filter((libraryControl) => !adopted || adopted.has(libraryControl.id)).map((libraryControl) => {
      const record = stored.get(libraryControl.id);
      const storedStatus: ControlStatus = record?.status ?? "not_started";
      const linked = data.evidence.filter((item) => item.controlIds.includes(libraryControl.id));
      return {
        id: libraryControl.id,
        frameworkId,
        title: libraryControl.title,
        description: libraryControl.description,
        category: libraryControl.category,
        requirementRefs: libraryControl.requirementIds.map(
          (requirementId) => framework.requirements.find((entry) => entry.id === requirementId)?.ref ?? requirementId,
        ),
        suggestedEvidence: libraryControl.suggestedEvidence,
        ownerEmail: record?.ownerEmail ?? "",
        storedStatus,
        status: deriveControlStatus({ id: libraryControl.id, status: storedStatus }, data.evidence, now),
        naJustification: record?.naJustification ?? "",
        notes: record?.notes ?? "",
        evidenceCount: linked.length,
        currentEvidenceCount: linked.filter((item) => evidenceSupportsControls(item) && isEvidenceCurrent(evidenceFreshness(item, now))).length,
      };
    });
  });
}

export type Readiness = {
  controls: { total: number; applicable: number; implemented: number; coveragePercent: number; byStatus: Record<ControlStatus, number> };
  evidence: { total: number; fresh: number; expiringSoon: number; expired: number; freshnessPercent: number };
  risks: { open: number; highOrCritical: number; unowned: number };
  policies: { total: number; approved: number; acknowledgementPercent: number };
  vendors: { total: number; overdue: number };
};

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function computeReadiness(data: ProgramData, now = new Date()): Readiness {
  const controls = effectiveControls(data, now);
  const byStatus = Object.fromEntries(CONTROL_STATUSES.map((status) => [status, 0])) as Record<ControlStatus, number>;
  for (const control of controls) byStatus[control.status] += 1;
  const applicable = controls.length - byStatus.not_applicable;

  const freshness = data.evidence.map((item) => evidenceFreshness(item, now));
  const fresh = freshness.filter((value) => value === "fresh" || value === "no_expiry").length;
  const expiringSoon = freshness.filter((value) => value === "expiring_soon").length;
  const expired = freshness.filter((value) => value === "expired").length;

  const openRisks = data.risks.filter((risk) => risk.status === "open");
  const approvedPolicies = data.policies.filter((policy) => currentApprovedVersion(policy));
  let acked = 0;
  let expected = 0;
  for (const policy of approvedPolicies) {
    const coverage = acknowledgementCoverage(policy, data.memberEmails);
    acked += coverage.acknowledged;
    expected += coverage.total;
  }

  return {
    controls: {
      total: controls.length,
      applicable,
      implemented: byStatus.implemented,
      coveragePercent: percent(byStatus.implemented, applicable),
      byStatus,
    },
    evidence: {
      total: data.evidence.length,
      fresh,
      expiringSoon,
      expired,
      // Expiring-soon evidence is still current, so it counts towards freshness.
      freshnessPercent: percent(fresh + expiringSoon, data.evidence.length),
    },
    risks: {
      open: openRisks.length,
      highOrCritical: openRisks.filter((risk) => riskScore(risk.likelihood, risk.impact) >= 10).length,
      unowned: openRisks.filter((risk) => !risk.ownerEmail).length,
    },
    policies: {
      total: data.policies.length,
      approved: approvedPolicies.length,
      acknowledgementPercent: percent(acked, expected),
    },
    vendors: {
      total: data.vendors.length,
      overdue: data.vendors.filter((vendor) => vendorReviewOverdue(vendor, now)).length,
    },
  };
}

// ---------------------------------------------------------------- gap tasks

export type GapTask = {
  id: string;
  priority: "high" | "medium" | "low";
  area: "control" | "evidence" | "policy" | "risk" | "vendor" | "finding" | "access";
  title: string;
  detail: string;
  targetId: string;
};

/** Tasks generated from gaps in real tenant data. Deterministic ids so they can be referenced. */
export function generateGapTasks(data: ProgramData, now = new Date()): GapTask[] {
  const tasks: GapTask[] = [];
  for (const control of effectiveControls(data, now)) {
    if (control.status === "not_applicable") continue;
    if (control.status === "needs_evidence") {
      tasks.push({
        id: `control-evidence:${control.id}`,
        priority: "high",
        area: "control",
        title: `Attach current evidence to "${control.title}"`,
        detail: control.evidenceCount > 0 ? "All linked evidence has expired." : `Suggested: ${control.suggestedEvidence}.`,
        targetId: control.id,
      });
    }
    if (!control.ownerEmail) {
      tasks.push({
        id: `control-owner:${control.id}`,
        priority: "medium",
        area: "control",
        title: `Assign an owner to "${control.title}"`,
        detail: `${control.requirementRefs.join(", ")} has no accountable owner.`,
        targetId: control.id,
      });
    }
  }
  for (const item of data.evidence) {
    if (!item.reviewStatus || item.reviewStatus === "pending") {
      tasks.push({
        id: `evidence-review:${item.id}`,
        priority: "low",
        area: "evidence",
        title: `Review evidence "${item.title}"`,
        detail: `Added by ${item.createdBy}; an owner or admin should accept or reject it.`,
        targetId: item.id,
      });
    }
    if (evidenceFreshness(item, now) === "expiring_soon") {
      tasks.push({
        id: `evidence-expiring:${item.id}`,
        priority: "medium",
        area: "evidence",
        title: `Refresh "${item.title}" before it expires`,
        detail: `Expires ${evidenceExpiry(item)}.`,
        targetId: item.id,
      });
    }
  }
  for (const policy of data.policies) {
    const status = policyStatus(policy);
    if (status !== "approved") {
      tasks.push({
        id: `policy-approval:${policy.id}`,
        priority: "high",
        area: "policy",
        title: `Approve "${policy.title}"`,
        detail: status === "draft" ? "No version has been approved yet." : "A newer draft is waiting for approval.",
        targetId: policy.id,
      });
    }
    const due = policyReviewDue(policy);
    if (due && due <= today(now)) {
      tasks.push({
        id: `policy-review:${policy.id}`,
        priority: "medium",
        area: "policy",
        title: `Review "${policy.title}"`,
        detail: `Review was due ${due}.`,
        targetId: policy.id,
      });
    }
    const coverage = acknowledgementCoverage(policy, data.memberEmails);
    if (currentApprovedVersion(policy) && coverage.pending.length > 0) {
      tasks.push({
        id: `policy-ack:${policy.id}`,
        priority: "low",
        area: "policy",
        title: `Collect acknowledgements for "${policy.title}"`,
        detail: `${coverage.pending.length} of ${coverage.total} members have not acknowledged the approved version.`,
        targetId: policy.id,
      });
    }
  }
  for (const risk of data.risks) {
    if (risk.status !== "open") continue;
    const score = riskScore(risk.likelihood, risk.impact);
    if (!risk.ownerEmail) {
      tasks.push({ id: `risk-owner:${risk.id}`, priority: score >= 10 ? "high" : "medium", area: "risk", title: `Assign an owner to risk "${risk.title}"`, detail: `Score ${score}.`, targetId: risk.id });
    }
    if (score >= 10 && risk.treatment === "mitigate" && risk.controlIds.length === 0) {
      tasks.push({ id: `risk-controls:${risk.id}`, priority: "high", area: "risk", title: `Link mitigating controls to "${risk.title}"`, detail: `${riskLevel(score)} risk marked for mitigation has no linked controls.`, targetId: risk.id });
    }
  }
  for (const system of data.systems ?? []) {
    if (accessReviewDue(system, now)) {
      tasks.push({
        id: `access-review:${system.id}:${quarterOf(now)}`,
        priority: "medium",
        area: "access",
        title: `Sign off the ${quarterOf(now)} access review for ${system.name}`,
        detail: `${system.users.length} users listed${system.ownerEmail ? ` · owner ${system.ownerEmail}` : ""}.`,
        targetId: system.id,
      });
    }
  }
  for (const finding of data.findings ?? []) {
    if (findingOverdue(finding, now)) {
      tasks.push({
        id: `finding-overdue:${finding.id}`,
        priority: finding.severity === "low" ? "medium" : "high",
        area: "finding",
        title: `Remediate finding "${finding.title}"`,
        detail: `Due ${finding.dueDate}${finding.ownerEmail ? ` · ${finding.ownerEmail}` : " · no owner"}.`,
        targetId: finding.id,
      });
    } else if ((finding.status === "open" || finding.status === "in_remediation") && !finding.ownerEmail) {
      tasks.push({ id: `finding-owner:${finding.id}`, priority: "medium", area: "finding", title: `Assign an owner to finding "${finding.title}"`, detail: "Open findings need someone accountable.", targetId: finding.id });
    }
  }
  for (const vendor of data.vendors) {
    if (vendorReviewOverdue(vendor, now)) {
      tasks.push({
        id: `vendor-review:${vendor.id}`,
        priority: vendor.tier === "critical" || vendor.tier === "high" ? "high" : "low",
        area: "vendor",
        title: `Review vendor "${vendor.name}"`,
        detail: vendor.lastReviewedAt ? `Review was due ${vendorNextReview(vendor)}.` : "Never reviewed.",
        targetId: vendor.id,
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return tasks.sort((a, b) => order[a.priority] - order[b.priority]);
}

// ---------------------------------------------------------------- public trust center

export type PublicTrustCenter = {
  displayName: string;
  headline: string;
  contactEmail: string;
  frameworks: Array<{ id: string; name: string; libraryVersion: string }> | null;
  readiness: { coveragePercent: number; applicableControls: number; freshnessPercent: number } | null;
  categories: Array<{ framework: string; category: string; implemented: number; applicable: number }> | null;
  policies: Array<{ id: string; title: string; version: number; approvedAt: string }>;
};

/** Projects tenant data down to ONLY what admins chose to publish. Returns null when unpublished. */
export function buildPublicTrustCenter(data: ProgramData, now = new Date()): PublicTrustCenter | null {
  const settings = data.settings.trustCenter;
  if (!settings.published) return null;
  const controls = effectiveControls(data, now);
  const readiness = settings.showReadiness ? computeReadiness(data, now) : null;
  let categories: PublicTrustCenter["categories"] = null;
  if (settings.showControlCategories) {
    const map = new Map<string, { framework: string; category: string; implemented: number; applicable: number }>();
    for (const control of controls) {
      if (control.status === "not_applicable") continue;
      const framework = getFramework(control.frameworkId)?.name ?? control.frameworkId;
      const key = `${framework}::${control.category}`;
      const entry = map.get(key) ?? { framework, category: control.category, implemented: 0, applicable: 0 };
      entry.applicable += 1;
      if (control.status === "implemented") entry.implemented += 1;
      map.set(key, entry);
    }
    categories = [...map.values()];
  }
  const policies = data.policies
    .filter((policy) => settings.publishedPolicyIds.includes(policy.id))
    .flatMap((policy) => {
      const approved = currentApprovedVersion(policy);
      return approved?.approvedAt
        ? [{ id: policy.id, title: policy.title, version: approved.version, approvedAt: approved.approvedAt.slice(0, 10) }]
        : [];
    });
  return {
    displayName: settings.displayName,
    headline: settings.headline,
    contactEmail: settings.contactEmail,
    frameworks: settings.showFrameworks
      ? data.settings.frameworkIds.flatMap((id) => {
          const framework = getFramework(id);
          return framework ? [{ id, name: framework.name, libraryVersion: data.settings.libraryVersion }] : [];
        })
      : null,
    readiness: readiness
      ? {
          coveragePercent: readiness.controls.coveragePercent,
          applicableControls: readiness.controls.applicable,
          freshnessPercent: readiness.evidence.freshnessPercent,
        }
      : null,
    categories,
    policies,
  };
}
