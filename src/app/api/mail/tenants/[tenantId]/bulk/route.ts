import { fleetApiError } from "@/lib/fleet/platform/http";
import { bulkActionSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { bulkAct } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

/** Archive, trash, restore, star, mark read or label many threads at once (undoable). */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json(await bulkAct(context, bulkActionSchema.parse(await request.json())));
  } catch (error) {
    return fleetApiError(error);
  }
}
