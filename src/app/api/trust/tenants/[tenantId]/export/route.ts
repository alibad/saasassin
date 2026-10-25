import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError, requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { loadProgram, TRUST } from "@/lib/trust/data";
import { buildEvidencePackage, buildProgramExport } from "@/lib/trust/export";
import { getFramework } from "@/lib/trust/frameworks";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    const { tenant } = await requireTenantMember(TRUST, tenantId, user);
    const program = await loadProgram(tenantId);
    const packageFramework = new URL(request.url).searchParams.get("package");
    const stamp = new Date().toISOString().slice(0, 10);

    if (packageFramework) {
      const framework = getFramework(packageFramework);
      if (!framework || !program.settings.frameworkIds.includes(framework.id)) {
        throw new FleetError("That framework is not part of this program.", 400);
      }
      const body = buildEvidencePackage(program, framework.id, {
        tenantId,
        tenantName: tenant.name,
        exportedBy: user.email,
      });
      return new Response(JSON.stringify(toPortable(body), null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="trust-${framework.id}-evidence-package-${stamp}.json"`,
        },
      });
    }

    const [members, audit] = await Promise.all([
      listTenantMembers(TRUST, tenantId),
      listAuditEvents(TRUST, tenantId, 1000),
    ]);
    const files = buildProgramExport(program, { members, audit });
    const body = {
      manifest: buildExportManifest(
        TRUST,
        tenantId,
        files.map(({ path, schema, records }) => ({ path, schema, records: records.length })),
      ),
      tenant: { id: tenantId, name: tenant.name },
      files: Object.fromEntries(
        files.map((file) => [file.path, { schema: file.schema, records: toPortable(file.records) }]),
      ),
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="trust-export-${stamp}.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
