import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError, requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { applyTrustAction, loadProgram, TRUST } from "@/lib/trust/data";
import { CONTROL_LIBRARY_VERSION, FRAMEWORKS } from "@/lib/trust/frameworks";
import {
  computeReadiness,
  effectiveControls,
  evidenceExpiry,
  evidenceFreshness,
  generateGapTasks,
  policyReviewDue,
  policyStatus,
  riskLevel,
  riskScore,
  vendorNextReview,
  vendorReviewOverdue,
} from "@/lib/trust/model";
import { POLICY_TEMPLATES } from "@/lib/trust/policy-templates";
import { roleCanPerform, trustActionSchema } from "@/lib/trust/schemas";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    const { tenant, role } = await requireTenantMember(TRUST, tenantId, user);
    const [program, members, audit] = await Promise.all([
      loadProgram(tenantId),
      listTenantMembers(TRUST, tenantId),
      listAuditEvents(TRUST, tenantId, 100),
    ]);
    const now = new Date();
    return Response.json({
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
      readiness: computeReadiness(program, now),
      tasks: generateGapTasks(program, now),
      controls: effectiveControls(program, now),
      evidence: program.evidence.map((item) => ({
        ...item,
        freshness: evidenceFreshness(item, now),
        expiry: evidenceExpiry(item),
      })),
      policies: program.policies.map((policy) => ({
        ...policy,
        status: policyStatus(policy),
        reviewDue: policyReviewDue(policy),
      })),
      risks: program.risks.map((risk) => {
        const score = riskScore(risk.likelihood, risk.impact);
        return { ...risk, score, level: riskLevel(score) };
      }),
      vendors: program.vendors.map((vendor) => ({
        ...vendor,
        nextReview: vendorNextReview(vendor),
        overdue: vendorReviewOverdue(vendor, now),
      })),
      members: members.filter((member) => member.status === "active"),
      audit,
    });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    const { role } = await requireTenantMember(TRUST, tenantId, user);
    const input = trustActionSchema.parse(await request.json());
    if (!roleCanPerform(role, input.action)) {
      throw new FleetError("Your role does not allow this action.", 403);
    }
    return Response.json(await applyTrustAction(tenantId, user, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
