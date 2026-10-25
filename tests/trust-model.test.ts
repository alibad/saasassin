import { describe, expect, it } from "vitest";

import { buildEvidencePackage, buildProgramExport } from "../src/lib/trust/export";
import { CONTROL_LIBRARY_VERSION, FRAMEWORKS, getFramework } from "../src/lib/trust/frameworks";
import {
  acknowledgementCoverage,
  buildPublicTrustCenter,
  computeReadiness,
  DEFAULT_TRUST_CENTER,
  deriveControlStatus,
  evidenceExpiry,
  evidenceFreshness,
  generateGapTasks,
  policyStatus,
  riskLevel,
  riskScore,
  vendorReviewOverdue,
  type EvidenceRecord,
  type PolicyRecord,
  type ProgramData,
} from "../src/lib/trust/model";
import { POLICY_TEMPLATES } from "../src/lib/trust/policy-templates";
import { roleCanPerform, trustActionSchema } from "../src/lib/trust/schemas";

const NOW = new Date("2026-10-26T12:00:00Z");

function evidence(partial: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: "ev",
    title: "Evidence",
    description: "",
    kind: "link",
    url: "https://example.com",
    text: "",
    controlIds: [],
    collectedAt: "2026-10-01",
    cadence: "annual",
    expiresAt: "",
    createdAt: "2026-10-01T00:00:00Z",
    createdBy: "a@example.com",
    ...partial,
  };
}

function program(partial: Partial<ProgramData> = {}): ProgramData {
  return {
    settings: { frameworkIds: ["soc2"], libraryVersion: CONTROL_LIBRARY_VERSION, trustCenter: { ...DEFAULT_TRUST_CENTER } },
    controls: [],
    evidence: [],
    policies: [],
    risks: [],
    vendors: [],
    memberEmails: ["owner@example.com", "dev@example.com"],
    ...partial,
  };
}

describe("framework library integrity", () => {
  it("has globally unique requirement and control ids", () => {
    const ids = FRAMEWORKS.flatMap((framework) => [...framework.requirements.map((r) => r.id), ...framework.controls.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every control to an existing requirement and covers every requirement", () => {
    for (const framework of FRAMEWORKS) {
      const requirementIds = new Set(framework.requirements.map((r) => r.id));
      for (const control of framework.controls) {
        expect(control.requirementIds.length).toBeGreaterThan(0);
        for (const id of control.requirementIds) expect(requirementIds.has(id)).toBe(true);
      }
      for (const requirement of framework.requirements) {
        expect(framework.controls.some((control) => control.requirementIds.includes(requirement.id))).toBe(true);
      }
    }
  });

  it("covers SOC 2 common criteria series CC1 through CC9 and is versioned", () => {
    const soc2 = getFramework("soc2")!;
    for (let series = 1; series <= 9; series += 1) {
      expect(soc2.requirements.some((r) => r.ref.startsWith(`CC${series}.`))).toBe(true);
    }
    for (const framework of FRAMEWORKS) {
      expect(framework.version).toBe(CONTROL_LIBRARY_VERSION);
      expect(framework.disclaimer).toMatch(/not the official/i);
    }
  });

  it("ships unique policy templates", () => {
    const ids = POLICY_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["access-control", "incident-response"]));
  });
});

describe("evidence expiry", () => {
  it("derives expiry from the review cadence", () => {
    expect(evidenceExpiry(evidence({ collectedAt: "2026-01-01", cadence: "quarterly" }))).toBe("2026-04-02");
    expect(evidenceExpiry(evidence({ cadence: "none" }))).toBeNull();
    expect(evidenceExpiry(evidence({ expiresAt: "2026-12-31", cadence: "monthly" }))).toBe("2026-12-31");
  });

  it("classifies fresh, expiring soon, expired and no-expiry evidence", () => {
    expect(evidenceFreshness(evidence({ collectedAt: "2026-10-01", cadence: "annual" }), NOW)).toBe("fresh");
    expect(evidenceFreshness(evidence({ collectedAt: "2026-10-01", cadence: "monthly" }), NOW)).toBe("expiring_soon");
    expect(evidenceFreshness(evidence({ collectedAt: "2025-01-01", cadence: "annual" }), NOW)).toBe("expired");
    expect(evidenceFreshness(evidence({ expiresAt: "2026-10-26" }), NOW)).toBe("expired");
    expect(evidenceFreshness(evidence({ cadence: "none" }), NOW)).toBe("no_expiry");
  });
});

