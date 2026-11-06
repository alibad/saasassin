import { fleetApiError } from "@/lib/fleet/platform/http";
import { draftSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { saveDraft } from "@/lib/mail/service";
import { listDrafts, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json({ drafts: await listDrafts(context.tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Creates or updates a reply/compose draft. */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { draft, created } = await saveDraft(context, draftSchema.parse(await request.json()));
    return Response.json({ draft }, { status: created ? 201 : 200 });
  } catch (error) {
    return fleetApiError(error);
  }
}
