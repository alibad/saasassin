import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { reindexSearch } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export const maxDuration = 60;

/** Builds the search index for mail imported before it existed (audited). */
export async function POST(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json({ result: await reindexSearch(context) });
  } catch (error) {
    return fleetApiError(error);
  }
}
