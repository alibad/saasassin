import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES, threadActionSchema } from "@/lib/mail/schema";
import { actOnThread, getThread } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; threadId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { threadId } = await params;
    const context = await mailContext(params);
    return Response.json(await getThread(context, threadId));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Applies one triage action (archive, trash, star, read, snooze, label, follow-up reminder, mute). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { threadId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { action } = threadActionSchema.parse(await request.json());
    return Response.json({ thread: await actOnThread(context, threadId, action) });
  } catch (error) {
    return fleetApiError(error);
  }
}
