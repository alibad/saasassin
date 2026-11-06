import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { discardDraft } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; draftId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    await discardDraft(context, draftId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
