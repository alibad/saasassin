import { fleetApiError } from "@/lib/fleet/platform/http";
import { searchMailbox } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

/** Full-text search over the tenant's imported mailbox. */
export async function GET(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json(await searchMailbox(context, new URL(request.url).searchParams.get("q") ?? ""));
  } catch (error) {
    return fleetApiError(error);
  }
}
