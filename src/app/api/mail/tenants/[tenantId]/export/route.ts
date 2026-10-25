import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { MAIL_EXPORT_SCHEMA, MAIL_EXPORT_VERSION, MAIL_PRODUCT } from "@/lib/mail/schema";
import { mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

const COLLECTIONS = ["threads", "messages", "drafts", "splits", "templates", "importRuns", "settings"] as const;

/** Complete, versioned JSON export of the tenant mailbox. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    const data: Record<string, unknown[]> = {};
    for (const name of COLLECTIONS) {
      const snapshot = await mailCollection(context.tenantId, name).get();
      data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }));
    }
    data.members = (await listTenantMembers(MAIL_PRODUCT, context.tenantId)).map((member) => toPortable(member));
    data.auditEvents = await listAuditEvents(MAIL_PRODUCT, context.tenantId, 1000);
    const files = Object.entries(data).map(([name, records]) => ({
      path: `${name}.json`,
      schema: `${MAIL_EXPORT_SCHEMA}.${name}@${MAIL_EXPORT_VERSION}`,
      records: records.length,
    }));
    const body = { manifest: buildExportManifest(MAIL_PRODUCT, context.tenantId, files), data };
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="saasassin-mail-${context.tenantId}-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
