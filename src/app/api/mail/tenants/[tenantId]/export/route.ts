import { fleetApiError } from "@/lib/fleet/platform/http";
import { buildMailExport } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

/** Complete, versioned JSON export of the tenant mailbox. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    const body = await buildMailExport(context);
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
