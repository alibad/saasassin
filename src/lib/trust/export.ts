/** Export mapping for SaaSassin Trust. Pure, so the schema shape is unit-testable. */

import { CONTROL_LIBRARY_VERSION, getFramework, type FrameworkId } from "./frameworks";
import {
  computeReadiness,
  effectiveControls,
  evidenceExpiry,
  evidenceFreshness,
  riskLevel,
  riskScore,
  type ProgramData,
} from "./model";

export const TRUST_EXPORT_SCHEMA_VERSION = "1.0.0";

export type ExportFile = { path: string; schema: string; records: unknown[] };

const schema = (name: string) => `net.saasassin.trust.${name}@${TRUST_EXPORT_SCHEMA_VERSION}`;

export function buildProgramExport(
  program: ProgramData,
  extra: { members: unknown[]; audit: unknown[] },
  now = new Date(),
): ExportFile[] {
  return [
    { path: "program.json", schema: schema("program"), records: [{ ...program.settings, controlLibraryVersion: CONTROL_LIBRARY_VERSION }] },
    { path: "controls.json", schema: schema("control"), records: effectiveControls(program, now) },
    {
      path: "evidence.json",
      schema: schema("evidence"),
      records: program.evidence.map((item) => ({ ...item, expiry: evidenceExpiry(item), freshness: evidenceFreshness(item, now) })),
    },
    { path: "policies.json", schema: schema("policy"), records: program.policies },
    {
      path: "risks.json",
      schema: schema("risk"),
      records: program.risks.map((risk) => {
        const score = riskScore(risk.likelihood, risk.impact);
        return { ...risk, score, level: riskLevel(score) };
      }),
    },
    { path: "vendors.json", schema: schema("vendor"), records: program.vendors },
    { path: "audit-periods.json", schema: schema("audit-period"), records: program.auditPeriods ?? [] },
    { path: "findings.json", schema: schema("finding"), records: program.findings ?? [] },
    { path: "members.json", schema: schema("member"), records: extra.members },
    { path: "audit-events.json", schema: schema("audit-event"), records: extra.audit },
  ];
}

/**
 * Audit-ready evidence package for one framework: every requirement, the controls mapped to it,
 * their effective status and owner, and the evidence (with collection date and expiry) behind each.
 * This organises the team's own records; it is not an auditor's opinion.
 */
export function buildEvidencePackage(
  program: ProgramData,
  frameworkId: FrameworkId,
  meta: { tenantId: string; tenantName: string; exportedBy: string },
  now = new Date(),
) {
  const framework = getFramework(frameworkId);
  if (!framework) throw new Error(`Unknown framework ${frameworkId}`);
  const controls = effectiveControls(program, now).filter((control) => control.frameworkId === frameworkId);
  const evidenceFor = (controlId: string) =>
    program.evidence
      .filter((item) => item.controlIds.includes(controlId))
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        kind: item.kind,
        url: item.url,
        text: item.text,
        collectedAt: item.collectedAt,
        expiry: evidenceExpiry(item),
        freshness: evidenceFreshness(item, now),
        addedBy: item.createdBy,
        addedAt: item.createdAt,
        review: {
          status: item.reviewStatus ?? "pending",
          reviewedBy: item.reviewedBy || null,
          reviewedAt: item.reviewedAt || null,
          note: item.reviewNote || null,
        },
      }));
  const readiness = computeReadiness({ ...program, settings: { ...program.settings, frameworkIds: [frameworkId] } }, now);

  return {
    schema: schema("evidence-package"),
    generatedAt: now.toISOString(),
    tenant: { id: meta.tenantId, name: meta.tenantName },
    exportedBy: meta.exportedBy,
    framework: { id: framework.id, name: framework.name, libraryVersion: framework.version, disclaimer: framework.disclaimer },
    notice:
      "Readiness and evidence tracking only. This package organises the team's own records and is not an audit opinion, certification, or attestation.",
    summary: {
      coveragePercent: readiness.controls.coveragePercent,
      applicableControls: readiness.controls.applicable,
      implementedControls: readiness.controls.implemented,
      byStatus: readiness.controls.byStatus,
    },
    requirements: framework.requirements.map((requirement) => ({
      ref: requirement.ref,
      category: requirement.category,
      paraphrase: requirement.title,
      controls: controls
        .filter((control) => getFramework(frameworkId)!.controls.find((entry) => entry.id === control.id)?.requirementIds.includes(requirement.id))
        .map((control) => ({
          id: control.id,
          title: control.title,
          description: control.description,
          status: control.status,
          owner: control.ownerEmail || null,
          notApplicableJustification: control.status === "not_applicable" ? control.naJustification : null,
          notes: control.notes,
          evidence: evidenceFor(control.id),
          findings: (program.findings ?? [])
            .filter((finding) => finding.controlIds.includes(control.id))
            .map(({ id, title, severity, status, dueDate, remediation }) => ({ id, title, severity, status, dueDate, remediation })),
        })),
    })),
  };
}
