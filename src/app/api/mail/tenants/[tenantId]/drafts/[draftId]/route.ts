import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { audit, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; draftId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const ref = mailCollection(context.tenantId, "drafts").doc(draftId);
    if (!(await ref.get()).exists) throw new FleetError("Draft not found.", 404);
    await ref.delete();
    await audit(context, "draft.discarded", { type: "draft", id: draftId });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