describe("control status derivation", () => {
  const control = { id: "soc2.ctl.cc6-1", status: "implemented" as const };

  it("requires current evidence before a control counts as implemented", () => {
    expect(deriveControlStatus(control, [], NOW)).toBe("needs_evidence");
    expect(deriveControlStatus(control, [evidence({ controlIds: [control.id] })], NOW)).toBe("implemented");
  });

  it("falls back to needs evidence when all linked evidence has expired", () => {
    const expired = evidence({ controlIds: [control.id], collectedAt: "2024-01-01" });
    expect(deriveControlStatus(control, [expired], NOW)).toBe("needs_evidence");
    expect(deriveControlStatus({ ...control, status: "in_progress" }, [expired], NOW)).toBe("needs_evidence");
    expect(deriveControlStatus(control, [expired, evidence({ controlIds: [control.id] })], NOW)).toBe("implemented");
  });

  it("ignores evidence for other controls and keeps not applicable", () => {
    expect(deriveControlStatus({ ...control, status: "not_started" }, [evidence({ controlIds: ["other"], collectedAt: "2020-01-01" })], NOW)).toBe("not_started");
    expect(deriveControlStatus({ ...control, status: "not_applicable" }, [], NOW)).toBe("not_applicable");
  });
});

describe("risk scoring", () => {
  it("multiplies likelihood by impact and clamps to 1–5", () => {
    expect(riskScore(3, 4)).toBe(12);
    expect(riskScore(9, 0)).toBe(5);
  });

  it("bands scores into levels", () => {
    expect(riskLevel(4)).toBe("low");
    expect(riskLevel(5)).toBe("medium");
    expect(riskLevel(10)).toBe("high");
    expect(riskLevel(16)).toBe("critical");
    expect(riskLevel(25)).toBe("critical");
  });
});

describe("readiness math", () => {
  it("computes coverage over applicable controls only", () => {
    const soc2 = getFramework("soc2")!;
    const [first, second, third] = soc2.controls;
    const data = program({
      controls: [
        { id: first.id, frameworkId: "soc2", ownerEmail: "a@example.com", status: "implemented", naJustification: "", notes: "", updatedAt: "", updatedBy: "" },
        { id: second.id, frameworkId: "soc2", ownerEmail: "", status: "not_applicable", naJustification: "No offices at all", notes: "", updatedAt: "", updatedBy: "" },
        { id: third.id, frameworkId: "soc2", ownerEmail: "", status: "implemented", naJustification: "", notes: "", updatedAt: "", updatedBy: "" },
      ],
      evidence: [
        evidence({ id: "e1", controlIds: [first.id] }),
        evidence({ id: "e2", controlIds: [third.id], collectedAt: "2024-01-01" }),
      ],
      risks: [
        { id: "r1", title: "Laptop theft", description: "", likelihood: 4, impact: 4, treatment: "mitigate", treatmentPlan: "", ownerEmail: "", status: "open", controlIds: [], createdAt: "", updatedAt: "" },
        { id: "r2", title: "Closed", description: "", likelihood: 5, impact: 5, treatment: "accept", treatmentPlan: "", ownerEmail: "a@example.com", status: "closed", controlIds: [], createdAt: "", updatedAt: "" },
      ],
    });
    const readiness = computeReadiness(data, NOW);
    expect(readiness.controls.total).toBe(soc2.controls.length);
    expect(readiness.controls.applicable).toBe(soc2.controls.length - 1);
    expect(readiness.controls.implemented).toBe(1);
    expect(readiness.controls.byStatus.needs_evidence).toBe(1);
    expect(readiness.controls.coveragePercent).toBe(Math.round((1 / (soc2.controls.length - 1)) * 100));
    expect(readiness.evidence).toMatchObject({ total: 2, fresh: 1, expired: 1, freshnessPercent: 50 });
    expect(readiness.risks).toEqual({ open: 1, highOrCritical: 1, unowned: 1 });

    const tasks = generateGapTasks(data, NOW);
    expect(tasks[0].priority).toBe("high");
    expect(tasks.some((task) => task.id === `control-evidence:${third.id}`)).toBe(true);
    expect(tasks.some((task) => task.id === "risk-controls:r1")).toBe(true);
    expect(tasks.some((task) => task.id === `control-owner:${second.id}`)).toBe(false);
  });

  it("returns zero percentages for an empty program instead of dividing by zero", () => {
    const readiness = computeReadiness(program({ settings: { ...program().settings, frameworkIds: [] } }), NOW);
    expect(readiness.controls.coveragePercent).toBe(0);
    expect(readiness.evidence.freshnessPercent).toBe(0);
  });
});

