import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES, scheduleSchema } from "@/lib/mail/schema";
import { cancelScheduledDraft, scheduleDraft } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; draftId: string }> };

/** Send later: queues the draft for a time (nothing is sent while no provider is configured). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { at } = scheduleSchema.parse(await request.json());
    return Response.json({ draft: await scheduleDraft(context, draftId, at) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Cancels the schedule; the draft stays in Drafts. */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json({ draft: await cancelScheduledDraft(context, draftId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
