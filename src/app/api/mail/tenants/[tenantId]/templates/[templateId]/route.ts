import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { deleteTemplate } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; templateId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    await deleteTemplate(context, templateId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