describe("policies", () => {
  const policy: PolicyRecord = {
    id: "p1",
    title: "Access control policy",
    templateId: "access-control",
    ownerEmail: "",
    reviewCadence: "annual",
    versions: [
      { version: 1, body: "v1", createdAt: "", createdBy: "", approvedAt: "2026-01-01T00:00:00Z", approvedBy: "owner@example.com" },
      { version: 2, body: "v2", createdAt: "", createdBy: "", approvedAt: null, approvedBy: null },
    ],
    acknowledgements: [{ email: "dev@example.com", version: 1, acknowledgedAt: "" }],
    createdAt: "",
  };

  it("tracks approval state and acknowledgements against the approved version", () => {
    expect(policyStatus(policy)).toBe("revision_pending");
    expect(policyStatus({ versions: [policy.versions[1]] })).toBe("draft");
    expect(acknowledgementCoverage(policy, ["owner@example.com", "DEV@example.com"])).toEqual({
      acknowledged: 1,
      total: 2,
      pending: ["owner@example.com"],
    });
  });
});

describe("vendors, trust center and export", () => {
  it("flags overdue vendor reviews", () => {
    expect(vendorReviewOverdue({ lastReviewedAt: "2025-01-01", reviewCadence: "annual" }, NOW)).toBe(true);
    expect(vendorReviewOverdue({ lastReviewedAt: "2026-06-01", reviewCadence: "annual" }, NOW)).toBe(false);
    expect(vendorReviewOverdue({ lastReviewedAt: "", reviewCadence: "annual" }, NOW)).toBe(true);
  });

  it("publishes only what admins selected", () => {
    const base = program({
      policies: [
        { id: "p1", title: "Public", templateId: "", ownerEmail: "", reviewCadence: "annual", versions: [{ version: 1, body: "secret body", createdAt: "", createdBy: "", approvedAt: "2026-05-01T00:00:00Z", approvedBy: "x" }], acknowledgements: [], createdAt: "" },
        { id: "p2", title: "Private", templateId: "", ownerEmail: "", reviewCadence: "annual", versions: [{ version: 1, body: "b", createdAt: "", createdBy: "", approvedAt: "2026-05-01T00:00:00Z", approvedBy: "x" }], acknowledgements: [], createdAt: "" },
      ],
    });
    expect(buildPublicTrustCenter(base, NOW)).toBeNull();
    const published = buildPublicTrustCenter(
      { ...base, settings: { ...base.settings, trustCenter: { ...DEFAULT_TRUST_CENTER, published: true, showFrameworks: false, publishedPolicyIds: ["p1"] } } },
      NOW,
    )!;
    expect(published.frameworks).toBeNull();
    expect(published.readiness).toBeNull();
    expect(published.categories).toBeNull();
    expect(published.policies.map((policy) => policy.title)).toEqual(["Public"]);
    expect(JSON.stringify(published)).not.toContain("secret body");
  });

  it("exports every collection with a versioned schema and builds a framework evidence package", () => {
    const soc2 = getFramework("soc2")!;
    const data = program({ evidence: [evidence({ controlIds: [soc2.controls[0].id] })] });
    const files = buildProgramExport(data, { members: [], audit: [] }, NOW);
    expect(files.map((file) => file.path)).toEqual([
      "program.json",
      "controls.json",
      "evidence.json",
      "policies.json",
      "risks.json",
      "vendors.json",
      "members.json",
      "audit-events.json",
    ]);
    for (const file of files) expect(file.schema).toMatch(/^net\.saasassin\.trust\.[a-z-]+@1\.0\.0$/);
    const pack = buildEvidencePackage(data, "soc2", { tenantId: "t", tenantName: "Acme", exportedBy: "a@example.com" }, NOW);
    expect(pack.requirements).toHaveLength(soc2.requirements.length);
    expect(pack.requirements[0].controls[0].evidence).toHaveLength(1);
    expect(pack.notice).toMatch(/not an audit opinion/);
  });
});

describe("action validation and roles", () => {
  it("validates actions and keeps viewers read-only", () => {
    expect(() => trustActionSchema.parse({ action: "saveRisk", title: "X", likelihood: 6, impact: 1, treatment: "mitigate" })).toThrow();
    expect(trustActionSchema.parse({ action: "acknowledgePolicy", policyId: "p1" }).action).toBe("acknowledgePolicy");
    expect(roleCanPerform("viewer", "addEvidence")).toBe(false);
    expect(roleCanPerform("viewer", "acknowledgePolicy")).toBe(true);
    expect(roleCanPerform("member", "addEvidence")).toBe(true);
    expect(roleCanPerform("member", "approvePolicy")).toBe(false);
    expect(roleCanPerform("admin", "saveTrustCenter")).toBe(true);
  });
});
