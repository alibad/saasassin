import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { audit, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; splitId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { splitId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const ref = mailCollection(context.tenantId, "splits").doc(splitId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new FleetError("Split not found.", 404);
    await ref.delete();
    await audit(context, "split.deleted", { type: "split", id: splitId }, { name: snapshot.get("name") });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
