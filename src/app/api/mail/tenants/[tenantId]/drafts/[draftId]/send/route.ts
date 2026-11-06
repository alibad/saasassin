import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { sendDraft } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; draftId: string }> };

/** Sending goes through a provider adapter; with none configured the attempt is recorded and refused (409). */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    await sendDraft(context, draftId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
