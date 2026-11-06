import { fleetApiError } from "@/lib/fleet/platform/http";
import { filterDraftSchema } from "@/lib/mail/schema";
import { previewFilter } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

/** Read-only: tests an unsaved rule's conditions against the mail already in the workspace. */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json({ preview: await previewFilter(context, filterDraftSchema.parse(await request.json())) });
  } catch (error) {
    return fleetApiError(error);
  }
}
